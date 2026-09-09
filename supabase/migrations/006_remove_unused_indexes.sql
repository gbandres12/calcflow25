-- Índices sem consumidores no código atual aumentavam o custo de cada gravação
-- em app_records. Os índices de NF-e e de pedidos permanecem, pois são usados
-- pelos endpoints fiscais.

drop index if exists public.idx_app_records_updated;
drop index if exists public.idx_app_records_email;
