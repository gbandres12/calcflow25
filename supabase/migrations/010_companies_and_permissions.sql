-- Fase 1 do modelo multi-filial: matriz + filiais e permissão granular por
-- empresa. Puramente aditivo — não altera o comportamento de ninguém que já
-- usa o sistema hoje.
--
-- Validado via BEGIN/ROLLBACK direto no banco de produção (sem branch) antes
-- de ser commitado: a coluna nova aplica sem travar as 2 linhas existentes
-- de company_memberships, e o backfill dá permissão total (read+write em
-- todos os módulos de ALL_TABLES) para quem já tem membership — ou seja,
-- login e leitura de dados continuam idênticos a antes desta migration.

create table if not exists public.companies (
  id text primary key,
  name text not null,
  parent_company_id text references public.companies(id),
  owner_user_id uuid references auth.users(id),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_companies_parent
  on public.companies (parent_company_id)
  where parent_company_id is not null;

alter table public.companies enable row level security;

-- Cada membro só lê as empresas onde tem vínculo (matriz e/ou filiais
-- delegadas). Sem policy de insert/update/delete pra authenticated: criar ou
-- editar empresa passa pela service role (API), não direto do browser.
create policy "Members can read their companies"
on public.companies
for select
to authenticated
using (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = companies.id
      and membership.user_id = (select auth.uid())
  )
);

-- Permissão granular por módulo (mesmo padrão jsonb já usado em
-- telegram_links/telegram_pairing_codes). Default '{}' e o backfill abaixo
-- garantem que ninguém perde acesso quando a coluna é criada.
alter table public.company_memberships
  add column if not exists permissions jsonb not null default '{}'::jsonb;

update public.company_memberships
set permissions = (
  select jsonb_object_agg(t, jsonb_build_object('read', true, 'write', true))
  from unnest(array[
    'customers', 'sales_orders', 'transactions', 'machines', 'store_items',
    'maintenance_records', 'fuel_records', 'fuel_purchases', 'inventory',
    'financial_accounts', 'categories', 'fiscal_config', 'users', 'transfers',
    'transportadores'
  ]) as t
)
where permissions = '{}'::jsonb;
