# CalcárioFlow ERP

ERP de usina de calcário: vendas, balança, estoque, financeiro e NF-e.

Produção: https://calcflow25.vercel.app

## Stack

- React + Vite
- Persistência principal: **Supabase** (`app_records`)
- Fallback: localStorage (e Firestore legado, se configurado)
- Deploy: Vercel

## Setup

1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha URL + anon key do Supabase
3. No SQL Editor do Supabase, rode `supabase/migrations/001_app_records.sql` e `002_order_lookups.sql`
4. `npm run dev`

Demo: `admin@calcarioflow.com.br` / `123456`

## Variáveis na Vercel

Obrigatórias: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Para webhook de NF-e atualizar pedidos no Supabase: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

Opcional: `NOTAAS_API_KEY`, `NOTAAS_WEBHOOK_SECRET`.

Não coloque service_role no frontend.

## Segurança (ainda em aberto)

- RLS atual é pública (bootstrap). Trocar após Auth.
- Contas novas exigem senha (hash SHA-256). Operadores cadastrados na equipe também.
- Próximo passo: Supabase Auth + policy por `company_id`.
