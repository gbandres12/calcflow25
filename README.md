# CalcárioFlow ERP

ERP de usina de calcário: vendas, balança, estoque, financeiro e NF-e.

Produção: https://calcflow25.vercel.app

## Stack

- React + Vite
- Persistência principal: **Supabase** (`app_records`). localStorage é só cache/fila de reenvio.
- Fallback: localStorage (e Firestore legado, se configurado)
- Deploy: Vercel

## Setup

1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha URL + anon key do Supabase
3. No SQL Editor do Supabase, rode as migrations `001` a `007` em `supabase/migrations/` (a `007` evita clientes/vendas ficarem só no cache do navegador).
4. `npm run dev`

Demo: `admin@calcarioflow.com.br` / `123456`

## Variáveis na Vercel

Obrigatórias: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Para webhook de NF-e atualizar pedidos no Supabase: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

Opcional: `NOTAAS_API_KEY`, `NOTAAS_WEBHOOK_SECRET`.

Não coloque service_role no frontend.

## Agente financeiro no Telegram

Assessor que atende pelo Telegram em texto, áudio ou foto: consulta caixa, recebíveis, estoque e vendas; registra abatimentos e recebimentos; cria orçamentos; confirma pedidos (estoque + financeiro); e pode emitir NF-e pela mesma integração NotaAs do ERP. Toda gravação passa por um botão de confirmação no chat.

Fluxo de venda por voz: entrevista curta (cliente → itens → orçamento ou pedido confirmado → NF-e se pedir). Cliente e produto precisam já estar no cadastro — o bot **não cadastra cliente**. Default é orçamento; só confirma/fatura/emite se o operador pedir explicitamente.

O bot **não altera o núcleo financeiro** nos lançamentos de baixa: ele grava o recibo no pedido e o pagamento na parcela escolhida, e o `receiptId` impede o app de lançar de novo. Confirmação de pedido pelo chat espelha a regra do `finalizeSale` do app (estoque clampado + parcela SALE).

### Configuração

1. Rode as migrations `008_telegram_agent.sql` e `009_telegram_sale_drafts.sql` no SQL Editor do Supabase.
2. Defina na Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME`, `GEMINI_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY`.
3. Registre o webhook: `npx tsx scripts/telegram-set-webhook.ts https://calcflow25.vercel.app`
4. No ERP, em **Usuários e Acessos**, use o card "Conectar Telegram" e mande `/vincular CODIGO` para o bot.

`TELEGRAM_AGENT_WRITES` começa desligado: o bot sobe só como consulta. Coloque `true` quando quiser liberar os lançamentos.

Permissões do vínculo (copiadas do perfil ERP): `orders` para criar/confirmar pedido; `fiscal` para emitir NF-e; `financial` para baixas/abatimentos. Se a permissão estiver `false`, a ação é bloqueada.

### Comandos sem IA

Se o Gemini estiver fora do ar ou sem cota, estes comandos continuam funcionando, porque não passam por modelo nenhum: `/saldo`, `/receber`, `/baixar`, `/abater`, `/vendas`, `/estoque`, `/resumo`, `/conferir`.

O `/conferir` (e o botão "Conferir agora" no card) compara, por pedido, a soma dos recibos com a soma das baixas e aponta divergência.

## TestSprite (MCP)

Validação de PRD e geração de testes via [TestSprite MCP](https://docs.testsprite.com/mcp/getting-started/installation). Pacote pinado: `@testsprite/testsprite-mcp@0.0.45`. Node.js >= 22.

1. `npm install`
2. Crie uma API key em [TestSprite → API Keys](https://www.testsprite.com/dashboard/settings/apikey)
3. Exporte a chave no ambiente **ou** preencha `env.API_KEY` em `.cursor/mcp.json` (não commite o valor)
4. Reinicie o MCP no Cursor e peça: `Help me test this project with TestSprite`
5. No portal de bootstrap, envie o PRD em `testsprite_tests/prd/plano-ui-produtos-nfe.md` (frontend, porta 5173, escopo codebase)

A chave nunca deve ir para o git. Sem `API_KEY`, `testsprite_check_account_info` responde “No API Key” e a normalização do PRD não roda.

## Segurança

- RLS em `app_records` por empresa via `company_memberships` (migrations 003–007).
- Contas novas usam Supabase Auth. Rode a migration `007` no SQL Editor para o app conseguir gravar clientes e vendas na empresa certa.
