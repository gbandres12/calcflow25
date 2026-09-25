# Propostas de UI — CalcárioFlow

Levantamento feito no código em 2026-09-24. Cada proposta termina com um **prompt pronto para colar no Cursor**.

## O que o código mostra hoje
- **Tailwind via CDN** (`<script src="cdn.tailwindcss.com">` no `index.html`): não é para produção, gera CSS em tempo de execução, deixa a primeira pintura lenta e não aceita tema/config.
- **Dois visuais misturados**: `styles.css` define uma paleta própria (`--cf-forest`, `--cf-sand`, `--cf-cream`, fonte Manrope), mas as telas usam `slate-*` do Tailwind (~1.500 usos). O `index.html` ainda força `Inter` e fundo `#F4F6F9`, e **Manrope nem é carregada**.
- **Texto pequeno demais**: ~870 usos de `text-[9px]`, `text-[10px]` e `text-[11px]`, quase sempre em `text-slate-400` (contraste baixo). Numa balança/pátio isso é difícil de ler.
- **Nenhum componente base**: `components/ui/` tem só 2 arquivos. Botão, input, modal, tabela, badge e card são reescritos em cada tela, com `rounded-lg`/`xl`/`2xl` misturados (~960 usos).
- **25 `alert()`/`confirm()` nativos** em 11 telas: tiram o usuário do fluxo e não seguem o visual.
- **Responsividade parcial**: 35 de 58 componentes têm breakpoints; o pátio e a balança costumam ser usados no celular/tablet.

---

## P1 — Base visual (1–2 dias, maior retorno)
**1. Tailwind compilado + tokens**
Instalar Tailwind v4 no Vite, remover o CDN, mapear as cores `--cf-*` como tema (`bg-forest`, `text-ink`, `bg-cream`) e carregar Manrope.
> Prompt: *"Remova o Tailwind do CDN no index.html e instale Tailwind v4 com @tailwindcss/vite. Crie o tema em styles.css com @theme usando as variáveis --cf-* existentes (forest, ink, sand, olive, cream, line, muted). Carregue a fonte Manrope do Google Fonts e remova Inter e o estilo inline do body. Não altere componentes ainda. Rode npm run build."*

**2. Escala tipográfica mínima**
Proibir abaixo de 12px em conteúdo; 11px só para rótulos em caixa-alta. Trocar `text-slate-400` em texto de leitura por `text-muted` (#728078, contraste AA).
> Prompt: *"Em components/, substitua text-[9px] e text-[10px] por text-xs, e text-slate-400 em texto de conteúdo (não ícones) por text-slate-500. Faça um arquivo por vez começando por YardManagement.tsx e Loadings.tsx. Não mude layout."*

## P2 — Kit de componentes (3–5 dias)
Criar em `components/ui/`: `Button` (primary/secondary/ghost/danger, tamanhos sm/md/lg), `Input`/`Select`/`Field` (label + erro), `Modal` (foco preso, Esc fecha, rodapé fixo), `DataTable` (cabeçalho fixo, zebra, vazio, carregando, ordenação), `Badge` de status, `Card`, `EmptyState`, `Toast` e `ConfirmDialog`.
- Status com cor única em todo o sistema: pedido **aberto / carregando / faturado / cancelado**, NF-e **rascunho / autorizada / rejeitada / cancelada**.
- Um só raio: `rounded-xl` em cards/modais, `rounded-lg` em controles.
> Prompt: *"Crie components/ui/Button.tsx, Modal.tsx, Badge.tsx, DataTable.tsx, Toast.tsx e ConfirmDialog.tsx usando as cores do tema forest/ink/sand. Modal deve prender foco, fechar com Esc e ter aria-modal. Depois migre apenas OrderWithdrawalModal.tsx para usar Modal e Button, como piloto."*

**Trocar `alert`/`confirm`** por `Toast` e `ConfirmDialog` (ação destrutiva em vermelho, com nome do item: "Cancelar pedido #1234?").

## P3 — Telas de operação (pátio, balança, carregamento)
- **Modo operador**: botões ≥ 48px, números de peso em fonte grande tabular (`tabular-nums`, 32–48px), contraste alto — pensando em tablet no pátio e luva/sol.
- **Fila de carregamento como quadro** (Aguardando → Na balança → Carregando → Saiu), com tempo de espera por caminhão e alerta de atraso.
- **Ticket/romaneio**: pré-visualização antes de imprimir (já existe `thermalTicket.ts`) e botão "reimprimir" visível.
- Layout que funcione em 768px: tabela vira lista de cards no celular.

## P4 — Vendas e NF-e (`SalesOrders.tsx`, 2.7k linhas)
- **Pedido em etapas** (Cliente → Produto/frete → Pagamento → Revisão), com resumo fixo à direita com total, saldo e peso retirado.
- **Linha do tempo do pedido**: criado → retiradas → NF-e → pagamentos, em vez de informações espalhadas em modais.
- **Erros de NF-e legíveis**: traduzir rejeição da SEFAZ para "o que corrigir" + link para o campo.
- Aproveitar a refatoração para quebrar o arquivo em `sales-orders/` (lista, filtros, formulário, detalhe).

## P5 — Navegação e produtividade
- **Busca global / Ctrl+K**: achar pedido, cliente, placa ou NF-e de qualquer tela.
- **Filtros persistentes** por tela (período, filial, status) e contagem nas abas.
- **Sidebar recolhível** com só os módulos permitidos à filial (já existe permissão por módulo).
- **Estados vazios úteis** ("Nenhum carregamento hoje — Registrar entrada") e skeletons no carregamento, no lugar de tela branca.
- **Modo escuro** fica fácil depois do P1 (tokens).

## P6 — Qualidade contínua
- Página interna `/ui` mostrando todos os componentes (guia visual do Cursor/Grok).
- Adicionar à regra `.cursor/rules/projeto.mdc`: "usar só componentes de components/ui e cores do tema; não usar slate-* nem text-[Npx] novos".
- Checklist visual por PR: 375px, 768px e 1366px, teclado (Tab/Esc) e contraste.

---

## Ordem sugerida
| # | Proposta | Esforço | Impacto |
|---|---|---|---|
| 1 | Tailwind compilado + tokens + Manrope | baixo | alto (performance e consistência) |
| 2 | Tipografia legível | baixo | alto (operação) |
| 3 | Kit `components/ui` + Toast/Confirm | médio | alto |
| 4 | Modo operador no pátio/balança | médio | alto |
| 5 | Pedido em etapas + linha do tempo | alto | médio-alto |
| 6 | Ctrl+K, filtros, estados vazios | médio | médio |
