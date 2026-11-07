-- Ordens de Compra e Verbas de Centros de Custo: novas coleções lógicas
-- 'purchase_orders' e 'cost_centers' em public.app_records.
-- A RLS (member_can_access_record) nega módulos ausentes do jsonb de permissões,
-- então herdamos o acesso que cada membro já possui em 'store_items'/'transactions'.

update public.company_memberships
set permissions = permissions || jsonb_build_object(
  'purchase_orders',
  coalesce(permissions -> 'store_items', permissions -> 'inventory', jsonb_build_object('read', true, 'write', true)),
  'cost_centers',
  coalesce(permissions -> 'transactions', permissions -> 'financial_accounts', jsonb_build_object('read', true, 'write', true))
)
where not (permissions ? 'purchase_orders') or not (permissions ? 'cost_centers');
