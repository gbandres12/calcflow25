-- Migration: 027_audit_actor_for_server_writes.sql
-- Objetivo: registrar QUEM fez a ação também nas gravações feitas pelo servidor
-- (rotas /api com service role), que antes caíam no audit_log com actor_id NULL.
--
-- Regra: usuário logado (auth.uid()) sempre vence. Só quando não há sessão
-- (service role) aceitamos o cabeçalho x-actor-id, que o servidor envia depois
-- de validar o token do usuário. Sem service role não há permissão de escrita,
-- então o cabeçalho não serve para forjar autoria.

CREATE OR REPLACE FUNCTION erp.current_actor()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_header text;
BEGIN
  IF v_uid IS NOT NULL THEN
    RETURN v_uid;
  END IF;
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RETURN NULL;
  END IF;
  BEGIN
    v_header := NULLIF(current_setting('request.headers', true), '')::json->>'x-actor-id';
    IF v_header ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN v_header::uuid;
    END IF;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION erp.trg_app_records_audit_and_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor uuid := erp.current_actor();
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1;
    NEW.updated_at := now();
    INSERT INTO erp.audit_log (
      company_id, table_schema, table_name, record_id, action, actor_id, new_data, created_at
    ) VALUES (
      NEW.company_id, 'public', NEW.table_name, NEW.id, 'INSERT', v_actor, NEW.data, now()
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
    NEW.updated_at := now();
    INSERT INTO erp.audit_log (
      company_id, table_schema, table_name, record_id, action, actor_id, old_data, new_data, created_at
    ) VALUES (
      NEW.company_id, 'public', NEW.table_name, NEW.id, 'UPDATE', v_actor, OLD.data, NEW.data, now()
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO erp.audit_log (
      company_id, table_schema, table_name, record_id, action, actor_id, old_data, created_at
    ) VALUES (
      OLD.company_id, 'public', OLD.table_name, OLD.id, 'DELETE', v_actor, OLD.data, now()
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION erp.trg_generic_version_and_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 1) + 1;
  NEW.updated_at := now();
  NEW.updated_by := erp.current_actor();
  RETURN NEW;
END;
$$;
