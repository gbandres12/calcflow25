-- Migration: 019_migration_plan_phase4_atomic_operations.sql
-- Baseado em CALCFLOW_MIGRATION_PLAN.md - Fase 4: Operações Atômicas e Idempotentes no Banco
-- Cria funções de banco que realizam gravações atômicas:
-- 1. erp.add_receipt: adiciona recibo no pedido sem sobrescrever o pedido inteiro
-- 2. erp.add_withdrawal: adiciona retirada/pesagem no pedido sem sobrescrever o pedido inteiro
-- 3. erp.stock_move: movimentação atômica e idempotente de estoque
-- 4. erp.get_feature_flag: consulta modo do módulo (legacy, shadow, new) com fallback para legacy

-- ============================================================================
-- 1. erp.get_feature_flag(p_company_id text, p_module text)
-- ============================================================================
CREATE OR REPLACE FUNCTION erp.get_feature_flag(p_company_id text, p_module text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT mode FROM erp.feature_flags WHERE company_id = p_company_id AND module = p_module),
    'legacy'
  );
$$;

GRANT EXECUTE ON FUNCTION erp.get_feature_flag(text, text) TO authenticated, anon;

-- ============================================================================
-- 2. erp.stock_move(idempotency_id, company_id, item_kind, item_id, delta, reason, source_table, source_id)
-- ============================================================================
CREATE OR REPLACE FUNCTION erp.stock_move(
  p_id text,
  p_company_id text,
  p_item_kind text,
  p_item_id text,
  p_delta numeric,
  p_reason text,
  p_source_table text DEFAULT NULL,
  p_source_id text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance numeric(14,3);
BEGIN
  -- Se o movimento com este ID já foi processado (idempotência), apenas retorna o saldo atual
  IF EXISTS (SELECT 1 FROM erp.stock_movements WHERE company_id = p_company_id AND id = p_id) THEN
    IF p_item_kind = 'product' THEN
      SELECT quantity INTO v_balance FROM erp.products WHERE company_id = p_company_id AND id = p_item_id;
    ELSE
      SELECT quantity INTO v_balance FROM erp.store_items WHERE company_id = p_company_id AND id = p_item_id;
    END IF;
    RETURN COALESCE(v_balance, 0);
  END IF;

  -- Inserir movimento no livro imutável (o trigger trg_stock_movements_apply atualiza a tabela pai e define balance_after)
  INSERT INTO erp.stock_movements (
    id, company_id, item_kind, item_id, delta, reason, source_table, source_id, created_at, created_by
  ) VALUES (
    p_id, p_company_id, p_item_kind, p_item_id, p_delta, p_reason, p_source_table, p_source_id, now(), auth.uid()
  );

  IF p_item_kind = 'product' THEN
    SELECT quantity INTO v_balance FROM erp.products WHERE company_id = p_company_id AND id = p_item_id;
  ELSE
    SELECT quantity INTO v_balance FROM erp.store_items WHERE company_id = p_company_id AND id = p_item_id;
  END IF;

  RETURN COALESCE(v_balance, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION erp.stock_move(text, text, text, text, numeric, text, text, text) TO authenticated;

-- ============================================================================
-- 3. erp.add_receipt(p_id, p_company_id, p_order_id, p_amount, p_date, p_method, p_account_id, p_received_by, p_notes)
-- ============================================================================
CREATE OR REPLACE FUNCTION erp.add_receipt(
  p_id text,
  p_company_id text,
  p_order_id text,
  p_amount numeric,
  p_date date DEFAULT current_date,
  p_method text DEFAULT 'PIX',
  p_account_id text DEFAULT NULL,
  p_received_by text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id text;
  v_ref text;
BEGIN
  -- Idempotência: se recibo já existe, não duplica
  IF EXISTS (SELECT 1 FROM erp.sales_order_receipts WHERE company_id = p_company_id AND id = p_id) THEN
    RETURN true;
  END IF;

  SELECT customer_id, reference INTO v_customer_id, v_ref
  FROM erp.sales_orders
  WHERE company_id = p_company_id AND id = p_order_id;

  INSERT INTO erp.sales_order_receipts (
    company_id, id, order_id, customer_id, order_reference,
    amount, payment_date, payment_method, account_id,
    received_by, notes, created_at, created_by, extra
  ) VALUES (
    p_company_id, p_id, p_order_id, v_customer_id, v_ref,
    p_amount, COALESCE(p_date, current_date), p_method, p_account_id,
    p_received_by, p_notes, now(), auth.uid(), p_extra
  );

  -- Atualiza updated_at do pedido pai
  UPDATE erp.sales_orders
  SET updated_at = now()
  WHERE company_id = p_company_id AND id = p_order_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION erp.add_receipt(text, text, text, numeric, date, text, text, text, text, jsonb) TO authenticated;

-- ============================================================================
-- 4. erp.add_withdrawal(p_id, p_company_id, p_order_id, p_net_weight, p_truck_plate, p_driver, p_carrier, p_ticket, p_notes)
-- ============================================================================
CREATE OR REPLACE FUNCTION erp.add_withdrawal(
  p_id text,
  p_company_id text,
  p_order_id text,
  p_net_weight numeric,
  p_truck_plate text DEFAULT NULL,
  p_driver_name text DEFAULT NULL,
  p_carrier_name text DEFAULT NULL,
  p_ticket_number text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Idempotência: se retirada já existe, não duplica
  IF EXISTS (SELECT 1 FROM erp.sales_order_withdrawals WHERE company_id = p_company_id AND id = p_id) THEN
    RETURN true;
  END IF;

  INSERT INTO erp.sales_order_withdrawals (
    company_id, id, order_id, date, net_weight,
    truck_plate, driver_name, carrier_name,
    ticket_number, notes, created_at, created_by, extra
  ) VALUES (
    p_company_id, p_id, p_order_id, now(), p_net_weight,
    p_truck_plate, p_driver_name, p_carrier_name,
    p_ticket_number, p_notes, now(), auth.uid(), p_extra
  );

  -- Atualiza updated_at do pedido pai
  UPDATE erp.sales_orders
  SET updated_at = now()
  WHERE company_id = p_company_id AND id = p_order_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION erp.add_withdrawal(text, text, text, numeric, text, text, text, text, text, jsonb) TO authenticated;
