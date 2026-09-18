-- Persistência confiável: a empresa autenticada passa a ser a fonte da verdade
-- no banco, e o frontend deixa de tratar localStorage como gravação concluída.
--
-- 1. Recupera/cria o vínculo company_memberships do próprio usuário (o trigger
--    de cadastro às vezes não existia ainda, e sem esse vínculo o RLS esconde
--    clientes/vendas — o app gravava só no cache do navegador).
-- 2. Impede company_id / table_name em branco, que misturavam dados na demo.
-- 3. Marca created_at sem apagar updated_at já existente.

alter table public.app_records
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.app_records
  drop constraint if exists app_records_company_id_not_blank;
alter table public.app_records
  add constraint app_records_company_id_not_blank
  check (length(trim(company_id)) > 0);

alter table public.app_records
  drop constraint if exists app_records_table_name_not_blank;
alter table public.app_records
  add constraint app_records_table_name_not_blank
  check (length(trim(table_name)) > 0);

create or replace function public.ensure_own_company_membership()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  assigned_company_id text;
  assigned_role text;
  existing public.company_memberships%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select *
    into existing
  from public.company_memberships
  where user_id = uid
  order by created_at asc
  limit 1;

  if found then
    return jsonb_build_object(
      'company_id', existing.company_id,
      'role', existing.role
    );
  end if;

  select
    coalesce(nullif(u.raw_user_meta_data ->> 'companyId', ''), 'comp-' || u.id::text),
    coalesce(nullif(u.raw_user_meta_data ->> 'role', ''), 'Administrador')
  into assigned_company_id, assigned_role
  from auth.users u
  where u.id = uid;

  if assigned_company_id is null or length(trim(assigned_company_id)) = 0 then
    assigned_company_id := 'comp-' || uid::text;
  end if;
  if assigned_role is null or length(trim(assigned_role)) = 0 then
    assigned_role := 'Administrador';
  end if;

  insert into public.company_memberships (company_id, user_id, role)
  values (assigned_company_id, uid, assigned_role)
  on conflict (company_id, user_id) do nothing;

  select *
    into existing
  from public.company_memberships
  where user_id = uid
  order by created_at asc
  limit 1;

  return jsonb_build_object(
    'company_id', existing.company_id,
    'role', existing.role
  );
end;
$$;

revoke all on function public.ensure_own_company_membership() from public;
revoke all on function public.ensure_own_company_membership() from anon;
grant execute on function public.ensure_own_company_membership() to authenticated;

create or replace function public.current_company_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.company_memberships
  where user_id = (select auth.uid())
  order by created_at asc
  limit 1
$$;

revoke all on function public.current_company_id() from public;
revoke all on function public.current_company_id() from anon;
grant execute on function public.current_company_id() to authenticated;

-- Contas Auth criadas antes do trigger continuam sem membership; completa o vínculo.
insert into public.company_memberships (company_id, user_id, role)
select
  coalesce(nullif(u.raw_user_meta_data ->> 'companyId', ''), 'comp-' || u.id::text),
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'role', ''), 'Administrador')
from auth.users u
where not exists (
  select 1
  from public.company_memberships membership
  where membership.user_id = u.id
)
on conflict (company_id, user_id) do nothing;
