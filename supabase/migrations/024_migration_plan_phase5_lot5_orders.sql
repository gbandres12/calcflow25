-- Migration: 024_migration_plan_phase5_lot5_orders.sql
-- Baseado em CALCFLOW_MIGRATION_PLAN.md - Fase 5: Virada do Lote 5 (sales_orders e tabelas filhas)
-- 1. Cria função auxiliar de montagem e projeção reversa de pedido completo: erp.reverse_project_single_order.
-- 2. Cria trigger de projeção reversa em erp.sales_orders (cabeçalho).
-- 3. Cria triggers de projeção reversa em todas as tabelas filhas (itens, parcelas, recibos, pesagens, nfes).
-- 4. Cria trigger de exclusão reversa para erp.sales_orders.
-- 5. Ativa o modo NEW para 'sales_orders' na CBA Filial Belém e CBA Mineração.

-- ============================================================================
-- 1. FUNÇÃO DE REPROJEÇÃO REVERSA DO PEDIDO COMPLETO
-- ============================================================================

CREATE OR REPLACE FUNCTION erp.reverse_project_single_order(p_company_id text, p_order_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_items jsonb;
  v_payments jsonb;
  v_receipts jsonb;
  v_withdrawals jsonb;
  v_nfes jsonb;
BEGIN
  SELECT * INTO v_order FROM erp.sales_orders
  WHERE company_id = p_company_id AND id = p_order_id;

  IF v_order.id IS NULL OR v_order.deleted_at IS NOT NULL THEN
    DELETE FROM public.app_records
    WHERE table_name = 'sales_orders'
      AND company_id = p_company_id
      AND id = p_order_id;
    RETURN;
  END IF;

  -- 1. Agregação de itens de produto
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'productId', it.product_id,
        'productCode', it.product_code,
        'productName', it.product_name,
        'quantity', it.quantity,
        'unit', it.unit,
        'unitPrice', it.unit_price,
        'discount', it.discount,
        'total', it.total,
        'ncm', it.ncm,
        'cst', it.cst,
        'cfop', it.cfop
      ) || COALESCE(it.extra, '{}'::jsonb)
    ),
    '[]'::jsonb
  ) INTO v_items
  FROM erp.sales_order_items it
  WHERE it.company_id = p_company_id AND it.order_id = p_order_id;

  -- 2. Agregação de parcelas
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', inst.id,
        'amount', inst.amount,
        'dueDate', inst.due_date,
        'status', inst.status,
        'paidAmount', inst.paid_amount,
        'paymentMethod', inst.payment_method,
        'receiptId', inst.receipt_id
      ) || COALESCE(inst.extra, '{}'::jsonb)
    ),
    '[]'::jsonb
  ) INTO v_payments
  FROM erp.sales_order_installments inst
  WHERE inst.company_id = p_company_id AND inst.order_id = p_order_id;

  -- 3. Agregação de recibos
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', rec.id,
        'orderId', rec.order_id,
        'orderReference', rec.order_reference,
        'customerId', rec.customer_id,
        'amount', rec.amount,
        'date', rec.payment_date,
        'paymentMethod', rec.payment_method,
        'accountId', rec.account_id,
        'receivedBy', rec.received_by,
        'notes', rec.notes,
        'createdAt', rec.created_at
      ) || COALESCE(rec.extra, '{}'::jsonb)
    ),
    '[]'::jsonb
  ) INTO v_receipts
  FROM erp.sales_order_receipts rec
  WHERE rec.company_id = p_company_id AND rec.order_id = p_order_id;

  -- 4. Agregação de retiradas / pesagens de caminhão
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', w.id,
        'orderId', w.order_id,
        'date', w.date,
        'netWeight', w.net_weight,
        'truckPlate', w.truck_plate,
        'driverName', w.driver_name,
        'carrierName', w.carrier_name,
        'ticketNumber', w.ticket_number,
        'notes', w.notes,
        'createdAt', w.created_at
      ) || COALESCE(w.extra, '{}'::jsonb)
    ),
    '[]'::jsonb
  ) INTO v_withdrawals
  FROM erp.sales_order_withdrawals w
  WHERE w.company_id = p_company_id AND w.order_id = p_order_id;

  -- 5. Agregação de notas fiscais vinculadas
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'chave', n.chave,
        'numero', n.numero,
        'serie', n.serie,
        'status', n.status,
        'nfeStatus', n.status,
        'nfeChave', n.chave,
        'nfeNumero', n.numero,
        'nfeSerie', n.serie,
        'nfeProtocolo', n.protocolo,
        'nfeDanfeUrl', n.danfe_url,
        'nfeXmlUrl', n.xml_url,
        'nfeEmissao', n.emissao,
        'nfePayload', n.nfe_payload,
        'nfeRawResponse', n.nfe_response,
        'createdAt', n.created_at,
        'updatedAt', n.updated_at
      )
    ),
    '[]'::jsonb
  ) INTO v_nfes
  FROM erp.sales_order_nfes n
  WHERE n.company_id = p_company_id AND n.order_id = p_order_id;

  -- Upsert do documento completo no app_records legado
  INSERT INTO public.app_records (
    company_id, id, table_name, data, updated_at, version
  ) VALUES (
    p_company_id,
    p_order_id,
    'sales_orders',
    jsonb_build_object(
      'id', v_order.id,
      'companyId', v_order.company_id,
      'reference', v_order.reference,
      'customerId', v_order.customer_id,
      'date', v_order.date,
      'status', v_order.status,
      'subtotal', v_order.subtotal,
      'discount', v_order.discount,
      'total', v_order.total,
      'sellerName', v_order.seller_name,
      'withoutFinance', v_order.without_finance,
      'paymentMethod', v_order.payment_method,
      'isAvulsa', v_order.is_avulsa,
      'shipping', v_order.shipping,
      'frete', v_order.frete,
      'items', CASE WHEN jsonb_array_length(v_items) > 0 THEN v_items ELSE COALESCE(v_order.extra->'items', '[]'::jsonb) END,
      'payments', CASE WHEN jsonb_array_length(v_payments) > 0 THEN v_payments ELSE COALESCE(v_order.extra->'payments', '[]'::jsonb) END,
      'receipts', CASE WHEN jsonb_array_length(v_receipts) > 0 THEN v_receipts ELSE COALESCE(v_order.extra->'receipts', '[]'::jsonb) END,
      'withdrawals', CASE WHEN jsonb_array_length(v_withdrawals) > 0 THEN v_withdrawals ELSE COALESCE(v_order.extra->'withdrawals', '[]'::jsonb) END,
      'nfes', CASE WHEN jsonb_array_length(v_nfes) > 0 THEN v_nfes ELSE COALESCE(v_order.extra->'nfes', '[]'::jsonb) END,
      'createdAt', v_order.created_at,
      'updatedAt', v_order.updated_at
    ) || (COALESCE(v_order.extra, '{}'::jsonb) - 'items' - 'payments' - 'receipts' - 'withdrawals' - 'nfes'),
    v_order.updated_at,
    v_order.version
  )
  ON CONFLICT (table_name, company_id, id) DO UPDATE SET
    data = EXCLUDED.data,
    updated_at = EXCLUDED.updated_at,
    version = EXCLUDED.version;
END;
$$;


-- ============================================================================
-- 2. TRIGGERS DE PROJEÇÃO REVERSA (CABEÇALHO + FILHAS)
-- ============================================================================

-- Trigger em erp.sales_orders
CREATE OR REPLACE FUNCTION erp.trg_reverse_project_sales_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  PERFORM erp.reverse_project_single_order(NEW.company_id, NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_orders_reverse_proj ON erp.sales_orders;
CREATE TRIGGER trg_sales_orders_reverse_proj
AFTER INSERT OR UPDATE ON erp.sales_orders
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_project_sales_orders();

-- Trigger comum para tabelas filhas
CREATE OR REPLACE FUNCTION erp.trg_child_reverse_project_sales_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
  v_order_id text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_company_id := COALESCE(NEW.company_id, OLD.company_id);
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);

  PERFORM erp.reverse_project_single_order(v_company_id, v_order_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Instalar triggers nas 5 tabelas filhas
DROP TRIGGER IF EXISTS trg_order_items_reverse_sync ON erp.sales_order_items;
CREATE TRIGGER trg_order_items_reverse_sync
AFTER INSERT OR UPDATE OR DELETE ON erp.sales_order_items
FOR EACH ROW EXECUTE FUNCTION erp.trg_child_reverse_project_sales_order();

DROP TRIGGER IF EXISTS trg_order_inst_reverse_sync ON erp.sales_order_installments;
CREATE TRIGGER trg_order_inst_reverse_sync
AFTER INSERT OR UPDATE OR DELETE ON erp.sales_order_installments
FOR EACH ROW EXECUTE FUNCTION erp.trg_child_reverse_project_sales_order();

DROP TRIGGER IF EXISTS trg_order_receipts_reverse_sync ON erp.sales_order_receipts;
CREATE TRIGGER trg_order_receipts_reverse_sync
AFTER INSERT OR UPDATE OR DELETE ON erp.sales_order_receipts
FOR EACH ROW EXECUTE FUNCTION erp.trg_child_reverse_project_sales_order();

DROP TRIGGER IF EXISTS trg_order_withd_reverse_sync ON erp.sales_order_withdrawals;
CREATE TRIGGER trg_order_withd_reverse_sync
AFTER INSERT OR UPDATE OR DELETE ON erp.sales_order_withdrawals
FOR EACH ROW EXECUTE FUNCTION erp.trg_child_reverse_project_sales_order();

DROP TRIGGER IF EXISTS trg_order_nfes_reverse_sync ON erp.sales_order_nfes;
CREATE TRIGGER trg_order_nfes_reverse_sync
AFTER INSERT OR UPDATE OR DELETE ON erp.sales_order_nfes
FOR EACH ROW EXECUTE FUNCTION erp.trg_child_reverse_project_sales_order();


-- ============================================================================
-- 3. TRIGGER DE EXCLUSÃO FÍSICA DO PEDIDO
-- ============================================================================

CREATE OR REPLACE FUNCTION erp.trg_reverse_delete_sales_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  DELETE FROM public.app_records
  WHERE table_name = 'sales_orders'
    AND company_id = OLD.company_id
    AND id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_orders_reverse_delete ON erp.sales_orders;
CREATE TRIGGER trg_sales_orders_reverse_delete
AFTER DELETE ON erp.sales_orders
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_delete_sales_orders();


-- ============================================================================
-- 4. ATIVAÇÃO DO MODO NEW PARA SALES_ORDERS NA CBA FILIAL BELÉM E CBA MINERAÇÃO
-- ============================================================================

UPDATE erp.feature_flags 
SET mode = 'new', updated_at = now() 
WHERE company_id IN ('filial-mugyw35c-lneymq', 'comp-1788898385141')
  AND module = 'sales_orders';
