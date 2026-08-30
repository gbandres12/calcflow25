-- ========================================================
-- CALCÁRIOFLOW ERP — schema mínimo no Supabase
-- Cole no SQL Editor e execute (Run)
-- ========================================================

CREATE TABLE IF NOT EXISTS public.app_records (
  id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  company_id TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (table_name, company_id, id)
);

CREATE INDEX IF NOT EXISTS idx_app_records_lookup ON public.app_records(table_name, company_id);
CREATE INDEX IF NOT EXISTS idx_app_records_updated ON public.app_records(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_records_email ON public.app_records ((data->>'email')) WHERE table_name = 'users';

ALTER TABLE public.app_records ENABLE ROW LEVEL SECURITY;

-- ATENÇÃO: política aberta só para bootstrap.
-- Qualquer pessoa com a anon key lê TODAS as empresas.
-- Depois de migrar para Supabase Auth, troque por:
--   USING (company_id = auth.jwt() ->> 'company_id')
DROP POLICY IF EXISTS "Permissao publica app_records" ON public.app_records;
CREATE POLICY "Permissao publica app_records"
ON public.app_records
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);
