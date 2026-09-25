# Plano: exportar NF-e (XML/PDF) para a contabilidade

## Situação atual (levantada no código)
- A NF-e fica gravada dentro do pedido (`SaleOrderLinkedNfe` em `types.ts`): número, série, chave, status, `nfeXmlUrl`, `nfeDanfeUrl` e o id na NotaAs.
- XML e DANFE **não ficam guardados com a gente**: são baixados sob demanda da NotaAs por `api/nfe/xml.ts` (inclusive o XML de cancelamento com `type=cancel`) e `api/nfe/danfe.ts`.
- Não há hoje exportação em lote, nem ZIP, nem envio agendado.
- A NF-e **não usa a tag `autXML`** (autorizar o CPF/CNPJ do contador a baixar o XML direto da SEFAZ).
- As funções da Vercel têm limite de 30s (`maxDuration`), então gerar um ZIP de centenas de notas numa requisição só vai estourar o tempo.

## O que a contabilidade precisa receber
Por mês e por filial (CNPJ):
1. XML de todas as notas **autorizadas** (o XML é o documento legal; o PDF é só uma representação).
2. XML das **canceladas** (NF-e + evento de cancelamento) e das cartas de correção, se houver.
3. Lista das **inutilizações** de numeração, se houver.
4. Uma planilha resumo: número, série, data, chave, cliente, CFOP, valor, status.
5. O PDF (DANFE) é opcional: tem contador que pede, mas a maioria importa só XML.

---

## Soluções possíveis

### A. Botão "Exportar para contabilidade" (mais rápido de entregar)
Tela Fiscal → escolher **período, filial e status** → baixar **um ZIP** com:
```
NFe_2026-08_CNPJ12345678000190/
  autorizadas/xml/   35260812...-nfe.xml
  autorizadas/pdf/   35260812...-danfe.pdf   (opcional)
  canceladas/        ...-nfe.xml  ...-cancelamento.xml
  resumo.csv         (abre no Excel)
  LEIA-ME.txt        (totais e conferência)
```
- Montado **no navegador** com JSZip: busca os arquivos pelas rotas que já existem, 4 por vez, com barra de progresso. Assim não esbarra no limite de 30s.
- Mostra antes o que vai sair: quantidade de notas, valor total e as que falharam, que podem ser tentadas de novo.
- Esforço: 1–2 dias. Não depende de backend novo.
- Limite: depende da NotaAs estar no ar e da aba ficar aberta.

### B. Arquivo próprio no Supabase Storage (base recomendada)
Quando a nota é **autorizada** ou **cancelada** (no retorno da emissão e no webhook), salvar XML e PDF no bucket privado `nfe-arquivos/{cnpj}/{ano}/{mes}/{chave}.xml`.
- Não depende mais da NotaAs para baixar notas antigas.
- Garante a guarda por 5 anos exigida pela legislação.
- Deixa as opções A, C e D muito mais rápidas.
- Inclui um script único para buscar o histórico já emitido.
- Esforço: 2–3 dias.

### C. Envio automático mensal
Todo dia 1º (Vercel Cron), um job gera o ZIP do mês anterior de cada filial, salva no Storage e **envia ao contador**:
- por e-mail (Resend ou SMTP) com link temporário (7 dias), sem anexo pesado;
- e/ou pelo bot do Telegram, que já existe em `api/telegram`.
- Cadastro, em Configurações → Fiscal: e-mail do contador, formato (XML, XML+PDF) e dia de envio.
- Guarda um histórico de envios (quando, quantas notas, se ele baixou).
- Esforço: 2–3 dias (depois do B).

### D. Acesso próprio do contador
- Perfil **"Contabilidade"** somente leitura, com acesso só ao módulo Fiscal e à exportação. Isso reaproveita a permissão por módulo que já existe.
- Ou um **link de portal** sem login, com validade, listando os ZIPs mensais.
- Esforço: 1 dia com o perfil, 2 dias com o portal.

### E. `autXML`: o contador baixa direto da SEFAZ (quase sem código)
Incluir o CNPJ/CPF do escritório contábil na tag `autXML` de toda NF-e emitida. O sistema de escrita fiscal do contador (Domínio, Alterdata, Questor, Fortes...) passa a **puxar as notas sozinho**.
- Esforço: poucas horas (um campo na configuração fiscal + incluir no payload da NotaAs).
- Vale só para notas **novas**; o histórico continua precisando de A, B ou C.
- Conferir antes com o contador se o sistema dele faz essa captura.

### F. Recursos da própria NotaAs
Verificar no painel ou na API da NotaAs se já existe exportação em lote ou envio ao contador. Se existir, pode resolver o curto prazo sem código, mas fica fora do sistema e sem padronização por filial.

---

## Recomendação (ordem)
| Fase | Entrega | Esforço | Resultado |
|---|---|---|---|
| 0 | Pedir ao contador formato e sistema usado; ativar **E (autXML)** | horas | notas novas chegam sozinhas |
| 1 | **A — botão de exportar ZIP** (XML + PDF opcional + CSV) | 1–2 dias | resolve o fechamento deste mês |
| 2 | **B — arquivo no Supabase Storage** + busca do histórico | 2–3 dias | independência da NotaAs, guarda legal |
| 3 | **C — envio automático mensal** por e-mail/Telegram | 2–3 dias | zero trabalho manual |
| 4 | **D — perfil Contabilidade** | 1 dia | contador consulta sozinho |

## Cuidados
- **Conferência:** o `LEIA-ME.txt` deve comparar a sequência de números por série e apontar números faltando (prováveis inutilizações ou notas perdidas).
- Cancelada entra com o XML original **e** o evento de cancelamento. Rejeitada ou rascunho **não entra**.
- Separar sempre por **CNPJ da filial**: cada filial é uma escrituração.
- O bucket deve ser privado; links assinados com validade; nada público.
- Nome do arquivo pela **chave de acesso** (44 dígitos): é o que os sistemas contábeis esperam.
- Incluir também as NF-e **avulsas e de transferência**, não só as de pedido de venda. Confirmar onde cada tipo é gravado.

## Prompt para o Cursor (Fase 1)
> Crie `services/domain/nfeExport.ts` (puro, com teste) que, dada a lista de pedidos, retorna as NF-e de um período/filial/status, com os caminhos das pastas e o `resumo.csv` (separador `;`, valores em pt-BR). Depois crie `components/fiscal/ExportNfeContabilidade.tsx`: filtros de mês, filial e "incluir PDF"; prévia com contagem e total; download em ZIP usando JSZip, que busca XML via `/api/nfe/xml` (e `type=cancel` para as canceladas) e PDF via `/api/nfe/danfe`, com 4 downloads simultâneos, barra de progresso e lista de falhas com botão "tentar de novo". Adicione o teste ao script `test`. Rode `tsc` e `npm test`.
