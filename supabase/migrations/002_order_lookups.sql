-- Lookups usados pelo webhook de NF-e e pelo login por e-mail.
CREATE INDEX IF NOT EXISTS idx_app_records_nfe_id
  ON public.app_records ((data->>'nfeId'))
  WHERE table_name = 'sales_orders';

CREATE INDEX IF NOT EXISTS idx_app_records_order_ref
  ON public.app_records ((data->>'reference'))
  WHERE table_name = 'sales_orders';
