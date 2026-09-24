-- Lookups SQL no JSON de pedidos, sem mover linhas nem criar tabelas novas.
-- nfeId já tem índice em 002_order_lookups.sql.

create index if not exists idx_app_records_order_number
  on public.app_records ((data->>'number'))
  where table_name = 'sales_orders';

create index if not exists idx_app_records_order_status
  on public.app_records ((data->>'status'))
  where table_name = 'sales_orders';
