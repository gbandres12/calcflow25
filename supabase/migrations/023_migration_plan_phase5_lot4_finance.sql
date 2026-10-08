-- Migration: 023_migration_plan_phase5_lot4_finance.sql
-- Baseado em CALCFLOW_MIGRATION_PLAN.md - Fase 5: Virada do Lote 4 (financial_accounts / transactions)
-- 1. Cria triggers de projeção reversa (erp.financial_accounts -> public.app_records) com trava anti-loop.
-- 2. Cria triggers de projeção reversa (erp.transactions -> public.app_records) com agregação de pagamentos e trava anti-loop.
-- 3. Trata soft-delete e delete físico para manter paridade reversa.
-- 4. Ativa o modo NEW para 'financial_accounts' e 'transactions' na CBA Filial Belém e CBA Mineração.

-- ============================================================================
-- 1. PROJEÇÃO REVERSA: erp.financial_accounts -> public.app_records ('financial_accounts')
-- ============================================================================

CREATE OR REPLACE FUNCTION erp.trg_reverse_project_financial_accounts()
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
    WHERE table_name = 'financial_accounts'
      AND company_id = NEW.company_id
      AND id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.app_records (
    company_id, id, table_name, data, updated_at, version
  ) VALUES (
    NEW.company_id,
    NEW.id,
    'financial_accounts',
    jsonb_build_object(
      'id', NEW.id,
      'companyId', NEW.company_id,
      'name', NEW.name,
      'type', NEW.type,
      'bankName', NEW.bank_name,
      'agency', NEW.agency,
      'accountNumber', NEW.account_number,
      'initialBalance', NEW.initial_balance,
      'currentBalance', NEW.current_balance,
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

DROP TRIGGER IF EXISTS trg_financial_accounts_reverse_proj ON erp.financial_accounts;
CREATE TRIGGER trg_financial_accounts_reverse_proj
AFTER INSERT OR UPDATE ON erp.financial_accounts
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_project_financial_accounts();

-- Delete físico em erp.financial_accounts
CREATE OR REPLACE FUNCTION erp.trg_reverse_delete_financial_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  DELETE FROM public.app_records
  WHERE table_name = 'financial_accounts'
    AND company_id = OLD.company_id
    AND id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_financial_accounts_reverse_delete ON erp.financial_accounts;
CREATE TRIGGER trg_financial_accounts_reverse_delete
AFTER DELETE ON erp.financial_accounts
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_delete_financial_accounts();


-- ============================================================================
-- 2. PROJEÇÃO REVERSA: erp.transactions -> public.app_records ('transactions')
-- ============================================================================

CREATE OR REPLACE FUNCTION erp.trg_reverse_project_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payments jsonb;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM public.app_records
    WHERE table_name = 'transactions'
      AND company_id = NEW.company_id
      AND id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'transactionId', p.transaction_id,
        'amount', p.amount,
        'paymentDate', p.payment_date,
        'paymentMethod', p.payment_method,
        'accountId', p.account_id,
        'receiptId', p.receipt_id,
        'notes', p.notes
      )
    ),
    '[]'::jsonb
  ) INTO v_payments
  FROM erp.transaction_payments p
  WHERE p.company_id = NEW.company_id
    AND p.transaction_id = NEW.id;

  INSERT INTO public.app_records (
    company_id, id, table_name, data, updated_at, version
  ) VALUES (
    NEW.company_id,
    NEW.id,
    'transactions',
    jsonb_build_object(
      'id', NEW.id,
      'companyId', NEW.company_id,
      'description', NEW.description,
      'type', NEW.type,
      'amount', NEW.amount,
      'paidAmount', NEW.paid_amount,
      'status', NEW.status,
      'date', NEW.date,
      'paymentDate', NEW.payment_date,
      'category', NEW.category,
      'accountId', NEW.account_id,
      'orderId', NEW.order_id,
      'customerId', NEW.customer_id,
      'receiptId', NEW.receipt_id,
      'costCenterId', NEW.cost_center_id,
      'paymentMethod', NEW.payment_method,
      'notes', NEW.notes,
      'payments', v_payments,
      'createdAt', NEW.created_at,
      'updatedAt', NEW.updated_at
    ) || (COALESCE(NEW.extra, '{}'::jsonb) - 'payments'),
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

DROP TRIGGER IF EXISTS trg_transactions_reverse_proj ON erp.transactions;
CREATE TRIGGER trg_transactions_reverse_proj
AFTER INSERT OR UPDATE ON erp.transactions
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_project_transactions();

-- Delete físico em erp.transactions
CREATE OR REPLACE FUNCTION erp.trg_reverse_delete_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  DELETE FROM public.app_records
  WHERE table_name = 'transactions'
    AND company_id = OLD.company_id
    AND id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_transactions_reverse_delete ON erp.transactions;
CREATE TRIGGER trg_transactions_reverse_delete
AFTER DELETE ON erp.transactions
FOR EACH ROW
EXECUTE FUNCTION erp.trg_reverse_delete_transactions();


-- ============================================================================
-- 3. ATIVAÇÃO DO MODO NEW PARA FINANCEIRO NA CBA FILIAL BELÉM E CBA MINERAÇÃO
-- ============================================================================

UPDATE erp.feature_flags 
SET mode = 'new', updated_at = now() 
WHERE company_id IN ('filial-mugyw35c-lneymq', 'comp-1788898385141')
  AND module IN ('financial_accounts', 'transactions');
