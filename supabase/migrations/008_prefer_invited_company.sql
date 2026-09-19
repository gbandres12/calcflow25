-- Prefer the company from the invite (user_metadata.companyId) instead of the
-- oldest membership. If the user already belongs to any company, do not open
-- a second internal folder.

create or replace function public.current_company_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select membership.company_id
      from public.company_memberships membership
      join auth.users users on users.id = membership.user_id
      where membership.user_id = (select auth.uid())
        and membership.company_id = nullif(users.raw_user_meta_data ->> 'companyId', '')
      limit 1
    ),
    (
      select membership.company_id
      from public.company_memberships membership
      where membership.user_id = (select auth.uid())
      order by membership.created_at desc
      limit 1
    )
  )
$$;

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
  preferred text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select nullif(u.raw_user_meta_data ->> 'companyId', '')
    into preferred
  from auth.users u
  where u.id = uid;

  if preferred is not null then
    select *
      into existing
    from public.company_memberships
    where user_id = uid
      and company_id = preferred
    limit 1;
    if found then
      return jsonb_build_object('company_id', existing.company_id, 'role', existing.role);
    end if;
  end if;

  select *
    into existing
  from public.company_memberships
  where user_id = uid
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object('company_id', existing.company_id, 'role', existing.role);
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
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'company_id', existing.company_id,
    'role', existing.role
  );
end;
$$;
