-- Vínculos criados depois da 010 (convite de colaborador, "arrumar equipe")
-- nasciam com permissions = '{}' e a RLS de app_records negava toda gravação:
-- "new row violates row-level security policy for table app_records".
-- Mesmo backfill da 010, aplicado de novo só a quem ficou vazio.
update public.company_memberships
set permissions = (
  select jsonb_object_agg(t, jsonb_build_object('read', true, 'write', true))
  from unnest(array[
    'customers', 'sales_orders', 'transactions', 'machines', 'store_items',
    'maintenance_records', 'fuel_records', 'fuel_purchases', 'inventory',
    'financial_accounts', 'categories', 'fiscal_config', 'users', 'transfers',
    'transportadores'
  ]) as t
)
where permissions = '{}'::jsonb;
