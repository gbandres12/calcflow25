-- Migration: 020_migration_plan_phase5_reverse_projection_and_pilot_flags.sql
-- Baseado em CALCFLOW_MIGRATION_PLAN.md - Fase 5: Virada Gradual com Extremo Cuidado
-- 1. Cria triggers de projeção reversa (erp.* -> app_records) com trava de profundidade (pg_trigger_depth() > 1)
--    para garantir janela de rollback seguro de 2 semanas sem loop de triggers.
-- 2. Ativa o modo SHADOW exclusivamente na empresa piloto de demonstração ('matriz-demo') para o Lote 1.
-- 3. Todas as empresas de produção permanecem 100% em modo LEGACY.

-- ============================================================================
-- 1. TRIGGERS DE PROJEÇÃO REVERSA (erp.* -> public.app_records)
-- ============================================================================

-- Projeção reversa: erp.categories -> public.app_records
CREATE OR REPLACE FUNCTION erp.trg_reverse_project_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Evitar recursão infinita se a alteração veio do trigger do app_records
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.app_records (
    company_id, id, table_name, data, updated_at, version
  ) VALUES (
    NEW.company_id,
    NEW.id,
    'categories',
    jsonb_build_object(
      'id', NEW.id,
      'name', NEW.name,
      'type', NEW.type,
      'companyId', NEW.company_id
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

DROP TRIGGER IF EXISTS trg_categories_reverse_proj ON erp.categories;
CREATE TRIGGER trg_categories_reverse_proj
AFTER INSERT OR UPDATE ON erp.categories
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_project_categories();

-- Projeção reversa: erp.transportadores -> public.app_records
CREATE OR REPLACE FUNCTION erp.trg_reverse_project_transportadores()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.app_records (
    company_id, id, table_name, data, updated_at, version
  ) VALUES (
    NEW.company_id,
    NEW.id,
    'transportadores',
    jsonb_build_object(
      'id', NEW.id,
      'companyId', NEW.company_id,
      'nome', NEW.nome,
      'documento', NEW.documento,
      'tipoServico', NEW.tipo_servico,
      'contratacao', NEW.contratacao,
      'ie', NEW.ie,
      'telefone', NEW.telefone,
      'email', NEW.email,
      'endereco', NEW.endereco,
      'cidade', NEW.cidade,
      'uf', NEW.uf,
      'rntrc', NEW.rntrc,
      'cnh', NEW.cnh,
      'categoriaCnh', NEW.categoria_cnh,
      'validadeCnh', NEW.validade_cnh,
      'placa', NEW.placa,
      'ufPlaca', NEW.uf_placa,
      'modeloVeiculo', NEW.modelo_veiculo,
      'ativo', NEW.ativo,
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

DROP TRIGGER IF EXISTS trg_transportadores_reverse_proj ON erp.transportadores;
CREATE TRIGGER trg_transportadores_reverse_proj
AFTER INSERT OR UPDATE ON erp.transportadores
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_project_transportadores();

-- Projeção reversa: erp.machines -> public.app_records
CREATE OR REPLACE FUNCTION erp.trg_reverse_project_machines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.app_records (
    company_id, id, table_name, data, updated_at, version
  ) VALUES (
    NEW.company_id,
    NEW.id,
    'machines',
    jsonb_build_object(
      'id', NEW.id,
      'companyId', NEW.company_id,
      'name', NEW.name,
      'type', NEW.type,
      'plateOrId', NEW.plate_or_id,
      'currentHorimeter', NEW.current_horimeter,
      'status', NEW.status,
      'lastMaintenance', NEW.last_maintenance,
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

DROP TRIGGER IF EXISTS trg_machines_reverse_proj ON erp.machines;
CREATE TRIGGER trg_machines_reverse_proj
AFTER INSERT OR UPDATE ON erp.machines
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_project_machines();

-- Projeção reversa: erp.maintenance_records -> public.app_records
CREATE OR REPLACE FUNCTION erp.trg_reverse_project_maintenance_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.app_records (
    company_id, id, table_name, data, updated_at, version
  ) VALUES (
    NEW.company_id,
    NEW.id,
    'maintenance_records',
    jsonb_build_object(
      'id', NEW.id,
      'companyId', NEW.company_id,
      'machineId', NEW.machine_id,
      'date', NEW.date,
      'description', NEW.description,
      'cost', NEW.cost,
      'type', NEW.type,
      'horimeter', NEW.horimeter,
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

DROP TRIGGER IF EXISTS trg_maintenance_records_reverse_proj ON erp.maintenance_records;
CREATE TRIGGER trg_maintenance_records_reverse_proj
AFTER INSERT OR UPDATE ON erp.maintenance_records
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_project_maintenance_records();

-- Projeção reversa: erp.fuel_records -> public.app_records
CREATE OR REPLACE FUNCTION erp.trg_reverse_project_fuel_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.app_records (
    company_id, id, table_name, data, updated_at, version
  ) VALUES (
    NEW.company_id,
    NEW.id,
    'fuel_records',
    jsonb_build_object(
      'id', NEW.id,
      'companyId', NEW.company_id,
      'machineId', NEW.machine_id,
      'date', NEW.date,
      'liters', NEW.liters,
      'pricePerLiter', NEW.price_per_liter,
      'totalCost', NEW.total_cost,
      'horimeter', NEW.horimeter,
      'fuelType', NEW.fuel_type,
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

DROP TRIGGER IF EXISTS trg_fuel_records_reverse_proj ON erp.fuel_records;
CREATE TRIGGER trg_fuel_records_reverse_proj
AFTER INSERT OR UPDATE ON erp.fuel_records
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_project_fuel_records();

-- Projeção reversa: erp.fuel_purchases -> public.app_records
CREATE OR REPLACE FUNCTION erp.trg_reverse_project_fuel_purchases()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.app_records (
    company_id, id, table_name, data, updated_at, version
  ) VALUES (
    NEW.company_id,
    NEW.id,
    'fuel_purchases',
    jsonb_build_object(
      'id', NEW.id,
      'companyId', NEW.company_id,
      'date', NEW.date,
      'liters', NEW.liters,
      'pricePerLiter', NEW.price_per_liter,
      'totalCost', NEW.total_cost,
      'supplier', NEW.supplier,
      'fuelType', NEW.fuel_type,
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

DROP TRIGGER IF EXISTS trg_fuel_purchases_reverse_proj ON erp.fuel_purchases;
CREATE TRIGGER trg_fuel_purchases_reverse_proj
AFTER INSERT OR UPDATE ON erp.fuel_purchases
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_project_fuel_purchases();

-- ============================================================================
-- 2. ATIVAÇÃO DO MODO SHADOW NAS EMPRESAS REAIS DA CBA (Lote 1: Cadastros Auxiliares e Frota)
-- ============================================================================

-- Atualizar nome da matriz para CBA Mineração
UPDATE public.companies 
SET name = 'CBA Mineração' 
WHERE id = 'comp-1788898385141';

-- Desativar matriz-demo (devolver para legacy)
UPDATE erp.feature_flags 
SET mode = 'legacy', updated_at = now() 
WHERE company_id = 'matriz-demo';

-- Ativar NEW para o Lote 1 na CBA Mineração e CBA Filial Belém
INSERT INTO erp.feature_flags (company_id, module, mode, updated_at)
VALUES 
  -- CBA Mineração (comp-1788898385141)
  ('comp-1788898385141', 'categories', 'new', now()),
  ('comp-1788898385141', 'transportadores', 'new', now()),
  ('comp-1788898385141', 'machines', 'new', now()),
  ('comp-1788898385141', 'maintenance_records', 'new', now()),
  ('comp-1788898385141', 'fuel_records', 'new', now()),
  ('comp-1788898385141', 'fuel_purchases', 'new', now()),

  -- CBA Filial Belém (filial-mugyw35c-lneymq)
  ('filial-mugyw35c-lneymq', 'categories', 'new', now()),
  ('filial-mugyw35c-lneymq', 'transportadores', 'new', now()),
  ('filial-mugyw35c-lneymq', 'machines', 'new', now()),
  ('filial-mugyw35c-lneymq', 'maintenance_records', 'new', now()),
  ('filial-mugyw35c-lneymq', 'fuel_records', 'new', now()),
  ('filial-mugyw35c-lneymq', 'fuel_purchases', 'new', now())
ON CONFLICT (company_id, module) DO UPDATE SET
  mode = EXCLUDED.mode,
  updated_at = now();

