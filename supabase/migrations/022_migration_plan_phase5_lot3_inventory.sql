-- Migration: 022_migration_plan_phase5_lot3_inventory.sql
-- Baseado em CALCFLOW_MIGRATION_PLAN.md - Fase 5: Virada do Lote 3 (inventory / store_items)
-- 1. Cria triggers de projeção reversa (erp.products -> public.app_records) com trava anti-loop (pg_trigger_depth() > 1).
-- 2. Cria triggers de projeção reversa (erp.store_items -> public.app_records) com trava anti-loop.
-- 3. Trata soft-delete e delete físico para manter paridade reversa.
-- 4. Ativa o modo NEW para 'inventory' e 'store_items' na CBA Filial Belém e CBA Mineração.

-- ============================================================================
-- 1. PROJEÇÃO REVERSA: erp.products -> public.app_records ('inventory')
-- ============================================================================

CREATE OR REPLACE FUNCTION erp.trg_reverse_project_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Evitar recursão infinita se a alteração veio do trigger do app_records
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Se for soft delete, remove do app_records legado para não aparecer no front antigo
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM public.app_records
    WHERE table_name = 'inventory'
      AND company_id = NEW.company_id
      AND id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.app_records (
    company_id, id, table_name, data, updated_at, version
  ) VALUES (
    NEW.company_id,
    NEW.id,
    'inventory',
    jsonb_build_object(
      'id', NEW.id,
      'companyId', NEW.company_id,
      'code', NEW.code,
      'name', NEW.name,
      'unit', NEW.unit,
      'category', NEW.category,
      'quantity', NEW.quantity,
      'minStock', NEW.min_stock,
      'costPrice', NEW.cost_price,
      'unitPrice', NEW.unit_price,
      'ncm', NEW.ncm,
      'cst', NEW.cst,
      'cfop', NEW.cfop,
      'origem', NEW.origem,
      'aliquotaIcms', NEW.aliquota_icms,
      'aliquotaPis', NEW.aliquota_pis,
      'aliquotaCofins', NEW.aliquota_cofins,
      'unidadeTributavel', NEW.unidade_tributavel,
      'observacoesFiscais', NEW.observacoes_fiscais,
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

DROP TRIGGER IF EXISTS trg_products_reverse_proj ON erp.products;
CREATE TRIGGER trg_products_reverse_proj
AFTER INSERT OR UPDATE ON erp.products
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_project_products();

-- Tratamento para DELETE físico em erp.products
CREATE OR REPLACE FUNCTION erp.trg_reverse_delete_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  DELETE FROM public.app_records
  WHERE table_name = 'inventory'
    AND company_id = OLD.company_id
    AND id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_reverse_delete ON erp.products;
CREATE TRIGGER trg_products_reverse_delete
AFTER DELETE ON erp.products
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_delete_products();


-- ============================================================================
-- 2. PROJEÇÃO REVERSA: erp.store_items -> public.app_records ('store_items')
-- ============================================================================

CREATE OR REPLACE FUNCTION erp.trg_reverse_project_store_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM public.app_records
    WHERE table_name = 'store_items'
      AND company_id = NEW.company_id
      AND id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.app_records (
    company_id, id, table_name, data, updated_at, version
  ) VALUES (
    NEW.company_id,
    NEW.id,
    'store_items',
    jsonb_build_object(
      'id', NEW.id,
      'companyId', NEW.company_id,
      'name', NEW.name,
      'category', NEW.category,
      'unit', NEW.unit,
      'quantity', NEW.quantity,
      'minStock', NEW.min_stock,
      'unitCost', NEW.unit_cost,
      'supplierSku', NEW.supplier_sku,
      'supplierCnpj', NEW.supplier_cnpj,
      'ncm', NEW.ncm,
      'status', NEW.status,
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

DROP TRIGGER IF EXISTS trg_store_items_reverse_proj ON erp.store_items;
CREATE TRIGGER trg_store_items_reverse_proj
AFTER INSERT OR UPDATE ON erp.store_items
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_project_store_items();

-- Tratamento para DELETE físico em erp.store_items
CREATE OR REPLACE FUNCTION erp.trg_reverse_delete_store_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  DELETE FROM public.app_records
  WHERE table_name = 'store_items'
    AND company_id = OLD.company_id
    AND id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_items_reverse_delete ON erp.store_items;
CREATE TRIGGER trg_store_items_reverse_delete
AFTER DELETE ON erp.store_items
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_delete_store_items();


-- ============================================================================
-- 3. ATIVAÇÃO DO MODO NEW PARA INVENTORY E STORE_ITEMS NA CBA FILIAL BELÉM E CBA MINERAÇÃO
-- ============================================================================

UPDATE erp.feature_flags 
SET mode = 'new', updated_at = now() 
WHERE company_id IN ('filial-mugyw35c-lneymq', 'comp-1788898385141')
  AND module IN ('inventory', 'store_items');
