-- Fase 2 do modelo multi-filial: troca a RLS de app_records de "é membro da
-- empresa -> acesso total" para "tem permissão nesse módulo específico".
-- Depende da migration 010 (coluna company_memberships.permissions).
--
-- Validado via BEGIN/ROLLBACK direto no banco de produção (sem branch) antes
-- de ser commitado: com o backfill da 010, um usuário com permissão total
-- (todo membro existente hoje) continua vendo exatamente os mesmos registros
-- de antes — testei com o Administrador da CBA Mineração e os totais
-- (clientes, transações, pedidos) bateram com o que a RLS antiga devolvia.
-- Um vínculo com permissão restrita (ex: sem leitura de transactions) fica
-- de fato bloqueado só naquele módulo, sem afetar os outros.

create or replace function public.member_has_permission(
  p_company_id text,
  p_table_name text,
  p_action text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (membership.permissions -> p_table_name ->> p_action)::boolean
      from public.company_memberships membership
      where membership.company_id = p_company_id
        and membership.user_id = (select auth.uid())
      limit 1
    ),
    false
  )
$$;

revoke all on function public.member_has_permission(text, text, text) from public;
revoke all on function public.member_has_permission(text, text, text) from anon;
grant execute on function public.member_has_permission(text, text, text) to authenticated;

drop policy if exists "Members can read company records" on public.app_records;
create policy "Members can read company records"
on public.app_records
for select
to authenticated
using (public.member_has_permission(company_id, table_name, 'read'));

drop policy if exists "Members can insert company records" on public.app_records;
create policy "Members can insert company records"
on public.app_records
for insert
to authenticated
with check (public.member_has_permission(company_id, table_name, 'write'));

drop policy if exists "Members can update company records" on public.app_records;
create policy "Members can update company records"
on public.app_records
for update
to authenticated
using (public.member_has_permission(company_id, table_name, 'write'))
with check (public.member_has_permission(company_id, table_name, 'write'));

drop policy if exists "Members can delete company records" on public.app_records;
create policy "Members can delete company records"
on public.app_records
for delete
to authenticated
using (public.member_has_permission(company_id, table_name, 'write'));
