-- CRM de produtores: nova coleção lógica 'crm_leads' em public.app_records.
-- A RLS (member_has_permission, migration 011) nega módulos ausentes do jsonb
-- de permissões, então herdamos o acesso que cada membro já tem em 'customers'.
update public.company_memberships
set permissions = permissions || jsonb_build_object(
  'crm_leads',
  coalesce(permissions -> 'customers', jsonb_build_object('read', false, 'write', false))
)
where not (permissions ? 'crm_leads');
