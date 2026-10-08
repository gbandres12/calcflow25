-- Migration: 015_migration_plan_phase1_foundation.sql
-- Baseado em CALCFLOW_MIGRATION_PLAN.md - Fase 1: Fundação Aditiva
-- Cria o schema erp, tabelas de controle (feature_flags, document_sequences, audit_log, projection_conflicts),
-- insere empresas faltantes em public.companies, e adiciona versionamento e trigger de auditoria em public.app_records.

-- 1. Garantir que todas as empresas em app_records existam em public.companies
INSERT INTO public.companies (id, name, created_at)
SELECT DISTINCT company_id,
  CASE 
    WHEN company_id = 'matriz-demo' THEN 'Matriz Demo'
    WHEN company_id = 'comp-1787706064101' THEN 'CBA Principal (Legada)'
    WHEN company_id = 'comp-u-1787707248502' THEN 'Empresa Suporte'
    ELSE company_id
  END,
  now()
FROM public.app_records
ON CONFLICT (id) DO NOTHING;

-- 2. Schema erp
CREATE SCHEMA IF NOT EXISTS erp;
GRANT USAGE ON SCHEMA erp TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA erp GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA erp GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA erp GRANT SELECT ON TABLES TO anon;

-- 3. erp.feature_flags (controle por empresa e módulo: legacy, shadow, new, retired)
CREATE TABLE IF NOT EXISTS erp.feature_flags (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module text NOT NULL,
  mode text NOT NULL DEFAULT 'legacy' CHECK (mode IN ('legacy', 'shadow', 'new', 'retired')),
  min_client_version text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL DEFAULT auth.uid(),
  PRIMARY KEY (company_id, module)
);

ALTER TABLE erp.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_flags_select_policy" ON erp.feature_flags
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "feature_flags_admin_policy" ON erp.feature_flags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = feature_flags.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'Administrador'
    )
  );

-- 4. erp.document_sequences (numeração atômica por empresa e ano)
CREATE TABLE IF NOT EXISTS erp.document_sequences (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind text NOT NULL,
  year int NOT NULL,
  current_val bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, kind, year)
);

ALTER TABLE erp.document_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_sequences_select_policy" ON erp.document_sequences
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = document_sequences.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION erp.next_sequence(p_company_id text, p_kind text, p_year int)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_next bigint;
BEGIN
  INSERT INTO erp.document_sequences (company_id, kind, year, current_val, updated_at)
  VALUES (p_company_id, p_kind, p_year, 1, now())
  ON CONFLICT (company_id, kind, year)
  DO UPDATE SET current_val = erp.document_sequences.current_val + 1, updated_at = now()
  RETURNING current_val INTO v_next;
  RETURN v_next;
END;
$$;

-- 5. erp.audit_log (trilha imutável de auditoria)
CREATE TABLE IF NOT EXISTS erp.audit_log (
  id bigserial PRIMARY KEY,
  company_id text NOT NULL,
  table_schema text NOT NULL DEFAULT 'erp',
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL,
  actor_id uuid DEFAULT auth.uid(),
  actor_role text NULL,
  old_data jsonb NULL,
  new_data jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_lookup 
ON erp.audit_log (company_id, table_name, record_id, created_at DESC);

ALTER TABLE erp.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select_policy" ON erp.audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = audit_log.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('Administrador', 'Gerente')
    )
  );

-- Bloqueia UPDATE e DELETE em audit_log (imutabilidade)
CREATE OR REPLACE FUNCTION erp.prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Registros de auditoria são imutáveis e não podem ser alterados ou excluídos.';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON erp.audit_log;
CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON erp.audit_log
FOR EACH ROW
EXECUTE FUNCTION erp.prevent_audit_mutation();

-- 6. erp.projection_conflicts (controle de divergências durante transição)
CREATE TABLE IF NOT EXISTS erp.projection_conflicts (
  id bigserial PRIMARY KEY,
  company_id text NOT NULL,
  module text NOT NULL,
  record_id text NOT NULL,
  conflict_type text NOT NULL,
  legacy_data jsonb NOT NULL,
  new_data jsonb NULL,
  details text NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'ignored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  resolved_by uuid NULL
);

ALTER TABLE erp.projection_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projection_conflicts_policy" ON erp.projection_conflicts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = projection_conflicts.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'Administrador'
    )
  );

-- 7. erp.migration_rejects (quarentena para dados com restrição no backfill)
CREATE TABLE IF NOT EXISTS erp.migration_rejects (
  id bigserial PRIMARY KEY,
  company_id text NOT NULL,
  table_name text NOT NULL,
  record_id text NOT NULL,
  data jsonb NOT NULL,
  error_message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE erp.migration_rejects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "migration_rejects_policy" ON erp.migration_rejects
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = migration_rejects.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'Administrador'
    )
  );

-- 8. Adicionar coluna 'version' em public.app_records
ALTER TABLE public.app_records 
ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;

-- 9. Trigger de auditoria e versionamento no public.app_records
CREATE OR REPLACE FUNCTION erp.trg_app_records_audit_and_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1;
    NEW.updated_at := now();
    INSERT INTO erp.audit_log (
      company_id, table_schema, table_name, record_id, action, actor_id, new_data, created_at
    ) VALUES (
      NEW.company_id, 'public', NEW.table_name, NEW.id, 'INSERT', auth.uid(), NEW.data, now()
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
    NEW.updated_at := now();
    INSERT INTO erp.audit_log (
      company_id, table_schema, table_name, record_id, action, actor_id, old_data, new_data, created_at
    ) VALUES (
      NEW.company_id, 'public', NEW.table_name, NEW.id, 'UPDATE', auth.uid(), OLD.data, NEW.data, now()
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO erp.audit_log (
      company_id, table_schema, table_name, record_id, action, actor_id, old_data, created_at
    ) VALUES (
      OLD.company_id, 'public', OLD.table_name, OLD.id, 'DELETE', auth.uid(), OLD.data, now()
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_records_audit_and_version ON public.app_records;

CREATE TRIGGER trg_app_records_audit_and_version
BEFORE INSERT OR UPDATE OR DELETE ON public.app_records
FOR EACH ROW
EXECUTE FUNCTION erp.trg_app_records_audit_and_version();
