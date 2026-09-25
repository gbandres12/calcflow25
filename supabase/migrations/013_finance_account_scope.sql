-- Acesso por caixa: um colaborador pode ficar restrito a contas financeiras
-- específicas (ex.: só o caixa Asaas), em vez de "financeiro inteiro".
--
-- O escopo mora em company_memberships.permissions:
--   permissions.financial_accounts.accounts = ['acc-1', ...]
-- Sem a chave "accounts" nada muda: vale só o read/write por módulo (011).
--
-- Com escopo:
--   financial_accounts -> só lê as contas da lista; não cria/edita/exclui conta
--   transactions       -> lê, lança e dá baixa só nos caixas da lista; não exclui
--   linhas __seed__    -> leitura liberada (o app usa pra saber que a tabela
--                         já foi inicializada e não semear dados de novo)

create or replace function public.member_can_access_record(
  p_company_id text,
  p_table_name text,
  p_record_id text,
  p_data jsonb,
  p_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_permissions jsonb;
  v_scope jsonb;
begin
  select membership.permissions
    into v_permissions
  from public.company_memberships membership
  where membership.company_id = p_company_id
    and membership.user_id = (select auth.uid())
  limit 1;

  if v_permissions is null then
    return false;
  end if;

  if coalesce((v_permissions -> p_table_name ->> (case when p_action = 'read' then 'read' else 'write' end))::boolean, false) is not true then
    return false;
  end if;

  if p_table_name not in ('transactions', 'financial_accounts') then
    return true;
  end if;

  v_scope := v_permissions -> 'financial_accounts' -> 'accounts';
  if v_scope is null or jsonb_typeof(v_scope) <> 'array' then
    return true;
  end if;

  if p_record_id = '__seed__' then
    return p_action = 'read';
  end if;

  if p_table_name = 'financial_accounts' then
    return p_action = 'read' and v_scope ? p_record_id;
  end if;

  -- transactions
  if p_action = 'delete' then
    return false;
  end if;
  return v_scope ? coalesce(p_data ->> 'accountId', '');
end;
$$;

revoke all on function public.member_can_access_record(text, text, text, jsonb, text) from public;
revoke all on function public.member_can_access_record(text, text, text, jsonb, text) from anon;
grant execute on function public.member_can_access_record(text, text, text, jsonb, text) to authenticated;

drop policy if exists "Members can read company records" on public.app_records;
create policy "Members can read company records"
on public.app_records
for select
to authenticated
using (public.member_can_access_record(company_id, table_name, id, data, 'read'));

drop policy if exists "Members can insert company records" on public.app_records;
create policy "Members can insert company records"
on public.app_records
for insert
to authenticated
with check (public.member_can_access_record(company_id, table_name, id, data, 'write'));

drop policy if exists "Members can update company records" on public.app_records;
create policy "Members can update company records"
on public.app_records
for update
to authenticated
using (public.member_can_access_record(company_id, table_name, id, data, 'write'))
with check (public.member_can_access_record(company_id, table_name, id, data, 'write'));

drop policy if exists "Members can delete company records" on public.app_records;
create policy "Members can delete company records"
on public.app_records
for delete
to authenticated
using (public.member_can_access_record(company_id, table_name, id, data, 'delete'));
