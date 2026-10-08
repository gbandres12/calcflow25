-- Migration: 016_migration_plan_phase2_tables_and_backfill.sql
-- Baseado em CALCFLOW_MIGRATION_PLAN.md - Fase 2: Tabelas e Backfill Idempotente
-- Cria as tabelas estruturadas do schema erp para os módulos:
-- 1. categories
-- 2. transportadores
-- 3. machines
-- 4. maintenance_records
-- 5. fuel_records
-- 6. fuel_purchases
-- 7. customers
-- E define funções de backfill idempotente que copiam dados de public.app_records para erp.*

-- Função genérica de atualização de versão e data
CREATE OR REPLACE FUNCTION erp.trg_generic_version_and_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 1) + 1;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 1. erp.categories
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.categories (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('INFLOW', 'OUTFLOW')),
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  updated_by uuid NULL DEFAULT auth.uid(),
  deleted_at timestamptz NULL,
  extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_id, id)
);

ALTER TABLE erp.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select_policy" ON erp.categories
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = categories.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "categories_write_policy" ON erp.categories
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = categories.company_id
        AND cm.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_categories_version ON erp.categories;
CREATE TRIGGER trg_categories_version
BEFORE UPDATE ON erp.categories
FOR EACH ROW EXECUTE FUNCTION erp.trg_generic_version_and_updated_at();

-- ============================================================================
-- 2. erp.transportadores
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.transportadores (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  nome text NOT NULL,
  documento text NOT NULL DEFAULT '',
  tipo_servico text NOT NULL DEFAULT 'AMBOS',
  contratacao text NOT NULL DEFAULT 'CLIENTE',
  ie text NULL,
  telefone text NULL,
  email text NULL,
  endereco text NULL,
  cidade text NULL,
  uf text NULL,
  rntrc text NULL,
  cnh text NULL,
  categoria_cnh text NULL,
  validade_cnh text NULL,
  placa text NULL,
  uf_placa text NULL,
  modelo_veiculo text NULL,
  ativo boolean NOT NULL DEFAULT true,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  updated_by uuid NULL DEFAULT auth.uid(),
  deleted_at timestamptz NULL,
  extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_id, id)
);

ALTER TABLE erp.transportadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transportadores_select_policy" ON erp.transportadores
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = transportadores.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "transportadores_write_policy" ON erp.transportadores
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = transportadores.company_id
        AND cm.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_transportadores_version ON erp.transportadores;
CREATE TRIGGER trg_transportadores_version
BEFORE UPDATE ON erp.transportadores
FOR EACH ROW EXECUTE FUNCTION erp.trg_generic_version_and_updated_at();

-- ============================================================================
-- 3. erp.machines
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.machines (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'Outros',
  plate_or_id text NOT NULL DEFAULT '',
  current_horimeter numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Operacional',
  last_maintenance timestamptz NULL,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  updated_by uuid NULL DEFAULT auth.uid(),
  deleted_at timestamptz NULL,
  extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_id, id)
);

ALTER TABLE erp.machines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "machines_select_policy" ON erp.machines
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = machines.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "machines_write_policy" ON erp.machines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = machines.company_id
        AND cm.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_machines_version ON erp.machines;
CREATE TRIGGER trg_machines_version
BEFORE UPDATE ON erp.machines
FOR EACH ROW EXECUTE FUNCTION erp.trg_generic_version_and_updated_at();

-- ============================================================================
-- 4. erp.maintenance_records
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.maintenance_records (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  machine_id text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  description text NOT NULL DEFAULT '',
  cost numeric(14,2) NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'Preventiva',
  horimeter numeric(12,2) NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  updated_by uuid NULL DEFAULT auth.uid(),
  deleted_at timestamptz NULL,
  extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_id, id)
);

ALTER TABLE erp.maintenance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maintenance_records_select_policy" ON erp.maintenance_records
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = maintenance_records.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "maintenance_records_write_policy" ON erp.maintenance_records
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = maintenance_records.company_id
        AND cm.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_maintenance_records_version ON erp.maintenance_records;
CREATE TRIGGER trg_maintenance_records_version
BEFORE UPDATE ON erp.maintenance_records
FOR EACH ROW EXECUTE FUNCTION erp.trg_generic_version_and_updated_at();

-- ============================================================================
-- 5. erp.fuel_records
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.fuel_records (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  machine_id text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  liters numeric(12,3) NOT NULL DEFAULT 0,
  price_per_liter numeric(14,3) NOT NULL DEFAULT 0,
  total_cost numeric(14,2) NOT NULL DEFAULT 0,
  horimeter numeric(12,2) NOT NULL DEFAULT 0,
  fuel_type text NOT NULL DEFAULT 'DIESEL_S10',
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  updated_by uuid NULL DEFAULT auth.uid(),
  deleted_at timestamptz NULL,
  extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_id, id)
);

ALTER TABLE erp.fuel_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_records_select_policy" ON erp.fuel_records
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = fuel_records.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "fuel_records_write_policy" ON erp.fuel_records
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = fuel_records.company_id
        AND cm.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_fuel_records_version ON erp.fuel_records;
CREATE TRIGGER trg_fuel_records_version
BEFORE UPDATE ON erp.fuel_records
FOR EACH ROW EXECUTE FUNCTION erp.trg_generic_version_and_updated_at();

-- ============================================================================
-- 6. erp.fuel_purchases
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.fuel_purchases (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  liters numeric(12,3) NOT NULL DEFAULT 0,
  price_per_liter numeric(14,3) NOT NULL DEFAULT 0,
  total_cost numeric(14,2) NOT NULL DEFAULT 0,
  supplier text NOT NULL DEFAULT '',
  fuel_type text NOT NULL DEFAULT 'DIESEL_S10',
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  updated_by uuid NULL DEFAULT auth.uid(),
  deleted_at timestamptz NULL,
  extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_id, id)
);

ALTER TABLE erp.fuel_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_purchases_select_policy" ON erp.fuel_purchases
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = fuel_purchases.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "fuel_purchases_write_policy" ON erp.fuel_purchases
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = fuel_purchases.company_id
        AND cm.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_fuel_purchases_version ON erp.fuel_purchases;
CREATE TRIGGER trg_fuel_purchases_version
BEFORE UPDATE ON erp.fuel_purchases
FOR EACH ROW EXECUTE FUNCTION erp.trg_generic_version_and_updated_at();

-- ============================================================================
-- 7. erp.customers
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.customers (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  document text NOT NULL DEFAULT '',
  tipo_pessoa text NOT NULL DEFAULT 'PJ',
  ie text NULL,
  isento_ie boolean NOT NULL DEFAULT false,
  phone text NULL,
  email text NULL,
  street text NULL,
  number text NULL,
  neighborhood text NULL,
  city text NULL,
  state text NULL,
  zip_code text NULL,
  ibge_code text NULL,
  status text NOT NULL DEFAULT 'Ativo',
  notes text NULL,
  total_spent numeric(14,2) NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  updated_by uuid NULL DEFAULT auth.uid(),
  deleted_at timestamptz NULL,
  extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_id, id)
);

ALTER TABLE erp.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select_policy" ON erp.customers
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = customers.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "customers_write_policy" ON erp.customers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = customers.company_id
        AND cm.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_customers_version ON erp.customers;
CREATE TRIGGER trg_customers_version
BEFORE UPDATE ON erp.customers
FOR EACH ROW EXECUTE FUNCTION erp.trg_generic_version_and_updated_at();

-- Índices essenciais para consultas frequentes de clientes
CREATE INDEX IF NOT EXISTS idx_erp_customers_document ON erp.customers (company_id, document);
CREATE INDEX IF NOT EXISTS idx_erp_customers_name ON erp.customers (company_id, name);

-- ============================================================================
-- FUNÇÕES DE BACKFILL IDEMPOTENTE
-- ============================================================================

-- Backfill: categories
CREATE OR REPLACE FUNCTION erp.backfill_categories()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO erp.categories (
    company_id, id, name, type, version, created_at, updated_at, extra
  )
  SELECT 
    ar.company_id,
    ar.id,
    COALESCE(ar.data->>'name', 'Sem nome'),
    CASE WHEN ar.data->>'type' = 'OUTFLOW' THEN 'OUTFLOW' ELSE 'INFLOW' END,
    COALESCE(ar.version, 1),
    ar.updated_at,
    ar.updated_at,
    ar.data
  FROM public.app_records ar
  WHERE ar.table_name = 'categories'
    AND ar.id != '__seed__'
    AND COALESCE((ar.data->>'__isSeedMeta')::boolean, false) = false
  ON CONFLICT (company_id, id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    updated_at = EXCLUDED.updated_at,
    extra = EXCLUDED.extra;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Backfill: transportadores
CREATE OR REPLACE FUNCTION erp.backfill_transportadores()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO erp.transportadores (
    company_id, id, nome, documento, tipo_servico, contratacao,
    ie, telefone, email, endereco, cidade, uf, rntrc,
    cnh, categoria_cnh, validade_cnh, placa, uf_placa, modelo_veiculo,
    ativo, version, created_at, updated_at, extra
  )
  SELECT 
    ar.company_id,
    ar.id,
    COALESCE(ar.data->>'nome', 'Sem nome'),
    COALESCE(ar.data->>'documento', ''),
    COALESCE(ar.data->>'tipoServico', 'AMBOS'),
    COALESCE(ar.data->>'contratacao', 'CLIENTE'),
    ar.data->>'ie',
    ar.data->>'telefone',
    ar.data->>'email',
    ar.data->>'endereco',
    ar.data->>'cidade',
    ar.data->>'uf',
    ar.data->>'rntrc',
    ar.data->>'cnh',
    ar.data->>'categoriaCnh',
    ar.data->>'validadeCnh',
    ar.data->>'placa',
    ar.data->>'ufPlaca',
    ar.data->>'modeloVeiculo',
    COALESCE((ar.data->>'ativo')::boolean, true),
    COALESCE(ar.version, 1),
    COALESCE((ar.data->>'createdAt')::timestamptz, ar.updated_at),
    ar.updated_at,
    ar.data
  FROM public.app_records ar
  WHERE ar.table_name = 'transportadores'
    AND ar.id != '__seed__'
    AND COALESCE((ar.data->>'__isSeedMeta')::boolean, false) = false
  ON CONFLICT (company_id, id) DO UPDATE SET
    nome = EXCLUDED.nome,
    documento = EXCLUDED.documento,
    tipo_servico = EXCLUDED.tipo_servico,
    contratacao = EXCLUDED.contratacao,
    placa = EXCLUDED.placa,
    uf_placa = EXCLUDED.uf_placa,
    ativo = EXCLUDED.ativo,
    updated_at = EXCLUDED.updated_at,
    extra = EXCLUDED.extra;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Backfill: machines
CREATE OR REPLACE FUNCTION erp.backfill_machines()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO erp.machines (
    company_id, id, name, type, plate_or_id, current_horimeter,
    status, last_maintenance, version, created_at, updated_at, extra
  )
  SELECT 
    ar.company_id,
    ar.id,
    COALESCE(ar.data->>'name', 'Sem nome'),
    COALESCE(ar.data->>'type', 'Outros'),
    COALESCE(ar.data->>'plateOrId', ''),
    COALESCE((ar.data->>'currentHorimeter')::numeric, 0),
    COALESCE(ar.data->>'status', 'Operacional'),
    (ar.data->>'lastMaintenance')::timestamptz,
    COALESCE(ar.version, 1),
    ar.updated_at,
    ar.updated_at,
    ar.data
  FROM public.app_records ar
  WHERE ar.table_name = 'machines'
    AND ar.id != '__seed__'
    AND COALESCE((ar.data->>'__isSeedMeta')::boolean, false) = false
  ON CONFLICT (company_id, id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    plate_or_id = EXCLUDED.plate_or_id,
    current_horimeter = EXCLUDED.current_horimeter,
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at,
    extra = EXCLUDED.extra;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Backfill: maintenance_records
CREATE OR REPLACE FUNCTION erp.backfill_maintenance_records()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO erp.maintenance_records (
    company_id, id, machine_id, date, description, cost,
    type, horimeter, version, created_at, updated_at, extra
  )
  SELECT 
    ar.company_id,
    ar.id,
    COALESCE(ar.data->>'machineId', ''),
    COALESCE((ar.data->>'date')::date, (ar.updated_at)::date),
    COALESCE(ar.data->>'description', ''),
    COALESCE((ar.data->>'cost')::numeric, 0),
    COALESCE(ar.data->>'type', 'Preventiva'),
    COALESCE((ar.data->>'horimeter')::numeric, 0),
    COALESCE(ar.version, 1),
    ar.updated_at,
    ar.updated_at,
    ar.data
  FROM public.app_records ar
  WHERE ar.table_name = 'maintenance_records'
    AND ar.id != '__seed__'
    AND COALESCE((ar.data->>'__isSeedMeta')::boolean, false) = false
  ON CONFLICT (company_id, id) DO UPDATE SET
    description = EXCLUDED.description,
    cost = EXCLUDED.cost,
    horimeter = EXCLUDED.horimeter,
    updated_at = EXCLUDED.updated_at,
    extra = EXCLUDED.extra;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Backfill: fuel_records
CREATE OR REPLACE FUNCTION erp.backfill_fuel_records()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO erp.fuel_records (
    company_id, id, machine_id, date, liters, price_per_liter,
    total_cost, horimeter, fuel_type, version, created_at, updated_at, extra
  )
  SELECT 
    ar.company_id,
    ar.id,
    COALESCE(ar.data->>'machineId', ''),
    COALESCE((ar.data->>'date')::date, (ar.updated_at)::date),
    COALESCE((ar.data->>'liters')::numeric, 0),
    COALESCE((ar.data->>'pricePerLiter')::numeric, 0),
    COALESCE((ar.data->>'totalCost')::numeric, 0),
    COALESCE((ar.data->>'horimeter')::numeric, 0),
    COALESCE(ar.data->>'fuelType', 'DIESEL_S10'),
    COALESCE(ar.version, 1),
    ar.updated_at,
    ar.updated_at,
    ar.data
  FROM public.app_records ar
  WHERE ar.table_name = 'fuel_records'
    AND ar.id != '__seed__'
    AND COALESCE((ar.data->>'__isSeedMeta')::boolean, false) = false
  ON CONFLICT (company_id, id) DO UPDATE SET
    liters = EXCLUDED.liters,
    price_per_liter = EXCLUDED.price_per_liter,
    total_cost = EXCLUDED.total_cost,
    horimeter = EXCLUDED.horimeter,
    updated_at = EXCLUDED.updated_at,
    extra = EXCLUDED.extra;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Backfill: fuel_purchases
CREATE OR REPLACE FUNCTION erp.backfill_fuel_purchases()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO erp.fuel_purchases (
    company_id, id, date, liters, price_per_liter, total_cost,
    supplier, fuel_type, version, created_at, updated_at, extra
  )
  SELECT 
    ar.company_id,
    ar.id,
    COALESCE((ar.data->>'date')::date, (ar.updated_at)::date),
    COALESCE((ar.data->>'liters')::numeric, 0),
    COALESCE((ar.data->>'pricePerLiter')::numeric, 0),
    COALESCE((ar.data->>'totalCost')::numeric, 0),
    COALESCE(ar.data->>'supplier', ''),
    COALESCE(ar.data->>'fuelType', 'DIESEL_S10'),
    COALESCE(ar.version, 1),
    ar.updated_at,
    ar.updated_at,
    ar.data
  FROM public.app_records ar
  WHERE ar.table_name = 'fuel_purchases'
    AND ar.id != '__seed__'
    AND COALESCE((ar.data->>'__isSeedMeta')::boolean, false) = false
  ON CONFLICT (company_id, id) DO UPDATE SET
    liters = EXCLUDED.liters,
    price_per_liter = EXCLUDED.price_per_liter,
    total_cost = EXCLUDED.total_cost,
    supplier = EXCLUDED.supplier,
    updated_at = EXCLUDED.updated_at,
    extra = EXCLUDED.extra;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Backfill: customers
CREATE OR REPLACE FUNCTION erp.backfill_customers()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO erp.customers (
    company_id, id, name, document, tipo_pessoa, ie, isento_ie,
    phone, email, street, number, neighborhood, city, state, zip_code,
    ibge_code, status, notes, total_spent, version, created_at, updated_at, extra
  )
  SELECT 
    ar.company_id,
    ar.id,
    COALESCE(ar.data->>'name', 'Sem nome'),
    COALESCE(ar.data->>'document', ''),
    COALESCE(ar.data->>'tipoPessoa', 'PJ'),
    ar.data->>'ie',
    COALESCE((ar.data->>'isentoIE')::boolean, false),
    ar.data->>'phone',
    ar.data->>'email',
    ar.data->>'street',
    ar.data->>'number',
    ar.data->>'neighborhood',
    ar.data->>'city',
    ar.data->>'state',
    ar.data->>'zipCode',
    ar.data->>'ibgeCode',
    COALESCE(ar.data->>'status', 'Ativo'),
    ar.data->>'notes',
    COALESCE((ar.data->>'totalSpent')::numeric, 0),
    COALESCE(ar.version, 1),
    ar.updated_at,
    ar.updated_at,
    ar.data
  FROM public.app_records ar
  WHERE ar.table_name = 'customers'
    AND ar.id != '__seed__'
    AND COALESCE((ar.data->>'__isSeedMeta')::boolean, false) = false
  ON CONFLICT (company_id, id) DO UPDATE SET
    name = EXCLUDED.name,
    document = EXCLUDED.document,
    tipo_pessoa = EXCLUDED.tipo_pessoa,
    ie = EXCLUDED.ie,
    isento_ie = EXCLUDED.isento_ie,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    street = EXCLUDED.street,
    number = EXCLUDED.number,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    zip_code = EXCLUDED.zip_code,
    ibge_code = EXCLUDED.ibge_code,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    total_spent = EXCLUDED.total_spent,
    updated_at = EXCLUDED.updated_at,
    extra = EXCLUDED.extra;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
