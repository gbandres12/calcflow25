-- Migration: 017_migration_plan_phase2_inventory_finance_orders.sql
-- Baseado em CALCFLOW_MIGRATION_PLAN.md - Fase 2: Tabelas de Produtos, Estoque, Financeiro e Vendas
-- Cria tabelas relacionais especializadas com PK composta (company_id, id) e rotinas de backfill idempotente.

-- ============================================================================
-- 1. erp.products (Catálogo de produtos acabados / matérias-primas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.products (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  code text NOT NULL DEFAULT '',
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'Ton',
  category text NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  min_stock numeric(14,3) NOT NULL DEFAULT 0,
  cost_price numeric(14,2) NOT NULL DEFAULT 0,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  ncm text NULL,
  cst text NULL,
  cfop text NULL,
  origem text NULL,
  aliquota_icms numeric(5,2) NULL,
  aliquota_pis numeric(5,2) NULL,
  aliquota_cofins numeric(5,2) NULL,
  unidade_tributavel text NULL,
  observacoes_fiscais text NULL,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  updated_by uuid NULL DEFAULT auth.uid(),
  deleted_at timestamptz NULL,
  extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_id, id)
);

ALTER TABLE erp.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_policy" ON erp.products
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = products.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "products_write_policy" ON erp.products
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = products.company_id
        AND cm.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_products_version ON erp.products;
CREATE TRIGGER trg_products_version
BEFORE UPDATE ON erp.products
FOR EACH ROW EXECUTE FUNCTION erp.trg_generic_version_and_updated_at();

-- ============================================================================
-- 2. erp.store_items (Almoxarifado, peças e insumos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.store_items (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Peças',
  unit text NOT NULL DEFAULT 'UN',
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  min_stock numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost numeric(14,2) NULL,
  supplier_sku text NULL,
  supplier_cnpj text NULL,
  ncm text NULL,
  status text NOT NULL DEFAULT 'ativo',
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  updated_by uuid NULL DEFAULT auth.uid(),
  deleted_at timestamptz NULL,
  extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_id, id)
);

ALTER TABLE erp.store_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_items_select_policy" ON erp.store_items
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = store_items.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "store_items_write_policy" ON erp.store_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = store_items.company_id
        AND cm.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_store_items_version ON erp.store_items;
CREATE TRIGGER trg_store_items_version
BEFORE UPDATE ON erp.store_items
FOR EACH ROW EXECUTE FUNCTION erp.trg_generic_version_and_updated_at();

-- ============================================================================
-- 3. erp.stock_movements (Livro imutável de movimentação de estoque)
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.stock_movements (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  item_kind text NOT NULL CHECK (item_kind IN ('product', 'store_item')),
  item_id text NOT NULL,
  delta numeric(14,3) NOT NULL,
  balance_after numeric(14,3) NOT NULL DEFAULT 0,
  reason text NOT NULL,
  source_table text NULL,
  source_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  PRIMARY KEY (company_id, id)
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_lookup 
ON erp.stock_movements (company_id, item_kind, item_id, created_at DESC);

ALTER TABLE erp.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_movements_select_policy" ON erp.stock_movements
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = stock_movements.company_id
        AND cm.user_id = auth.uid()
    )
  );

-- Imutabilidade do histórico de estoque
DROP TRIGGER IF EXISTS trg_stock_movements_immutable ON erp.stock_movements;
CREATE TRIGGER trg_stock_movements_immutable
BEFORE UPDATE OR DELETE ON erp.stock_movements
FOR EACH ROW
EXECUTE FUNCTION erp.prevent_audit_mutation();

-- Trigger que atualiza o saldo atômico do item ao inserir movimento
CREATE OR REPLACE FUNCTION erp.trg_apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance numeric(14,3);
BEGIN
  IF NEW.item_kind = 'product' THEN
    UPDATE erp.products
    SET quantity = quantity + NEW.delta, updated_at = now()
    WHERE company_id = NEW.company_id AND id = NEW.item_id
    RETURNING quantity INTO v_new_balance;
  ELSIF NEW.item_kind = 'store_item' THEN
    UPDATE erp.store_items
    SET quantity = quantity + NEW.delta, updated_at = now()
    WHERE company_id = NEW.company_id AND id = NEW.item_id
    RETURNING quantity INTO v_new_balance;
  END IF;

  NEW.balance_after := COALESCE(v_new_balance, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_movements_apply ON erp.stock_movements;
CREATE TRIGGER trg_stock_movements_apply
BEFORE INSERT ON erp.stock_movements
FOR EACH ROW
EXECUTE FUNCTION erp.trg_apply_stock_movement();

-- ============================================================================
-- 4. erp.financial_accounts (Contas bancárias e caixas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.financial_accounts (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'banco',
  bank_name text NULL,
  agency text NULL,
  account_number text NULL,
  initial_balance numeric(14,2) NOT NULL DEFAULT 0,
  current_balance numeric(14,2) NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  updated_by uuid NULL DEFAULT auth.uid(),
  deleted_at timestamptz NULL,
  extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_id, id)
);

ALTER TABLE erp.financial_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financial_accounts_select_policy" ON erp.financial_accounts
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = financial_accounts.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "financial_accounts_write_policy" ON erp.financial_accounts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = financial_accounts.company_id
        AND cm.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_financial_accounts_version ON erp.financial_accounts;
CREATE TRIGGER trg_financial_accounts_version
BEFORE UPDATE ON erp.financial_accounts
FOR EACH ROW EXECUTE FUNCTION erp.trg_generic_version_and_updated_at();

-- ============================================================================
-- 5. erp.transactions (Lançamentos de Contas a Receber / Pagar / Caixa)
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.transactions (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  description text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'SALE',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  date date NOT NULL DEFAULT current_date,
  payment_date date NULL,
  category text NULL,
  account_id text NULL,
  order_id text NULL,
  customer_id text NULL,
  receipt_id text NULL,
  cost_center_id text NULL,
  payment_method text NULL,
  notes text NULL,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  updated_by uuid NULL DEFAULT auth.uid(),
  deleted_at timestamptz NULL,
  extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_id, id)
);

CREATE INDEX IF NOT EXISTS idx_erp_transactions_scope ON erp.transactions (company_id, account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_erp_transactions_order ON erp.transactions (company_id, order_id);

ALTER TABLE erp.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions_select_policy" ON erp.transactions
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = transactions.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "transactions_write_policy" ON erp.transactions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = transactions.company_id
        AND cm.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_transactions_version ON erp.transactions;
CREATE TRIGGER trg_transactions_version
BEFORE UPDATE ON erp.transactions
FOR EACH ROW EXECUTE FUNCTION erp.trg_generic_version_and_updated_at();

-- ============================================================================
-- 6. erp.transaction_payments (Baixas e pagamentos de lançamentos financeiros)
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.transaction_payments (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  transaction_id text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT current_date,
  payment_method text NULL,
  account_id text NULL,
  receipt_id text NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, transaction_id) REFERENCES erp.transactions(company_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_erp_tx_payments_tx ON erp.transaction_payments (company_id, transaction_id);

ALTER TABLE erp.transaction_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tx_payments_select_policy" ON erp.transaction_payments
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = transaction_payments.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "tx_payments_write_policy" ON erp.transaction_payments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = transaction_payments.company_id
        AND cm.user_id = auth.uid()
    )
  );

-- Trigger que recalcula paid_amount na transação pai a partir das baixas
CREATE OR REPLACE FUNCTION erp.trg_sync_transaction_paid_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
  v_tx_id text;
  v_total_paid numeric(14,2);
  v_orig_amount numeric(14,2);
BEGIN
  v_company_id := COALESCE(NEW.company_id, OLD.company_id);
  v_tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM erp.transaction_payments
  WHERE company_id = v_company_id AND transaction_id = v_tx_id;

  SELECT amount INTO v_orig_amount
  FROM erp.transactions
  WHERE company_id = v_company_id AND id = v_tx_id;

  UPDATE erp.transactions
  SET 
    paid_amount = v_total_paid,
    status = CASE 
      WHEN v_total_paid >= v_orig_amount AND v_orig_amount > 0 THEN 'pago'
      WHEN v_total_paid > 0 THEN 'parcial'
      ELSE status
    END,
    updated_at = now()
  WHERE company_id = v_company_id AND id = v_tx_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_tx_payments_sync ON erp.transaction_payments;
CREATE TRIGGER trg_tx_payments_sync
AFTER INSERT OR UPDATE OR DELETE ON erp.transaction_payments
FOR EACH ROW
EXECUTE FUNCTION erp.trg_sync_transaction_paid_amount();

-- ============================================================================
-- 7. erp.sales_orders (Cabeçalho do Pedido de Venda)
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.sales_orders (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  reference text NULL,
  customer_id text NOT NULL,
  date timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'Orçamento',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  seller_name text NULL,
  without_finance boolean NOT NULL DEFAULT false,
  payment_method text NULL,
  is_avulsa boolean NOT NULL DEFAULT false,
  shipping jsonb NULL,
  frete jsonb NULL,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  updated_by uuid NULL DEFAULT auth.uid(),
  deleted_at timestamptz NULL,
  extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, customer_id) REFERENCES erp.customers(company_id, id)
);

CREATE INDEX IF NOT EXISTS idx_erp_orders_customer ON erp.sales_orders (company_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_erp_orders_date ON erp.sales_orders (company_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_erp_orders_ref ON erp.sales_orders (company_id, reference);

ALTER TABLE erp.sales_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_orders_select_policy" ON erp.sales_orders
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = sales_orders.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "sales_orders_write_policy" ON erp.sales_orders
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = sales_orders.company_id
        AND cm.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_sales_orders_version ON erp.sales_orders;
CREATE TRIGGER trg_sales_orders_version
BEFORE UPDATE ON erp.sales_orders
FOR EACH ROW EXECUTE FUNCTION erp.trg_generic_version_and_updated_at();

-- ============================================================================
-- 8. erp.sales_order_items (Itens de produto do pedido de venda)
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.sales_order_items (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  order_id text NOT NULL,
  product_id text NULL,
  product_code text NULL,
  product_name text NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'Ton',
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  ncm text NULL,
  cst text NULL,
  cfop text NULL,
  extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, order_id) REFERENCES erp.sales_orders(company_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_erp_order_items_order ON erp.sales_order_items (company_id, order_id);

ALTER TABLE erp.sales_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_order_items_select" ON erp.sales_order_items
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = sales_order_items.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "sales_order_items_write" ON erp.sales_order_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = sales_order_items.company_id
        AND cm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 9. erp.sales_order_installments (Parcelas programadas do pedido)
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.sales_order_installments (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  order_id text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  due_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'PENDENTE',
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text NULL,
  receipt_id text NULL,
  extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, order_id) REFERENCES erp.sales_orders(company_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_erp_order_inst_order ON erp.sales_order_installments (company_id, order_id);

ALTER TABLE erp.sales_order_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_order_inst_select" ON erp.sales_order_installments
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = sales_order_installments.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "sales_order_inst_write" ON erp.sales_order_installments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = sales_order_installments.company_id
        AND cm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 10. erp.sales_order_receipts (Recibos emitidos no pedido de venda)
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.sales_order_receipts (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  order_id text NOT NULL,
  customer_id text NULL,
  order_reference text NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT current_date,
  payment_method text NULL,
  account_id text NULL,
  received_by text NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, order_id) REFERENCES erp.sales_orders(company_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_erp_order_receipts_order ON erp.sales_order_receipts (company_id, order_id);

ALTER TABLE erp.sales_order_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_order_receipts_select" ON erp.sales_order_receipts
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = sales_order_receipts.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "sales_order_receipts_write" ON erp.sales_order_receipts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = sales_order_receipts.company_id
        AND cm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 11. erp.sales_order_withdrawals (Retiradas / Pesagens de caminhão no pátio)
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.sales_order_withdrawals (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  order_id text NOT NULL,
  date timestamptz NOT NULL DEFAULT now(),
  net_weight numeric(14,3) NOT NULL DEFAULT 0,
  truck_plate text NULL,
  driver_name text NULL,
  carrier_name text NULL,
  ticket_number text NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid(),
  extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, order_id) REFERENCES erp.sales_orders(company_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_erp_order_withd_order ON erp.sales_order_withdrawals (company_id, order_id);

ALTER TABLE erp.sales_order_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_order_withd_select" ON erp.sales_order_withdrawals
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = sales_order_withdrawals.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "sales_order_withd_write" ON erp.sales_order_withdrawals
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = sales_order_withdrawals.company_id
        AND cm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 12. erp.sales_order_nfes (Notas fiscais emitidas no pedido)
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp.sales_order_nfes (
  company_id text NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id text NOT NULL,
  order_id text NOT NULL,
  chave text NULL,
  numero text NULL,
  serie text NULL,
  status text NOT NULL DEFAULT 'draft',
  emissao timestamptz NULL,
  protocolo text NULL,
  danfe_url text NULL,
  xml_url text NULL,
  nfe_payload jsonb NULL,
  nfe_response jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, order_id) REFERENCES erp.sales_orders(company_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_erp_order_nfes_order ON erp.sales_order_nfes (company_id, order_id);
CREATE INDEX IF NOT EXISTS idx_erp_order_nfes_chave ON erp.sales_order_nfes (company_id, chave);

ALTER TABLE erp.sales_order_nfes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_order_nfes_select" ON erp.sales_order_nfes
  FOR SELECT TO authenticated, anon
  USING (
    company_id = 'matriz-demo' OR
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = sales_order_nfes.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "sales_order_nfes_write" ON erp.sales_order_nfes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = sales_order_nfes.company_id
        AND cm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- FUNÇÕES DE BACKFILL IDEMPOTENTE
-- ============================================================================

-- Backfill: products
CREATE OR REPLACE FUNCTION erp.backfill_products()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO erp.products (
    company_id, id, code, name, unit, category, quantity, min_stock,
    cost_price, unit_price, ncm, cst, cfop, origem,
    aliquota_icms, aliquota_pis, aliquota_cofins, unidade_tributavel, observacoes_fiscais,
    version, created_at, updated_at, extra
  )
  SELECT 
    ar.company_id,
    ar.id,
    COALESCE(ar.data->>'code', ''),
    COALESCE(ar.data->>'name', 'Sem nome'),
    COALESCE(ar.data->>'unit', 'Ton'),
    ar.data->>'category',
    COALESCE((ar.data->>'quantity')::numeric, 0),
    COALESCE((ar.data->>'minStock')::numeric, 0),
    COALESCE((ar.data->>'costPrice')::numeric, 0),
    COALESCE((ar.data->>'unitPrice')::numeric, 0),
    ar.data->>'ncm',
    ar.data->>'cst',
    ar.data->>'cfop',
    ar.data->>'origem',
    (ar.data->>'aliquotaIcms')::numeric,
    (ar.data->>'aliquotaPis')::numeric,
    (ar.data->>'aliquotaCofins')::numeric,
    ar.data->>'unidadeTributavel',
    ar.data->>'observacoesFiscais',
    COALESCE(ar.version, 1),
    ar.updated_at,
    ar.updated_at,
    ar.data
  FROM public.app_records ar
  WHERE ar.table_name = 'inventory'
    AND ar.id != '__seed__'
    AND COALESCE((ar.data->>'__isSeedMeta')::boolean, false) = false
  ON CONFLICT (company_id, id) DO UPDATE SET
    code = EXCLUDED.code,
    name = EXCLUDED.name,
    unit = EXCLUDED.unit,
    category = EXCLUDED.category,
    quantity = EXCLUDED.quantity,
    min_stock = EXCLUDED.min_stock,
    cost_price = EXCLUDED.cost_price,
    unit_price = EXCLUDED.unit_price,
    ncm = EXCLUDED.ncm,
    cst = EXCLUDED.cst,
    cfop = EXCLUDED.cfop,
    updated_at = EXCLUDED.updated_at,
    extra = EXCLUDED.extra;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Criar movimento de abertura 'saldo inicial' para cada produto se ainda não existir
  INSERT INTO erp.stock_movements (
    company_id, id, item_kind, item_id, delta, balance_after, reason, source_table, source_id
  )
  SELECT 
    p.company_id,
    'init-prod-' || p.id,
    'product',
    p.id,
    0, -- delta 0 pois a quantidade já foi inserida no produto diretamente
    p.quantity,
    'Saldo inicial da migração para schema erp',
    'app_records',
    p.id
  FROM erp.products p
  ON CONFLICT (company_id, id) DO NOTHING;

  RETURN v_count;
END;
$$;

-- Backfill: store_items
CREATE OR REPLACE FUNCTION erp.backfill_store_items()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO erp.store_items (
    company_id, id, name, category, unit, quantity, min_stock, unit_cost,
    supplier_sku, supplier_cnpj, ncm, status, version, created_at, updated_at, extra
  )
  SELECT 
    ar.company_id,
    ar.id,
    COALESCE(ar.data->>'name', 'Sem nome'),
    COALESCE(ar.data->>'category', 'Peças'),
    COALESCE(ar.data->>'unit', 'UN'),
    COALESCE((ar.data->>'quantity')::numeric, 0),
    COALESCE((ar.data->>'minStock')::numeric, 0),
    (ar.data->>'unitCost')::numeric,
    ar.data->>'supplierSku',
    ar.data->>'supplierCnpj',
    ar.data->>'ncm',
    COALESCE(ar.data->>'status', 'ativo'),
    COALESCE(ar.version, 1),
    ar.updated_at,
    ar.updated_at,
    ar.data
  FROM public.app_records ar
  WHERE ar.table_name = 'store_items'
    AND ar.id != '__seed__'
    AND COALESCE((ar.data->>'__isSeedMeta')::boolean, false) = false
  ON CONFLICT (company_id, id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    unit = EXCLUDED.unit,
    quantity = EXCLUDED.quantity,
    min_stock = EXCLUDED.min_stock,
    unit_cost = EXCLUDED.unit_cost,
    updated_at = EXCLUDED.updated_at,
    extra = EXCLUDED.extra;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO erp.stock_movements (
    company_id, id, item_kind, item_id, delta, balance_after, reason, source_table, source_id
  )
  SELECT 
    s.company_id,
    'init-store-' || s.id,
    'store_item',
    s.id,
    0,
    s.quantity,
    'Saldo inicial da migração para schema erp',
    'app_records',
    s.id
  FROM erp.store_items s
  ON CONFLICT (company_id, id) DO NOTHING;

  RETURN v_count;
END;
$$;

-- Backfill: financial_accounts
CREATE OR REPLACE FUNCTION erp.backfill_financial_accounts()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO erp.financial_accounts (
    company_id, id, name, type, bank_name, agency, account_number,
    initial_balance, current_balance, version, created_at, updated_at, extra
  )
  SELECT 
    ar.company_id,
    ar.id,
    COALESCE(ar.data->>'name', 'Conta Principal'),
    COALESCE(ar.data->>'type', 'banco'),
    ar.data->>'bankName',
    ar.data->>'agency',
    ar.data->>'accountNumber',
    COALESCE((ar.data->>'initialBalance')::numeric, 0),
    COALESCE((ar.data->>'currentBalance')::numeric, COALESCE((ar.data->>'initialBalance')::numeric, 0)),
    COALESCE(ar.version, 1),
    ar.updated_at,
    ar.updated_at,
    ar.data
  FROM public.app_records ar
  WHERE ar.table_name = 'financial_accounts'
    AND ar.id != '__seed__'
    AND COALESCE((ar.data->>'__isSeedMeta')::boolean, false) = false
  ON CONFLICT (company_id, id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    bank_name = EXCLUDED.bank_name,
    agency = EXCLUDED.agency,
    account_number = EXCLUDED.account_number,
    initial_balance = EXCLUDED.initial_balance,
    current_balance = EXCLUDED.current_balance,
    updated_at = EXCLUDED.updated_at,
    extra = EXCLUDED.extra;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Backfill: transactions e transaction_payments
CREATE OR REPLACE FUNCTION erp.backfill_transactions()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int := 0;
BEGIN
  -- 1. Inserir cabeçalho das transações
  INSERT INTO erp.transactions (
    company_id, id, description, type, amount, paid_amount, status,
    date, payment_date, category, account_id, order_id, customer_id,
    receipt_id, cost_center_id, payment_method, notes,
    version, created_at, updated_at, extra
  )
  SELECT 
    ar.company_id,
    ar.id,
    COALESCE(ar.data->>'description', ''),
    COALESCE(ar.data->>'type', 'SALE'),
    COALESCE((ar.data->>'amount')::numeric, 0),
    COALESCE((ar.data->>'paidAmount')::numeric, 0),
    COALESCE(ar.data->>'status', 'pendente'),
    COALESCE((ar.data->>'date')::date, (ar.updated_at)::date),
    (ar.data->>'paymentDate')::date,
    ar.data->>'category',
    ar.data->>'accountId',
    ar.data->>'orderId',
    ar.data->>'customerId',
    ar.data->>'receiptId',
    ar.data->>'costCenterId',
    ar.data->>'paymentMethod',
    ar.data->>'notes',
    COALESCE(ar.version, 1),
    ar.updated_at,
    ar.updated_at,
    ar.data
  FROM public.app_records ar
  WHERE ar.table_name = 'transactions'
    AND ar.id != '__seed__'
    AND COALESCE((ar.data->>'__isSeedMeta')::boolean, false) = false
  ON CONFLICT (company_id, id) DO UPDATE SET
    description = EXCLUDED.description,
    type = EXCLUDED.type,
    amount = EXCLUDED.amount,
    paid_amount = EXCLUDED.paid_amount,
    status = EXCLUDED.status,
    date = EXCLUDED.date,
    payment_date = EXCLUDED.payment_date,
    category = EXCLUDED.category,
    account_id = EXCLUDED.account_id,
    order_id = EXCLUDED.order_id,
    customer_id = EXCLUDED.customer_id,
    receipt_id = EXCLUDED.receipt_id,
    updated_at = EXCLUDED.updated_at,
    extra = EXCLUDED.extra;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 2. Explodir o array payments[] em linhas da tabela filha transaction_payments
  INSERT INTO erp.transaction_payments (
    company_id, id, transaction_id, amount, payment_date, payment_method, account_id, receipt_id, notes, created_at
  )
  SELECT 
    ar.company_id,
    COALESCE(p->>'id', 'pmt-' || ar.id || '-' || (row_number() OVER (PARTITION BY ar.id))),
    ar.id,
    COALESCE((p->>'amount')::numeric, 0),
    COALESCE((p->>'paymentDate')::date, (ar.updated_at)::date),
    p->>'paymentMethod',
    p->>'accountId',
    p->>'receiptId',
    p->>'notes',
    ar.updated_at
  FROM public.app_records ar,
       jsonb_array_elements(ar.data->'payments') AS p
  WHERE ar.table_name = 'transactions'
    AND ar.id != '__seed__'
    AND jsonb_typeof(ar.data->'payments') = 'array'
  ON CONFLICT (company_id, id) DO UPDATE SET
    amount = EXCLUDED.amount,
    payment_date = EXCLUDED.payment_date,
    payment_method = EXCLUDED.payment_method,
    account_id = EXCLUDED.account_id,
    receipt_id = EXCLUDED.receipt_id;

  RETURN v_count;
END;
$$;

-- Backfill: sales_orders e tabelas filhas (items, installments, receipts, withdrawals, nfes)
CREATE OR REPLACE FUNCTION erp.backfill_sales_orders()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int := 0;
BEGIN
  -- 1. Inserir clientes de pedidos que porventura não estejam cadastrados em erp.customers para não violar FK
  INSERT INTO erp.customers (company_id, id, name, created_at, updated_at)
  SELECT DISTINCT 
    ar.company_id,
    ar.data->>'customerId',
    'Cliente ' || (ar.data->>'customerId'),
    now(),
    now()
  FROM public.app_records ar
  WHERE ar.table_name = 'sales_orders'
    AND ar.data->>'customerId' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM erp.customers c
      WHERE c.company_id = ar.company_id AND c.id = ar.data->>'customerId'
    )
  ON CONFLICT (company_id, id) DO NOTHING;

  -- 2. Inserir cabeçalho dos pedidos
  INSERT INTO erp.sales_orders (
    company_id, id, reference, customer_id, date, status,
    subtotal, discount, total, seller_name, without_finance,
    payment_method, is_avulsa, shipping, frete,
    version, created_at, updated_at, extra
  )
  SELECT 
    ar.company_id,
    ar.id,
    ar.data->>'reference',
    ar.data->>'customerId',
    COALESCE((ar.data->>'date')::timestamptz, ar.updated_at),
    COALESCE(ar.data->>'status', 'Orçamento'),
    COALESCE((ar.data->>'subtotal')::numeric, 0),
    COALESCE((ar.data->>'discount')::numeric, 0),
    COALESCE((ar.data->>'total')::numeric, 0),
    ar.data->>'sellerName',
    COALESCE((ar.data->>'withoutFinance')::boolean, false),
    ar.data->>'paymentMethod',
    COALESCE((ar.data->>'isAvulsa')::boolean, false),
    ar.data->'shipping',
    ar.data->'frete',
    COALESCE(ar.version, 1),
    ar.updated_at,
    ar.updated_at,
    ar.data
  FROM public.app_records ar
  WHERE ar.table_name = 'sales_orders'
    AND ar.id != '__seed__'
    AND ar.data->>'customerId' IS NOT NULL
    AND COALESCE((ar.data->>'__isSeedMeta')::boolean, false) = false
  ON CONFLICT (company_id, id) DO UPDATE SET
    reference = EXCLUDED.reference,
    customer_id = EXCLUDED.customer_id,
    date = EXCLUDED.date,
    status = EXCLUDED.status,
    subtotal = EXCLUDED.subtotal,
    discount = EXCLUDED.discount,
    total = EXCLUDED.total,
    seller_name = EXCLUDED.seller_name,
    without_finance = EXCLUDED.without_finance,
    payment_method = EXCLUDED.payment_method,
    updated_at = EXCLUDED.updated_at,
    extra = EXCLUDED.extra;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 3. Explodir items[] em erp.sales_order_items
  INSERT INTO erp.sales_order_items (
    company_id, id, order_id, product_id, product_code, product_name,
    quantity, unit, unit_price, discount, total, ncm, cst, cfop, extra
  )
  SELECT 
    ar.company_id,
    COALESCE(it->>'id', 'item-' || ar.id || '-' || (row_number() OVER (PARTITION BY ar.id))),
    ar.id,
    it->>'productId',
    it->>'productCode',
    COALESCE(it->>'productName', 'Produto'),
    COALESCE((it->>'quantity')::numeric, 0),
    COALESCE(it->>'unit', 'Ton'),
    COALESCE((it->>'unitPrice')::numeric, 0),
    COALESCE((it->>'discount')::numeric, 0),
    COALESCE((it->>'total')::numeric, 0),
    it->>'ncm',
    it->>'cst',
    it->>'cfop',
    it
  FROM public.app_records ar,
       jsonb_array_elements(ar.data->'items') AS it
  WHERE ar.table_name = 'sales_orders'
    AND ar.id != '__seed__'
    AND jsonb_typeof(ar.data->'items') = 'array'
  ON CONFLICT (company_id, id) DO UPDATE SET
    quantity = EXCLUDED.quantity,
    unit_price = EXCLUDED.unit_price,
    total = EXCLUDED.total;

  -- 4. Explodir payments[] (parcelas) em erp.sales_order_installments
  INSERT INTO erp.sales_order_installments (
    company_id, id, order_id, amount, due_date, status, paid_amount, payment_method, receipt_id, extra
  )
  SELECT 
    ar.company_id,
    COALESCE(p->>'id', 'inst-' || ar.id || '-' || (row_number() OVER (PARTITION BY ar.id))),
    ar.id,
    COALESCE((p->>'amount')::numeric, 0),
    COALESCE((p->>'dueDate')::date, (p->>'date')::date, (ar.updated_at)::date),
    COALESCE(p->>'status', 'PENDENTE'),
    COALESCE((p->>'paidAmount')::numeric, 0),
    p->>'paymentMethod',
    p->>'receiptId',
    p
  FROM public.app_records ar,
       jsonb_array_elements(ar.data->'payments') AS p
  WHERE ar.table_name = 'sales_orders'
    AND ar.id != '__seed__'
    AND jsonb_typeof(ar.data->'payments') = 'array'
  ON CONFLICT (company_id, id) DO UPDATE SET
    amount = EXCLUDED.amount,
    status = EXCLUDED.status,
    paid_amount = EXCLUDED.paid_amount;

  -- 5. Explodir receipts[] (recibos) em erp.sales_order_receipts
  INSERT INTO erp.sales_order_receipts (
    company_id, id, order_id, customer_id, order_reference, amount,
    payment_date, payment_method, account_id, received_by, notes, created_at, extra
  )
  SELECT 
    ar.company_id,
    COALESCE(r->>'id', 'rec-' || ar.id || '-' || (row_number() OVER (PARTITION BY ar.id))),
    ar.id,
    COALESCE(r->>'customerId', ar.data->>'customerId'),
    r->>'orderReference',
    COALESCE((r->>'amount')::numeric, 0),
    COALESCE((r->>'date')::date, (ar.updated_at)::date),
    r->>'paymentMethod',
    r->>'accountId',
    r->>'receivedBy',
    r->>'notes',
    COALESCE((r->>'createdAt')::timestamptz, ar.updated_at),
    r
  FROM public.app_records ar,
       jsonb_array_elements(ar.data->'receipts') AS r
  WHERE ar.table_name = 'sales_orders'
    AND ar.id != '__seed__'
    AND jsonb_typeof(ar.data->'receipts') = 'array'
  ON CONFLICT (company_id, id) DO UPDATE SET
    amount = EXCLUDED.amount,
    payment_date = EXCLUDED.payment_date;

  -- 6. Explodir withdrawals[] (retiradas / balança) em erp.sales_order_withdrawals
  INSERT INTO erp.sales_order_withdrawals (
    company_id, id, order_id, date, net_weight, truck_plate, driver_name,
    carrier_name, ticket_number, notes, created_at, extra
  )
  SELECT 
    ar.company_id,
    COALESCE(w->>'id', 'wth-' || ar.id || '-' || (row_number() OVER (PARTITION BY ar.id))),
    ar.id,
    COALESCE((w->>'date')::timestamptz, ar.updated_at),
    COALESCE((w->>'netWeight')::numeric, (w->>'quantity')::numeric, 0),
    w->>'truckPlate',
    w->>'driverName',
    w->>'carrierName',
    w->>'ticketNumber',
    w->>'notes',
    COALESCE((w->>'createdAt')::timestamptz, ar.updated_at),
    w
  FROM public.app_records ar,
       jsonb_array_elements(ar.data->'withdrawals') AS w
  WHERE ar.table_name = 'sales_orders'
    AND ar.id != '__seed__'
    AND jsonb_typeof(ar.data->'withdrawals') = 'array'
  ON CONFLICT (company_id, id) DO UPDATE SET
    net_weight = EXCLUDED.net_weight,
    truck_plate = EXCLUDED.truck_plate;

  -- 7. Gravar NF-e do pedido em erp.sales_order_nfes se houver dados fiscais
  INSERT INTO erp.sales_order_nfes (
    company_id, id, order_id, chave, numero, serie, status, emissao,
    protocolo, danfe_url, xml_url, nfe_payload, nfe_response, created_at, updated_at
  )
  SELECT 
    ar.company_id,
    COALESCE(ar.data->>'nfeId', 'nfe-' || ar.id),
    ar.id,
    ar.data->>'nfeChave',
    ar.data->>'nfeNumero',
    ar.data->>'nfeSerie',
    COALESCE(ar.data->>'nfeStatus', 'draft'),
    (ar.data->>'nfeEmissao')::timestamptz,
    ar.data->>'nfeProtocolo',
    ar.data->>'nfeDanfeUrl',
    ar.data->>'nfeXmlUrl',
    ar.data->'nfePayload',
    ar.data->'nfeRawResponse',
    ar.updated_at,
    ar.updated_at
  FROM public.app_records ar
  WHERE ar.table_name = 'sales_orders'
    AND ar.id != '__seed__'
    AND (ar.data->>'nfeChave' IS NOT NULL OR ar.data->>'nfeNumero' IS NOT NULL OR ar.data->>'nfeStatus' IS NOT NULL)
  ON CONFLICT (company_id, id) DO UPDATE SET
    chave = EXCLUDED.chave,
    numero = EXCLUDED.numero,
    status = EXCLUDED.status,
    protocolo = EXCLUDED.protocolo,
    updated_at = EXCLUDED.updated_at;

  RETURN v_count;
END;
$$;
