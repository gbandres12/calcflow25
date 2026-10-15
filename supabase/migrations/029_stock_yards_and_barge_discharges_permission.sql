-- Pátios e descargas fluviais: novas coleções lógicas 'stock_yards' e 'barge_discharges' em public.app_records.
-- A RLS (member_has_permission, migration 011) nega módulos ausentes do jsonb
-- de permissões, então herdamos o acesso que cada membro já tem em 'inventory'/'store_items'.

update public.company_memberships
set permissions = permissions || jsonb_build_object(
  'stock_yards',
  coalesce(permissions -> 'inventory', jsonb_build_object('read', true, 'write', true)),
  'barge_discharges',
  coalesce(permissions -> 'inventory', jsonb_build_object('read', true, 'write', true))
)
where not (permissions ? 'stock_yards') or not (permissions ? 'barge_discharges');
