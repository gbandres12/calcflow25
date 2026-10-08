-- Migration: 021_migration_plan_phase5_lot2_customers.sql
-- Baseado em CALCFLOW_MIGRATION_PLAN.md - Fase 5: Virada do Lote 2 (customers)
-- 1. Cria trigger de projeção reversa (erp.customers -> public.app_records) com trava anti-loop (pg_trigger_depth() > 1).
-- 2. Ativa o modo NEW para o módulo 'customers' na CBA Filial Belém e na CBA Mineração.

-- ============================================================================
-- 1. PROJEÇÃO REVERSA: erp.customers -> public.app_records
-- ============================================================================

CREATE OR REPLACE FUNCTION erp.trg_reverse_project_customers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Evitar recursão infinita se a alteração veio do trigger de app_records
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.app_records (
    company_id, id, table_name, data, updated_at, version
  ) VALUES (
    NEW.company_id,
    NEW.id,
    'customers',
    jsonb_build_object(
      'id', NEW.id,
      'companyId', NEW.company_id,
      'name', NEW.name,
      'document', NEW.document,
      'tipoPessoa', NEW.tipo_pessoa,
      'ie', NEW.ie,
      'isentoIE', NEW.isento_ie,
      'phone', NEW.phone,
      'email', NEW.email,
      'street', NEW.street,
      'number', NEW.number,
      'neighborhood', NEW.neighborhood,
      'city', NEW.city,
      'state', NEW.state,
      'zipCode', NEW.zip_code,
      'ibgeCode', NEW.ibge_code,
      'status', NEW.status,
      'notes', NEW.notes,
      'totalSpent', NEW.total_spent,
      'createdAt', NEW.created_at,
      'updatedAt', NEW.updated_at
    ) || COALESCE(NEW.extra, '{}'::jsonb),
    NEW.updated_at,
    NEW.version
  )
  ON CONFLICT (table_name, company_id, id) DO UPDATE SET
    data = EXCLUDED.data,
    updated_at = EXCLUDED.updated_at,
    version = EXCLUDED.version;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_reverse_proj ON erp.customers;
CREATE TRIGGER trg_customers_reverse_proj
AFTER INSERT OR UPDATE ON erp.customers
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_project_customers();

-- ============================================================================
-- 2. ATIVAÇÃO DO MODO NEW PARA CUSTOMERS NA CBA FILIAL BELÉM E CBA MINERAÇÃO
-- ============================================================================

UPDATE erp.feature_flags 
SET mode = 'new', updated_at = now() 
WHERE company_id IN ('filial-mugyw35c-lneymq', 'comp-1788898385141')
  AND module = 'customers';
