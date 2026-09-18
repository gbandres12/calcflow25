# Fonte: plano de produto CBA Mineração (CalcFlow)

Cópia versionada para upload no TestSprite (`testsprite_bootstrap` → PRD).
Documento original: projeto Cursor `docs/plano-ui-produtos-nfe.md`.

---

# Plano: UI, produtos e notas fiscais — CBA Mineração (CalcFlow)

Plano de produto com base no código atual do repositório `calcflow25`. Sem implementação nesta passada. Público-alvo: operação de Gabriel Andres (compras em Santarém, conferência na fazenda/usina, faturamento de calcário).

## Como o app está hoje

O ERP é um SPA React (Vite) com persistência em `app_records` (Supabase) e fallback local. A navegação principal está em `components/Sidebar.tsx`. Telas relevantes:

| Área no menu | Componente realmente montado em `App.tsx` | O que faz |
| --- | --- | --- |
| Produtos & NCM | `Inventory` | Catálogo comercial + parâmetros fiscais de **minerais vendáveis** |
| Pátio, Balança & Peças | `YardManagement` | Balança/romaneio + **almoxarifado** (`StoreItem`: peças, EPI, lubrificantes) |
| Transferências | `TransferManagement` | Remessa Santarém → Fazenda Usina Matriz, conferência e integração no almoxarifado |
| Notas Fiscais | `FiscalManagement` | Fila de emissão, DANFE, NF avulsa |
| Configuração de NF-e | `FiscalConfigView` | Emitente, CFOP, observações padrão |

Há código pronto que **não entra na tela ao vivo**:

- `TransfersPage` + `TransferFromNfPanel` + `NfImportModal` + `services/nfeDocumentParser.ts` — importam XML/PDF e montam a remessa, mas `App.tsx` renderiza só `TransferManagement`, sem o painel de importação.
- `AppTopbar` (busca global de romaneio/NF/cliente) existe e **não é usado**; o header de `App.tsx` é outro, sem busca.

Dois cadastros de “produto” convivem sem vínculo:

1. `InventoryItem` (`types.ts`) — venda, estoque em tonelada, NCM/CST/CFOP, texto de `informacoesComplementares`.
2. `StoreItem` — almoxarifado da fazenda (nome, categoria, quantidade, unidade, mínimo). Sem NCM, custo, NF, fornecedor.

A transferência já nasce com origem padrão *Polo de Compras Santarém* e destino *Fazenda Usina Matriz*. Na conferência, se marcado, soma quantidade no almoxarifado pelo **nome** (case-insensitive), sem casar SKU/NCM e sem gravar chave da NF.

---

## 1. Melhorias de UI e UX (concretas, priorizadas)

### P0 — destravam o fluxo de Santarém → fazenda e o faturamento

1. **Ligar o importador na tela de Transferências**  
   Trocar o mount de `TransferManagement` por `TransfersPage` (ou embutir `TransferFromNfPanel` no header). Hoje o usuário só cadastra item a item, mesmo com XML/PDF prontos.

2. **Unificar visual das telas operacionais com o restante do produto**  
   Sidebar/dashboard usam verde floresta (`#0F5948`, `#F7F8F3`). Inventário, NF e vários modais ainda usam roxo, `rounded-[3rem]`, `font-black` e `alert()`. Alinhar tokens, botões primários e densidade para o operador não achar que “Produtos” e “Transferências” são sistemas diferentes.

3. **Corrigir atalhos quebrados da aba “Resumo & Entradas/Saídas”** (`Inventory`)  
   Compra rápida só abre se `item.id === 'britado'`; venda rápida só para o outro ramo (pensado no `moido`). Produtos novos (dolomítico, ensacado, insumos) recebem o botão de **venda** mesmo sendo matéria-prima. Substituir por ações por **tipo de item** (matéria-prima / produto acabado / insumo), não por id mágico.

4. **Copiar cláusulas fiscais do produto certo no pedido**  
   Em `SalesOrders.tsx` a NF herda `informacoesComplementares` só do calcário moído (`moidoProd`), não do item da linha. Cada linha deve puxar o texto do `productId` correspondente.

5. **Barra inferior no celular**  
   Só tem Início, Vendas, Balança, Estoque, Menu. Faltam Transferências e Notas — o dia a dia de Gabriel (XML da compra + conferência) some atrás de “Menu”. Incluir Transferências no dock; NF no menu rápido do operador autorizado.

### P1 — clareza, menos erro, menos retrabalho

6. **Usar `AppTopbar` de verdade**  
   Busca por código de remessa, chave/número de NF, cliente e produto. O sino do header atual não faz nada; o chevron de “Sair” está no lugar errado (parece menu, sai da sessão).

7. **Modais densos demais no inventário**  
   O formulário mistura comercial + 15+ campos fiscais + RTC (IBS/CBS) numa modal `max-w-2xl`. Separar: cadastro rápido (nome, SKU, categoria, unidade, preço, NCM, CST, infCpl) e “avançado fiscal” recolhido. Validar NCM com 8 dígitos (hoje aceita máscara `2517.10.00` misturada com dígitos).

8. **Lista de produtos em cartões/tabela responsiva**  
   A tabela de catálogo estoura no celular. No mobile: cards com estoque, NCM e editar. Desktop: tabela atual + coluna “tipo” (venda vs almoxarifado).

9. **Transferência: revisar antes de gravar**  
   `TransferFromNfPanel` grava a remessa `EM_TRANSITO` no `onApply`, sem conferir motorista/placa no mesmo passo nem permitir desmarcar item. Fluxo: importar → revisar linhas (quantidade, unidade, categoria, vínculo com peça já cadastrada) → confirmar. Motorista/placa devem ficar **dentro** do modal, não soltos no card.

10. **Conferência na fazenda**  
    Hoje funciona, mas o operador precisa achar o card certo. Fila “em trânsito” no topo, com código, placa, qtde de volumes e botão único *Conferir recebimento*. Integrar estoque só depois da assinatura, com resumo “X itens novos / Y somados”.

11. **Fila fiscal**  
    `FiscalManagement` mistura pedido de venda com emissão avulsa e transferência (flag `isTransferenciaEmit`). Separar abas: Vendas a faturar | Transferência entre estabelecimentos | Avulsa | Autorizadas. Mostrar rejeição (`nfeErro`) em linguagem curta, não só status.

12. **Trocar `alert`/`confirm` por toasts e diálogo do próprio app**  
    Inventário e transferências ainda usam `alert` nativo — some atrás da modal e quebra o visual.

### P2 — polish e consistência de marca

13. Nome na sidebar é **CalcFlow**; textos da empresa demo são **CalcárioFlow**; operação real é **CBA Mineração**. Marca, razão social e unidade devem vir de `Company` / config fiscal, não de constante de demo.

14. Topbar “Unidade Matriz” não troca de unidade (só label). Ou vira seletor Santarém vs Fazenda, ou some.

15. Paleta RTC (índigo) no cadastro de produto é ruído para quem só cadastra peça/óleo. Esconder RTC para categorias de almoxarifado.

16. Impressão do romaneio de transferência já existe (`PrintRomaneioModal`); oferecer PDF/WhatsApp depois da importação da NF, no mesmo fluxo.

---

## 2. Como organizar os produtos da empresa

Objetivo: uma hierarquia que o pessoal de Santarém e o da fazenda entendam, sem misturar calcário vendável com filtro de caminhão.

### Dois cadastros, um vocabulário

Manter duas **famílias** (já existem nas tabelas), mas com regras explícitas e vínculo:

| Família | Tabela / tipo | Exemplos | Onde aparece |
| --- | --- | --- | --- |
| **Comercial (minério)** | `inventory` / `InventoryItem` | Britado, moído calcítico, dolomítico, filler 50 kg, big bag | Vendas, moagem, NF-e de saída |
| **Almoxarifado (suprimento)** | `store_items` / `StoreItem` | Peças, EPI, graxa, correia, diesel de consumo interno | Pátio, transferências, manutenção |

Não jogar peça importada da NF de Santarém no catálogo de NCM de calcário. A integração atual (`handleIntegrateTransferredItemsWithStore`) já aponta para o almoxarifado — isso é o caminho certo. Completar o modelo, não fundir as tabelas.

### Campos mínimos por família

**Comercial**

- Identidade: SKU (`code`), nome de venda, categoria comercial (já há lista em `Inventory.CATEGORIES`).
- Tipo interno: `materia_prima` | `produto_acabado` | `embalagem` | `servico` — para CFOP, moagem e botões de entrada/saída.
- Estoque: quantidade, unidade comercial (`Ton`, `SC`, `BB`), estoque mínimo, **local** (pátio usina vs silo).
- Preço: venda e custo médio (custo hoje é opcional e o valor de estoque do catálogo usa preço de venda — isso distorce o KPI).
- Fiscal de saída: NCM, origem, CFOP padrão interno/interestadual, CST/CSOSN, PIS/COFINS, unidade tributável, `fatorConversao` (já no tipo, **não está no formulário**), `informacoesComplementares`, `observacoesFiscais`.
- IDs `britado` / `moido`: deixar de ser ids especiais; a moagem deve referenciar SKUs, não strings mágicas.

**Almoxarifado**

- SKU interno, nome, categoria (`Peças` | `Lubrificantes` | `EPI` | `Ferramentas` | `Insumos` | `Outros` — já usada na transferência).
- Unidade, quantidade na fazenda, mínimo.
- Código do fornecedor / `cProd` da última NF, NCM (para batimento), custo unitário, última NF e chave.
- `productId` na linha de transferência deve apontar para `StoreItem.id` quando houver match.

### Como casar item da NF com o cadastro

Na importação, nesta ordem:

1. SKU interno se o usuário já mapeou `cProd` daquele fornecedor.
2. NCM + nome normalizado (trim, sem acento, caixa baixa).
3. Nome igual ao `StoreItem` (como hoje na conferência).
4. Se não achar: criar **rascunho** no almoxarifado (`status: pendente_cadastro`) em vez de inventar estoque comercial.

Guardar um mapa simples `fornecedor + cProd → storeItemId` para as próximas notas da Casa dos Rolamentos, Amazon EPIs etc. (já aparecem no seed de `constants.tsx`).

### Categorias comerciais sugeridas (já próximas do código)

Usar as de `Inventory.tsx`, com um extra operacional:

- Calcário agrícola calcítico / dolomítico  
- Britado (matéria-prima)  
- Ensacado 50 kg / Big bag 1.000 kg  
- Insumos e sacaria  
- Serviços / fretes  
- *(não usar “Outros” como padrão de peça — peça vai para almoxarifado)*

### Locais

Dois nós bastam no primeiro recorte: **Santarém (compras / trânsito)** e **Fazenda/Usina (estoque físico)**. A remessa `EM_TRANSITO` é o estoque em viagem; `CONFERIDO_E_RECEBIDO` soma na fazenda. Não precisa de WMS.

---

## 3. Quais informações complementares da NF devem ser salvas

A SEFAZ distingue **dados adicionais do documento** (`infAdic/infCpl`, limite 5.000 caracteres) e **informação adicional do produto** (`infAdProd`, por item, ~500 caracteres). O app hoje mistura os dois: o campo do produto chama-se `informacoesComplementares` e é jogado no `infCpl` da nota.

Montagem atual em `fiscalService.buildPayload` (`services/fiscalService.ts`):

```text
order.nfeInfCpl
+ config.observacoesFiscaisPadrao
+ textos únicos dos produtos
+ Pedido/referência
+ Vendedor
+ texto de devolução ou transferência
```

Tudo concatenado com ` | `. O modal de emissão (`EmitirNfeModal`) já deixa editar o bloco e grava `nfeInfCpl` no pedido — isso deve continuar sendo a **fonte da nota emitida**.

### O que persistir (e onde)

**No produto (`InventoryItem`) — modelo / template, não o texto final da nota**

| Campo | Para quê |
| --- | --- |
| `informacoesComplementares` | Cláusula legal **deste SKU** (Convênio ICMS 100/97, diferimento RICMS/PA, insumo agro / EC 132). Continua. |
| `observacoesFiscais` | Texto interno / conferência; **não** ir automaticamente para a SEFAZ (hoje o payload não usa este campo na montagem do `infCpl` — manter assim). |
| Novo: `infAdProd` | Texto curto **por item** (PRNT, granulometria, “destinado exclusivamente à agricultura”). |
| Templates rápidos já existentes | Convênio 100/97, diferimento PA, RTC agro — virar biblioteca da empresa, editável, não só botão hardcoded. |

**Na configuração fiscal da empresa (`FiscalConfig`)**

| Campo | Para quê |
| --- | --- |
| `observacoesFiscaisPadrao` | Bloco institucional (CST 40, PIS/COFINS 07, CFEM se couber). Já existe. |
| Novo: blocos opcionais | “Operação interna PA”, “Interestadual”, “Transferência 5152/6152”, “Devolução”. Escolher por natureza da operação, não colar tudo sempre. |

**No pedido / nota (`SaleOrder`) — o que de fato saiu (ou vai sair) no XML**

Salvar de forma **estruturada**, não só a string final:

| Campo | Situação |
| --- | --- |
| `nfeInfCpl` | Texto efetivo enviado (já existe). |
| `nfeNaturezaOperacao` | Já existe. |
| Novo: `nfeInfCplFontes[]` | Origem de cada trecho: produto, config, usuário, pedido, transferência. Evita duplicar o mesmo convênio 3 vezes. |
| Itens: `informacoesComplementares` / `infAdProd` | Snapshot no momento da emissão. |
| Já persistidos e obrigatórios para auditoria | `nfeChave`, `nfeNumero`, `nfeSerie`, `nfeProtocolo`, `nfeStatus`, `nfeEmissao`, `nfeDanfeUrl`, `nfeXmlUrl`, `nfeErro`, `nfePayload`, `nfeRawResponse`. |

**Complementos operacionais que a fazenda precisa no `infCpl` (quando fizer sentido)**

- Pedido/romaneio e vendedor (já entram).  
- Placa, motorista e ticket de balança, se a NF for de venda com carregamento.  
- Chave da NF referenciada em devolução (já há ramo `nfeReferenciada`).  
- Em transferência entre estabelecimentos: texto fixo que o payload já sugere + CFOP 5152/6152 da config.  
- Não mandar RTC/IBS/CBS no `infCpl` como parágrafo longo se o XML da reforma ainda não estiver habilitado no provedor — o cadastro RTC hoje é local (`cClassTrib` com valores `AGRO_60`, não o código oficial da tabela). Tratar RTC como **rascunho interno** até o layout NotaAs/SEFAZ estar fechado.

### Regras de montagem (para a próxima implementação)

1. Deduplicar textos iguais (já há `Set` nos produtos; estender para config vs produto).  
2. Truncar/avisar aos 5.000 caracteres **antes** de transmitir.  
3. O que o usuário editar no modal prevalece e é o que se grava em `nfeInfCpl`.  
4. Reemissão / consulta: não recalcular por cima do texto autorizado; o XML/DANFE oficiais mandam.

---

## 4. Importador de NF para produtos transferidos de Santarém à fazenda

### Problema que resolve

Compras feitas no polo de Santarém (peças, EPI, borracha, lubrificante) precisam virar **relação de remessa** e, na chegada, **cadastro/estoque na fazenda**, sem redigitar a DANFE.

### O que já existe no código

- Parser XML: `det` → `xProd`, `NCM`, `CFOP`, `qCom`/`qTrib`, `uCom`, `vUnCom`, `vProd`; cabeçalho `nNF`, `serie`, `dhEmi`, primeiro `xNome`/`CNPJ`, chave 44 dígitos.  
- Parser PDF: texto Latin1 + `FlateDecode` no browser; regex frágil de linhas NCM + descrição.  
- Categoria chutada por regex no nome (`guessCategory`).  
- Modal “Preencher remessa” gera `TransferItem[]` com `nfCompraNumber` e `supplier`.  
- **Não** preenche `productId`, **não** cria `StoreItem` na importação (só na conferência), **não** persiste XML/chave como documento.

### Fluxo alvo (um único caminho)

```text
XML da NF-e (preferir) ou PDF
        ↓
Pré-visualizar emitente, número, série, chave, volumes
        ↓
Para cada item: casar com almoxarifado OU marcar “cadastrar na fazenda”
        ↓
Informar motorista, placa, data de saída (Santarém)
        ↓
Gerar TransferShipment EM_TRANSITO (romaneio TRF-AAAA-NNN)
        ↓
Na fazenda: conferir qtde, divergência, assinar
        ↓
Somar/criar StoreItem + guardar vínculo da NF
```

Não cadastrar esses itens em `inventory` (catálogo de calcário), salvo se o XML for claramente minério (NCM 2517/2518/2521/2522) **e** o usuário confirmar “é produto de venda”. O caso Santarém → fazenda do seed é **suprimento**.

### Dados a extrair e gravar na importação

Do XML (prioridade):

- Identificação: chave 44, número, série, data/hora emissão, natureza (`natOp`), CFOP por item.  
- Emitente: CNPJ, IE, razão social, município (fornecedor Santarém).  
- Destinatário: para conferir se a NF é da empresa (CBA) e não de terceiro.  
- Transporte: nome do transportador, placa (`veicTransp/placa`) — pré-preenche o romaneio.  
- Totais: `vProd`, `vFrete`, `vNF`.  
- Por item: `nItem`, `cProd`, `cEAN`, `xProd`, NCM, CFOP, `uCom`, `qCom`, `vUnCom`, `vProd`, `uTrib`/`qTrib`, `infAdProd`.  
- Arquivo: nome, hash, XML completo (ou path no storage) para auditoria — hoje só vai uma linha em `notes`.

Estender `ParsedNfDocument` / `ParsedNfItem` e `TransferItem` (hoje só `nfCompraNumber` + `supplier`). Na remessa, guardar também `nfeChave`, `nfeSerie`, `nfeXmlRef`.

Do PDF: aceitar só como fallback; se não houver itens ou chave, bloquear com “envie o XML da mesma nota” (mensagem que o parser já sugere).

### Cadastro automático na fazenda

Na importação (opcional, default **desligado** até conferir) ou, melhor, **na conferência** (já é o gancho `onIntegrateWithStoreItems`):

- Match por mapa `cProd`+CNPJ ou por nome+NCM.  
- Item novo: criar `StoreItem` com categoria sugerida, unidade da NF, `minStock` padrão (hoje `2`), custo da NF, NCM.  
- Item existente: **não** somar quantidade na importação; somar só em `CONFERIDO_E_RECEBIDO` com `quantityReceived`.  
- Divergência: status já previsto `RECEBIDO_COM_DIVERGENCIA` + `divergenceNotes`.

### Encaixe na UI

1. Botão no header de Transferências: **Importar NF de Santarém**.  
2. Mesmo botão no modal “Nova relação”.  
3. Prévia editável (quantidade, unidade, categoria, vincular peça).  
4. Depois de salvar, atalho para imprimir romaneio (já existe modal de impressão).

### Riscos técnicos a tratar na implementação

- Primeiro `xNome`/`CNPJ` no XML pode não ser o emitente se o arquivo vier envelopado; parsear `infNFe/emit` e `infNFe/dest` de forma explícita.  
- Chave `\d{44}` pode pegar ruído; preferir `infNFe Id` (`NFe` + 44).  
- PDF comprimido/com fonte customizada continua incompleto — XML é o contrato.  
- Código da remessa `TRF-${year}-${count+1}` colide se houver exclusões; usar sequência persistida.  
- `TransfersPage` precisa ser o componente de rota para o importador não ficar morto.

---

## Ordem sugerida de construção (depois desta passada)

1. Expor importador na tela de transferências + revisão de itens + persistir chave/XML.  
2. Completar `StoreItem` (NCM, custo, última NF, `cProd`) e match na conferência.  
3. Corrigir herança de `informacoesComplementares` no pedido e separar `infCpl` (nota) de `infAdProd` (item).  
4. Reorganizar catálogo comercial (tipos, sem ids mágicos britado/moido, custo médio no KPI).  
5. Passada de UI: tokens, topbar/busca, dock mobile, toasts, fila fiscal.

Critério de pronto do importador: XML real de compra em Santarém gera remessa conferível na fazenda, peça aparece no almoxarifado só após assinatura, e a chave da NF fica consultável na remessa — sem criar calcário fantasma no catálogo de venda.
