-- Autorizações de Compra: nova coleção lógica 'purchase_authorizations' em public.app_records.
-- A RLS (member_can_access_record) nega módulos ausentes do jsonb de permissões,
-- então herdamos o acesso que cada membro já possui em 'purchase_orders' / 'store_items'.

update public.company_memberships
set permissions = permissions || jsonb_build_object(
  'purchase_authorizations',
  coalesce(permissions -> 'purchase_orders', permissions -> 'store_items', jsonb_build_object('read', true, 'write', true))
)
where not (permissions ? 'purchase_authorizations');
