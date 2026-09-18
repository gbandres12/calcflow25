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
