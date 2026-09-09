-- CalcárioFlow ERP: isolamento real entre empresas e remoção do bootstrap público.
-- O app_records continua sendo o repositório flexível do ERP, mas cada empresa
-- passa a ser acessível apenas pelos usuários autenticados vinculados a ela.

create table if not exists public.company_memberships (
  company_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'Operador',
  created_at timestamptz not null default timezone('utc', now()),
  primary key (company_id, user_id)
);

create index if not exists idx_company_memberships_user_company
  on public.company_memberships (user_id, company_id);

alter table public.company_memberships enable row level security;

drop policy if exists "Members can read their own membership" on public.company_memberships;
create policy "Members can read their own membership"
on public.company_memberships
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Registra a empresa escolhida no primeiro cadastro. A associação permanece no
-- banco, portanto alterações futuras em user_metadata não aumentam o acesso.
create or replace function public.create_company_membership_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_company_id text;
  assigned_role text;
begin
  assigned_company_id := coalesce(
    nullif(new.raw_user_meta_data ->> 'companyId', ''),
    'comp-' || new.id::text
  );
  assigned_role := coalesce(
    nullif(new.raw_user_meta_data ->> 'role', ''),
    'Administrador'
  );

  insert into public.company_memberships (company_id, user_id, role)
  values (assigned_company_id, new.id, assigned_role)
  on conflict (company_id, user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_company_membership_for_new_user() from public;
revoke all on function public.create_company_membership_for_new_user() from anon;
revoke all on function public.create_company_membership_for_new_user() from authenticated;

drop trigger if exists on_auth_user_created_company_membership on auth.users;
create trigger on_auth_user_created_company_membership
  after insert on auth.users
  for each row execute procedure public.create_company_membership_for_new_user();

-- Faz a transição das contas Supabase Auth que já existiam antes desta migration.
insert into public.company_memberships (company_id, user_id, role)
select
  coalesce(nullif(u.raw_user_meta_data ->> 'companyId', ''), 'comp-' || u.id::text),
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'role', ''), 'Administrador')
from auth.users u
on conflict (company_id, user_id) do nothing;

-- O login legado gravava hash de senha dentro do JSON acessível pelo browser.
-- A autenticação oficial é o Supabase Auth; os hashes antigos não são mais úteis.
update public.app_records
set data = data - 'passwordHash'
where data ? 'passwordHash';

-- Elimina políticas abertas de bootstrap e limita a demonstração à base fictícia.
drop policy if exists "Permissao publica app_records" on public.app_records;
drop policy if exists "Demo public access only" on public.app_records;
drop policy if exists "Members can read company records" on public.app_records;
drop policy if exists "Members can insert company records" on public.app_records;
drop policy if exists "Members can update company records" on public.app_records;
drop policy if exists "Members can delete company records" on public.app_records;

create policy "Demo public access only"
on public.app_records
for all
to anon
using (company_id = 'matriz-demo')
with check (company_id = 'matriz-demo');

create policy "Members can read company records"
on public.app_records
for select
to authenticated
using (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = app_records.company_id
      and membership.user_id = (select auth.uid())
  )
);

create policy "Members can insert company records"
on public.app_records
for insert
to authenticated
with check (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = app_records.company_id
      and membership.user_id = (select auth.uid())
  )
);

create policy "Members can update company records"
on public.app_records
for update
to authenticated
using (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = app_records.company_id
      and membership.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = app_records.company_id
      and membership.user_id = (select auth.uid())
  )
);

create policy "Members can delete company records"
on public.app_records
for delete
to authenticated
using (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = app_records.company_id
      and membership.user_id = (select auth.uid())
  )
);

-- As tabelas normalizadas antigas não são usadas pelo app atual. Mantêm RLS sem
-- políticas até serem consolidadas ou removidas, evitando uma segunda API pública.
drop policy if exists "Permitir tudo para chave anon" on public.customers;
drop policy if exists "Permitir tudo para chave anon" on public.products;
drop policy if exists "Permitir tudo para chave anon" on public.orders;
drop policy if exists "Permitir tudo para chave anon" on public.stock_moves;
drop policy if exists "Permitir tudo para chave anon" on public.invoices;

create policy "Direct API access disabled" on public.customers
for all to anon, authenticated using (false) with check (false);
create policy "Direct API access disabled" on public.products
for all to anon, authenticated using (false) with check (false);
create policy "Direct API access disabled" on public.orders
for all to anon, authenticated using (false) with check (false);
create policy "Direct API access disabled" on public.stock_moves
for all to anon, authenticated using (false) with check (false);
create policy "Direct API access disabled" on public.invoices
for all to anon, authenticated using (false) with check (false);

-- Índices que cobrem as chaves estrangeiras existentes.
create index if not exists idx_orders_customer_id on public.orders (customer_id);
create index if not exists idx_stock_moves_product_id on public.stock_moves (product_id);

-- Função de gatilho administrativo, não uma RPC pública.
revoke all on function public.rls_auto_enable() from public;
revoke all on function public.rls_auto_enable() from anon;
revoke all on function public.rls_auto_enable() from authenticated;
