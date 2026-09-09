-- Protege os perfis de usuários mesmo enquanto versões anteriores do frontend
-- ainda estiverem em cache nos navegadores.

create or replace function public.remove_legacy_password_hash()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.table_name = 'users' then
    new.data := new.data - 'passwordHash';
  end if;
  return new;
end;
$$;

revoke all on function public.remove_legacy_password_hash() from public;
revoke all on function public.remove_legacy_password_hash() from anon;
revoke all on function public.remove_legacy_password_hash() from authenticated;

drop trigger if exists remove_legacy_password_hash_on_app_records on public.app_records;
create trigger remove_legacy_password_hash_on_app_records
  before insert or update of data on public.app_records
  for each row execute procedure public.remove_legacy_password_hash();

drop policy if exists "Members can insert company records" on public.app_records;
drop policy if exists "Members can update company records" on public.app_records;
drop policy if exists "Members can delete company records" on public.app_records;

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
  and (
    app_records.table_name <> 'users'
    or app_records.id = (select auth.uid())::text
    or exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = app_records.company_id
        and membership.user_id = (select auth.uid())
        and membership.role = 'Administrador'
    )
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
  and (
    app_records.table_name <> 'users'
    or app_records.id = (select auth.uid())::text
    or exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = app_records.company_id
        and membership.user_id = (select auth.uid())
        and membership.role = 'Administrador'
    )
  )
)
with check (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = app_records.company_id
      and membership.user_id = (select auth.uid())
  )
  and (
    app_records.table_name <> 'users'
    or app_records.id = (select auth.uid())::text
    or exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = app_records.company_id
        and membership.user_id = (select auth.uid())
        and membership.role = 'Administrador'
    )
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
  and (
    app_records.table_name <> 'users'
    or exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = app_records.company_id
        and membership.user_id = (select auth.uid())
        and membership.role = 'Administrador'
    )
  )
);
