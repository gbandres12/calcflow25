-- ============================================================================
-- MIGRATION 031: Correção de Triggers Bidirecionais (app_records <-> erp.*),
-- Colunas Extras (030) e Escopo Financeiro para Contas a Pagar/Receber em Aberto
-- ============================================================================

-- 1. Garantir colunas extras da migration 030
ALTER TABLE erp.sales_order_nfes
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE erp.transaction_payments
  ADD COLUMN IF NOT EXISTS is_discount_or_deduction boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Permitir títulos a pagar/receber pendentes (accountId vazio) na RLS de escopo financeiro
CREATE OR REPLACE FUNCTION public.row_in_finance_scope(
  p_company_id text,
  p_table_name text,
  p_record_id text,
  p_data jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope jsonb;
  v_acc_id text;
BEGIN
  IF p_table_name NOT IN ('transactions', 'financial_accounts') THEN
    RETURN true;
  END IF;

  IF p_record_id = '__seed__' OR COALESCE((p_data ->> '__isSeedMeta')::boolean, false) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = p_company_id
      AND c.owner_user_id = (SELECT auth.uid())
  ) THEN
    RETURN true;
  END IF;

  SELECT cm.permissions -> 'financial_accounts' -> 'accounts'
    INTO v_scope
  FROM public.company_memberships cm
  WHERE cm.company_id = p_company_id
    AND cm.user_id = (SELECT auth.uid())
  LIMIT 1;

  IF v_scope IS NULL OR jsonb_typeof(v_scope) <> 'array' THEN
    RETURN true;
  END IF;

  IF p_table_name = 'financial_accounts' THEN
    RETURN v_scope ? COALESCE(p_record_id, p_data ->> 'id', '');
  END IF;

  -- transactions: se ainda não possui conta vinculada (a pagar / a receber em aberto), permite
  v_acc_id := COALESCE(NULLIF(BTRIM(p_data ->> 'accountId'), ''), NULL);
  IF v_acc_id IS NULL THEN
    RETURN true;
  END IF;

  RETURN v_scope ? v_acc_id;
END;
$$;

-- 3. Função auxiliar de projeção reversa de uma única transação (cabeçalho + baixas)
CREATE OR REPLACE FUNCTION erp.reverse_project_single_transaction(p_company_id text, p_tx_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx record;
  v_payments jsonb;
BEGIN
  SELECT * INTO v_tx FROM erp.transactions
  WHERE company_id = p_company_id AND id = p_tx_id;

  IF v_tx.id IS NULL OR v_tx.deleted_at IS NOT NULL THEN
    DELETE FROM public.app_records
    WHERE table_name = 'transactions'
      AND company_id = p_company_id
      AND id = p_tx_id;
    RETURN;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', tp.id,
        'transactionId', tp.transaction_id,
        'amount', tp.amount,
        'paymentDate', tp.payment_date,
        'paymentMethod', tp.payment_method,
        'accountId', tp.account_id,
        'receiptId', tp.receipt_id,
        'notes', tp.notes,
        'isDiscountOrDeduction', COALESCE(tp.is_discount_or_deduction, false)
      ) || COALESCE(tp.extra, '{}'::jsonb)
    ),
    '[]'::jsonb
  )
  INTO v_payments
  FROM erp.transaction_payments tp
  WHERE tp.company_id = p_company_id
    AND tp.transaction_id = p_tx_id;

  INSERT INTO public.app_records (
    company_id, id, table_name, data, updated_at, version
  ) VALUES (
    p_company_id,
    p_tx_id,
    'transactions',
    jsonb_build_object(
      'id', v_tx.id,
      'companyId', v_tx.company_id,
      'description', v_tx.description,
      'type', v_tx.type,
      'amount', v_tx.amount,
      'paidAmount', v_tx.paid_amount,
      'status', v_tx.status,
      'date', v_tx.date,
      'paymentDate', v_tx.payment_date,
      'category', v_tx.category,
      'accountId', v_tx.account_id,
      'orderId', v_tx.order_id,
      'customerId', v_tx.customer_id,
      'receiptId', v_tx.receipt_id,
      'costCenterId', v_tx.cost_center_id,
      'paymentMethod', v_tx.payment_method,
      'notes', v_tx.notes,
      'payments', CASE WHEN jsonb_array_length(v_payments) > 0 THEN v_payments ELSE COALESCE(v_tx.extra->'payments', '[]'::jsonb) END,
      'updatedAt', v_tx.updated_at
    ) || (COALESCE(v_tx.extra, '{}'::jsonb) - 'payments'),
    v_tx.updated_at,
    v_tx.version
  )
  ON CONFLICT (table_name, company_id, id) DO UPDATE SET
    data = EXCLUDED.data,
    updated_at = EXCLUDED.updated_at,
    version = EXCLUDED.version;
END;
$$;

CREATE OR REPLACE FUNCTION erp.trg_reverse_project_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  PERFORM erp.reverse_project_single_transaction(NEW.company_id, NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION erp.trg_child_reverse_project_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id text;
  v_tx_id text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_company_id := COALESCE(NEW.company_id, OLD.company_id);
  v_tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);

  PERFORM erp.reverse_project_single_transaction(v_company_id, v_tx_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_tx_payments_reverse_sync ON erp.transaction_payments;
CREATE TRIGGER trg_tx_payments_reverse_sync
AFTER INSERT OR UPDATE OR DELETE ON erp.transaction_payments
FOR EACH ROW EXECUTE FUNCTION erp.trg_child_reverse_project_transaction();

-- 4. Corrigir trigger de projeção direta app_records -> erp.* (corrigindo colunas ie e unit_cost e sincronizando transaction_payments e sales_order_nfes)
CREATE OR REPLACE FUNCTION erp.trg_project_app_records_to_erp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_data jsonb;
  v_cust_id text;
  v_item jsonb;
  v_inst jsonb;
  v_rec jsonb;
  v_wth jsonb;
  v_pmt jsonb;
  v_idx int;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  v_data := NEW.data;
  IF v_data IS NULL OR NEW.id = '__seed__' OR COALESCE((v_data->>'__isSeedMeta')::boolean, false) = true THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF NEW.table_name = 'categories' THEN
      INSERT INTO erp.categories (company_id, id, name, type, updated_at, extra)
      VALUES (
        NEW.company_id, NEW.id,
        COALESCE(v_data->>'name', 'Sem nome'),
        COALESCE(v_data->>'type', 'OUTFLOW'),
        NEW.updated_at, v_data
      )
      ON CONFLICT (company_id, id) DO UPDATE SET
        name = EXCLUDED.name, type = EXCLUDED.type,
        updated_at = EXCLUDED.updated_at, extra = EXCLUDED.extra, deleted_at = NULL;

    ELSIF NEW.table_name = 'transportadores' THEN
      INSERT INTO erp.transportadores (
        company_id, id, nome, documento, tipo_servico, contratacao, ie, telefone, email,
        endereco, cidade, uf, rntrc, cnh, categoria_cnh, validade_cnh, placa, uf_placa,
        modelo_veiculo, ativo, updated_at, extra
      ) VALUES (
        NEW.company_id, NEW.id,
        COALESCE(v_data->>'nome', 'Sem nome'),
        COALESCE(v_data->>'documento', ''),
        COALESCE(v_data->>'tipoServico', 'FRETE_VENDA'),
        COALESCE(v_data->>'contratacao', 'CIF'),
        v_data->>'ie', v_data->>'telefone', v_data->>'email', v_data->>'endereco',
        v_data->>'cidade', v_data->>'uf', v_data->>'rntrc', v_data->>'cnh',
        v_data->>'categoriaCnh', (v_data->>'validadeCnh')::date, COALESCE(v_data->>'placa', ''),
        v_data->>'ufPlaca', v_data->>'modeloVeiculo', COALESCE((v_data->>'ativo')::boolean, true),
        NEW.updated_at, v_data
      )
      ON CONFLICT (company_id, id) DO UPDATE SET
        nome = EXCLUDED.nome, documento = EXCLUDED.documento, tipo_servico = EXCLUDED.tipo_servico,
        contratacao = EXCLUDED.contratacao, ie = EXCLUDED.ie, telefone = EXCLUDED.telefone,
        email = EXCLUDED.email, endereco = EXCLUDED.endereco, cidade = EXCLUDED.cidade,
        uf = EXCLUDED.uf, rntrc = EXCLUDED.rntrc, cnh = EXCLUDED.cnh,
        categoria_cnh = EXCLUDED.categoria_cnh, validade_cnh = EXCLUDED.validade_cnh,
        placa = EXCLUDED.placa, uf_placa = EXCLUDED.uf_placa, modelo_veiculo = EXCLUDED.modelo_veiculo,
        ativo = EXCLUDED.ativo, updated_at = EXCLUDED.updated_at, extra = EXCLUDED.extra, deleted_at = NULL;

    ELSIF NEW.table_name = 'machines' THEN
      INSERT INTO erp.machines (
        company_id, id, name, type, plate_or_id, current_horimeter, status, last_maintenance, updated_at, extra
      ) VALUES (
        NEW.company_id, NEW.id, COALESCE(v_data->>'name', 'Sem nome'), COALESCE(v_data->>'type', 'Outros'),
        COALESCE(v_data->>'plateOrId', ''), COALESCE((v_data->>'currentHorimeter')::numeric, 0),
        COALESCE(v_data->>'status', 'Operacional'), (v_data->>'lastMaintenance')::date, NEW.updated_at, v_data
      )
      ON CONFLICT (company_id, id) DO UPDATE SET
        name = EXCLUDED.name, type = EXCLUDED.type, plate_or_id = EXCLUDED.plate_or_id,
        current_horimeter = EXCLUDED.current_horimeter, status = EXCLUDED.status,
        last_maintenance = EXCLUDED.last_maintenance, updated_at = EXCLUDED.updated_at,
        extra = EXCLUDED.extra, deleted_at = NULL;

    ELSIF NEW.table_name = 'maintenance_records' THEN
      INSERT INTO erp.maintenance_records (
        company_id, id, machine_id, date, description, cost, type, horimeter, updated_at, extra
      ) VALUES (
        NEW.company_id, NEW.id, COALESCE(v_data->>'machineId', ''),
        COALESCE((v_data->>'date')::date, current_date), COALESCE(v_data->>'description', ''),
        COALESCE((v_data->>'cost')::numeric, 0), COALESCE(v_data->>'type', 'Preventiva'),
        COALESCE((v_data->>'horimeter')::numeric, 0), NEW.updated_at, v_data
      )
      ON CONFLICT (company_id, id) DO UPDATE SET
        machine_id = EXCLUDED.machine_id, date = EXCLUDED.date, description = EXCLUDED.description,
        cost = EXCLUDED.cost, type = EXCLUDED.type, horimeter = EXCLUDED.horimeter,
        updated_at = EXCLUDED.updated_at, extra = EXCLUDED.extra, deleted_at = NULL;

    ELSIF NEW.table_name = 'fuel_records' THEN
      INSERT INTO erp.fuel_records (
        company_id, id, machine_id, date, liters, price_per_liter, total_cost, horimeter, fuel_type, updated_at, extra
      ) VALUES (
        NEW.company_id, NEW.id, COALESCE(v_data->>'machineId', ''),
        COALESCE((v_data->>'date')::date, current_date), COALESCE((v_data->>'liters')::numeric, 0),
        COALESCE((v_data->>'pricePerLiter')::numeric, 0), COALESCE((v_data->>'totalCost')::numeric, 0),
        COALESCE((v_data->>'horimeter')::numeric, 0), COALESCE(v_data->>'fuelType', 'DIESEL_S10'),
        NEW.updated_at, v_data
      )
      ON CONFLICT (company_id, id) DO UPDATE SET
        machine_id = EXCLUDED.machine_id, date = EXCLUDED.date, liters = EXCLUDED.liters,
        price_per_liter = EXCLUDED.price_per_liter, total_cost = EXCLUDED.total_cost,
        horimeter = EXCLUDED.horimeter, fuel_type = EXCLUDED.fuel_type,
        updated_at = EXCLUDED.updated_at, extra = EXCLUDED.extra, deleted_at = NULL;

    ELSIF NEW.table_name = 'fuel_purchases' THEN
      INSERT INTO erp.fuel_purchases (
        company_id, id, date, liters, price_per_liter, total_cost, supplier, fuel_type, updated_at, extra
      ) VALUES (
        NEW.company_id, NEW.id, COALESCE((v_data->>'date')::date, current_date),
        COALESCE((v_data->>'liters')::numeric, 0), COALESCE((v_data->>'pricePerLiter')::numeric, 0),
        COALESCE((v_data->>'totalCost')::numeric, 0), COALESCE(v_data->>'supplier', ''),
        COALESCE(v_data->>'fuelType', 'DIESEL_S10'), NEW.updated_at, v_data
      )
      ON CONFLICT (company_id, id) DO UPDATE SET
        date = EXCLUDED.date, liters = EXCLUDED.liters, price_per_liter = EXCLUDED.price_per_liter,
        total_cost = EXCLUDED.total_cost, supplier = EXCLUDED.supplier, fuel_type = EXCLUDED.fuel_type,
        updated_at = EXCLUDED.updated_at, extra = EXCLUDED.extra, deleted_at = NULL;

    ELSIF NEW.table_name = 'customers' THEN
      INSERT INTO erp.customers (
        company_id, id, name, document, tipo_pessoa, ie, isento_ie, phone, email,
        street, number, neighborhood, city, state, zip_code, ibge_code, status, notes,
        total_spent, updated_at, extra
      ) VALUES (
        NEW.company_id, NEW.id, COALESCE(v_data->>'name', 'Sem nome'),
        COALESCE(v_data->>'document', ''), COALESCE(v_data->>'tipoPessoa', 'PJ'),
        COALESCE(v_data->>'ie', v_data->>'stateRegistration'),
        COALESCE((v_data->>'isentoIE')::boolean, false),
        v_data->>'phone', v_data->>'email', v_data->>'street', v_data->>'number',
        v_data->>'neighborhood', v_data->>'city', v_data->>'state', v_data->>'zipCode',
        v_data->>'ibgeCode', COALESCE(v_data->>'status', 'Ativo'), v_data->>'notes',
        COALESCE((v_data->>'totalSpent')::numeric, 0), NEW.updated_at, v_data
      )
      ON CONFLICT (company_id, id) DO UPDATE SET
        name = EXCLUDED.name, document = EXCLUDED.document, tipo_pessoa = EXCLUDED.tipo_pessoa,
        ie = EXCLUDED.ie, isento_ie = EXCLUDED.isento_ie, phone = EXCLUDED.phone,
        email = EXCLUDED.email, street = EXCLUDED.street, number = EXCLUDED.number,
        neighborhood = EXCLUDED.neighborhood, city = EXCLUDED.city, state = EXCLUDED.state,
        zip_code = EXCLUDED.zip_code, ibge_code = EXCLUDED.ibge_code, status = EXCLUDED.status,
        notes = EXCLUDED.notes, total_spent = EXCLUDED.total_spent,
        updated_at = EXCLUDED.updated_at, extra = EXCLUDED.extra, deleted_at = NULL;

    ELSIF NEW.table_name = 'inventory' THEN
      INSERT INTO erp.products (
        company_id, id, code, name, unit, category, quantity, min_stock, cost_price, unit_price,
        ncm, cst, cfop, origem, aliquota_icms, aliquota_pis, aliquota_cofins,
        unidade_tributavel, observacoes_fiscais, updated_at, extra
      ) VALUES (
        NEW.company_id, NEW.id, COALESCE(v_data->>'code', ''), COALESCE(v_data->>'name', 'Sem nome'),
        COALESCE(v_data->>'unit', 'Ton'), v_data->>'category', COALESCE((v_data->>'quantity')::numeric, 0),
        COALESCE((v_data->>'minStock')::numeric, 0), COALESCE((v_data->>'costPrice')::numeric, 0),
        COALESCE((v_data->>'unitPrice')::numeric, 0), v_data->>'ncm', v_data->>'cst', v_data->>'cfop',
        v_data->>'origem', (v_data->>'aliquotaIcms')::numeric, (v_data->>'aliquotaPis')::numeric,
        (v_data->>'aliquotaCofins')::numeric, v_data->>'unidadeTributavel', v_data->>'observacoesFiscais',
        NEW.updated_at, v_data
      )
      ON CONFLICT (company_id, id) DO UPDATE SET
        code = EXCLUDED.code, name = EXCLUDED.name, unit = EXCLUDED.unit, category = EXCLUDED.category,
        quantity = EXCLUDED.quantity, min_stock = EXCLUDED.min_stock, cost_price = EXCLUDED.cost_price,
        unit_price = EXCLUDED.unit_price, ncm = EXCLUDED.ncm, cst = EXCLUDED.cst, cfop = EXCLUDED.cfop,
        origem = EXCLUDED.origem, aliquota_icms = EXCLUDED.aliquota_icms, aliquota_pis = EXCLUDED.aliquota_pis,
        aliquota_cofins = EXCLUDED.aliquota_cofins, unidade_tributavel = EXCLUDED.unidade_tributavel,
        observacoes_fiscais = EXCLUDED.observacoes_fiscais, updated_at = EXCLUDED.updated_at,
        extra = EXCLUDED.extra, deleted_at = NULL;

    ELSIF NEW.table_name = 'store_items' THEN
      INSERT INTO erp.store_items (
        company_id, id, name, category, unit, quantity, min_stock, unit_cost,
        supplier_sku, supplier_cnpj, ncm, status, updated_at, extra
      ) VALUES (
        NEW.company_id, NEW.id, COALESCE(v_data->>'name', 'Sem nome'),
        COALESCE(v_data->>'category', 'Peças'), COALESCE(v_data->>'unit', 'UN'),
        COALESCE((v_data->>'quantity')::numeric, 0), COALESCE((v_data->>'minStock')::numeric, 0),
        COALESCE((v_data->>'unitCost')::numeric, (v_data->>'costPrice')::numeric, 0),
        v_data->>'supplierSku', v_data->>'supplierCnpj', v_data->>'ncm',
        COALESCE(v_data->>'status', 'ativo'), NEW.updated_at, v_data
      )
      ON CONFLICT (company_id, id) DO UPDATE SET
        name = EXCLUDED.name, category = EXCLUDED.category, unit = EXCLUDED.unit,
        quantity = EXCLUDED.quantity, min_stock = EXCLUDED.min_stock, unit_cost = EXCLUDED.unit_cost,
        supplier_sku = EXCLUDED.supplier_sku, supplier_cnpj = EXCLUDED.supplier_cnpj,
        ncm = EXCLUDED.ncm, status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at, extra = EXCLUDED.extra, deleted_at = NULL;

    ELSIF NEW.table_name = 'financial_accounts' THEN
      INSERT INTO erp.financial_accounts (
        company_id, id, name, type, bank_name, agency, account_number, initial_balance, current_balance, updated_at, extra
      ) VALUES (
        NEW.company_id, NEW.id, COALESCE(v_data->>'name', 'Sem nome'), COALESCE(v_data->>'type', 'banco'),
        v_data->>'bankName', v_data->>'agency', v_data->>'accountNumber',
        COALESCE((v_data->>'initialBalance')::numeric, 0),
        COALESCE((v_data->>'currentBalance')::numeric, (v_data->>'initialBalance')::numeric, 0),
        NEW.updated_at, v_data
      )
      ON CONFLICT (company_id, id) DO UPDATE SET
        name = EXCLUDED.name, type = EXCLUDED.type, bank_name = EXCLUDED.bank_name,
        agency = EXCLUDED.agency, account_number = EXCLUDED.account_number,
        initial_balance = EXCLUDED.initial_balance, current_balance = EXCLUDED.current_balance,
        updated_at = EXCLUDED.updated_at, extra = EXCLUDED.extra, deleted_at = NULL;

    ELSIF NEW.table_name = 'transactions' THEN
      INSERT INTO erp.transactions (
        company_id, id, description, type, amount, paid_amount, status, date, payment_date,
        category, account_id, order_id, customer_id, receipt_id, cost_center_id, payment_method, notes, updated_at, extra
      ) VALUES (
        NEW.company_id, NEW.id, COALESCE(v_data->>'description', ''), COALESCE(v_data->>'type', 'OUTFLOW'),
        COALESCE((v_data->>'amount')::numeric, 0), COALESCE((v_data->>'paidAmount')::numeric, 0),
        COALESCE(v_data->>'status', 'pendente'), COALESCE((v_data->>'date')::date, current_date),
        (v_data->>'paymentDate')::date, v_data->>'category', NULLIF(v_data->>'accountId', ''), v_data->>'orderId',
        v_data->>'customerId', v_data->>'receiptId', v_data->>'costCenterId', v_data->>'paymentMethod',
        v_data->>'notes', NEW.updated_at, v_data
      )
      ON CONFLICT (company_id, id) DO UPDATE SET
        description = EXCLUDED.description, type = EXCLUDED.type, amount = EXCLUDED.amount,
        paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, date = EXCLUDED.date,
        payment_date = EXCLUDED.payment_date, category = EXCLUDED.category, account_id = EXCLUDED.account_id,
        order_id = EXCLUDED.order_id, customer_id = EXCLUDED.customer_id, receipt_id = EXCLUDED.receipt_id,
        cost_center_id = EXCLUDED.cost_center_id, payment_method = EXCLUDED.payment_method,
        notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at, extra = EXCLUDED.extra, deleted_at = NULL;

      IF jsonb_typeof(v_data->'payments') = 'array' THEN
        DELETE FROM erp.transaction_payments
        WHERE company_id = NEW.company_id AND transaction_id = NEW.id;

        v_idx := 0;
        FOR v_pmt IN SELECT * FROM jsonb_array_elements(v_data->'payments') LOOP
          v_idx := v_idx + 1;
          INSERT INTO erp.transaction_payments (
            company_id, id, transaction_id, amount, payment_date, payment_method, account_id, receipt_id, notes, created_at
          ) VALUES (
            NEW.company_id,
            COALESCE(v_pmt->>'id', 'pmt-' || NEW.id || '-' || v_idx),
            NEW.id,
            COALESCE((v_pmt->>'amount')::numeric, 0),
            COALESCE((v_pmt->>'paymentDate')::date, (NEW.updated_at)::date),
            COALESCE(v_pmt->>'paymentMethod', 'PIX'),
            NULLIF(v_pmt->>'accountId', ''),
            NULLIF(v_pmt->>'receiptId', ''),
            v_pmt->>'notes',
            NEW.updated_at
          )
          ON CONFLICT (company_id, id) DO UPDATE SET
            amount = EXCLUDED.amount,
            payment_date = EXCLUDED.payment_date,
            payment_method = EXCLUDED.payment_method,
            account_id = EXCLUDED.account_id,
            receipt_id = EXCLUDED.receipt_id,
            notes = EXCLUDED.notes;
        END LOOP;
      END IF;

    ELSIF NEW.table_name = 'sales_orders' THEN
      v_cust_id := COALESCE(v_data->>'customerId', 'sem-cliente');

      IF v_cust_id <> 'sem-cliente' THEN
        INSERT INTO erp.customers (company_id, id, name, document, updated_at)
        VALUES (
          NEW.company_id, v_cust_id,
          COALESCE(v_data->>'customerName', v_data#>>'{nfePayload,dest,nome}', 'Cliente ' || v_cust_id),
          COALESCE(v_data#>>'{nfePayload,dest,cpf}', v_data#>>'{nfePayload,dest,cnpj}', ''),
          now()
        )
        ON CONFLICT (company_id, id) DO NOTHING;
      END IF;

      INSERT INTO erp.sales_orders (
        company_id, id, reference, customer_id, seller_name, date, status,
        subtotal, discount, total, without_finance, payment_method, is_avulsa,
        shipping, frete, updated_at, extra
      ) VALUES (
        NEW.company_id, NEW.id, v_data->>'reference', v_cust_id, v_data->>'sellerName',
        COALESCE((v_data->>'date')::timestamptz, now()), COALESCE(v_data->>'status', 'Orçamento'),
        COALESCE((v_data->>'subtotal')::numeric, 0), COALESCE((v_data->>'discount')::numeric, 0),
        COALESCE((v_data->>'total')::numeric, 0), COALESCE((v_data->>'withoutFinance')::boolean, false),
        v_data->>'paymentMethod', COALESCE((v_data->>'isAvulsa')::boolean, false),
        CASE WHEN v_data->'shipping' IS NOT NULL THEN jsonb_build_object('valor', v_data->'shipping') ELSE NULL END,
        v_data->'frete', NEW.updated_at, v_data
      )
      ON CONFLICT (company_id, id) DO UPDATE SET
        reference = EXCLUDED.reference, customer_id = EXCLUDED.customer_id,
        seller_name = EXCLUDED.seller_name, date = EXCLUDED.date, status = EXCLUDED.status,
        subtotal = EXCLUDED.subtotal, discount = EXCLUDED.discount, total = EXCLUDED.total,
        without_finance = EXCLUDED.without_finance, payment_method = EXCLUDED.payment_method,
        is_avulsa = EXCLUDED.is_avulsa, shipping = EXCLUDED.shipping, frete = EXCLUDED.frete,
        updated_at = EXCLUDED.updated_at, extra = EXCLUDED.extra, deleted_at = NULL;

      IF jsonb_typeof(v_data->'items') = 'array' THEN
        DELETE FROM erp.sales_order_items WHERE company_id = NEW.company_id AND order_id = NEW.id;
        v_idx := 0;
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_data->'items') LOOP
          v_idx := v_idx + 1;
          INSERT INTO erp.sales_order_items (
            company_id, id, order_id, product_id, product_code, product_name,
            quantity, unit, unit_price, discount, total, ncm, cst, cfop, extra
          ) VALUES (
            NEW.company_id, NEW.id || '_item_' || v_idx, NEW.id,
            v_item->>'productId', v_item->>'productCode', COALESCE(v_item->>'productName', 'Produto'),
            COALESCE((v_item->>'quantity')::numeric, 0), COALESCE(v_item->>'unit', 'Ton'),
            COALESCE((v_item->>'unitPrice')::numeric, 0), COALESCE((v_item->>'discount')::numeric, 0),
            COALESCE((v_item->>'total')::numeric, 0), v_item->>'ncm', v_item->>'cst', v_item->>'cfop', v_item
          )
          ON CONFLICT (company_id, id) DO UPDATE SET
            quantity = EXCLUDED.quantity, unit_price = EXCLUDED.unit_price,
            total = EXCLUDED.total, extra = EXCLUDED.extra;
        END LOOP;
      END IF;

      IF jsonb_typeof(v_data->'payments') = 'array' THEN
        DELETE FROM erp.sales_order_installments WHERE company_id = NEW.company_id AND order_id = NEW.id;
        v_idx := 0;
        FOR v_inst IN SELECT * FROM jsonb_array_elements(v_data->'payments') LOOP
          v_idx := v_idx + 1;
          INSERT INTO erp.sales_order_installments (
            company_id, id, order_id, amount, due_date, status, paid_amount, payment_method, receipt_id, extra
          ) VALUES (
            NEW.company_id, COALESCE(v_inst->>'id', NEW.id || '_inst_' || v_idx), NEW.id,
            COALESCE((v_inst->>'amount')::numeric, 0),
            COALESCE((v_inst->>'dueDate')::date, (v_inst->>'date')::date, current_date),
            COALESCE(v_inst->>'status', 'PENDENTE'), COALESCE((v_inst->>'paidAmount')::numeric, 0),
            v_inst->>'paymentMethod', v_inst->>'receiptId', v_inst
          )
          ON CONFLICT (company_id, id) DO UPDATE SET
            amount = EXCLUDED.amount, due_date = EXCLUDED.due_date, status = EXCLUDED.status,
            paid_amount = EXCLUDED.paid_amount, payment_method = EXCLUDED.payment_method,
            receipt_id = EXCLUDED.receipt_id, extra = EXCLUDED.extra;
        END LOOP;
      END IF;

      IF jsonb_typeof(v_data->'receipts') = 'array' THEN
        DELETE FROM erp.sales_order_receipts WHERE company_id = NEW.company_id AND order_id = NEW.id;
        v_idx := 0;
        FOR v_rec IN SELECT * FROM jsonb_array_elements(v_data->'receipts') LOOP
          v_idx := v_idx + 1;
          INSERT INTO erp.sales_order_receipts (
            company_id, id, order_id, customer_id, order_reference, amount,
            payment_date, payment_method, account_id, received_by, notes, extra
          ) VALUES (
            NEW.company_id, COALESCE(v_rec->>'id', NEW.id || '_rec_' || v_idx), NEW.id,
            COALESCE(v_rec->>'customerId', v_cust_id), COALESCE(v_rec->>'orderReference', v_data->>'reference'),
            COALESCE((v_rec->>'amount')::numeric, 0), COALESCE((v_rec->>'date')::date, current_date),
            COALESCE(v_rec->>'paymentMethod', 'PIX'), v_rec->>'accountId', v_rec->>'receivedBy',
            v_rec->>'notes', v_rec
          )
          ON CONFLICT (company_id, id) DO UPDATE SET
            amount = EXCLUDED.amount, payment_date = EXCLUDED.payment_date,
            payment_method = EXCLUDED.payment_method, account_id = EXCLUDED.account_id,
            notes = EXCLUDED.notes, extra = EXCLUDED.extra;
        END LOOP;
      END IF;

      IF jsonb_typeof(v_data->'withdrawals') = 'array' THEN
        DELETE FROM erp.sales_order_withdrawals WHERE company_id = NEW.company_id AND order_id = NEW.id;
        v_idx := 0;
        FOR v_wth IN SELECT * FROM jsonb_array_elements(v_data->'withdrawals') LOOP
          v_idx := v_idx + 1;
          INSERT INTO erp.sales_order_withdrawals (
            company_id, id, order_id, date, net_weight, truck_plate,
            driver_name, carrier_name, ticket_number, notes, extra
          ) VALUES (
            NEW.company_id, COALESCE(v_wth->>'id', NEW.id || '_wth_' || v_idx), NEW.id,
            COALESCE((v_wth->>'date')::timestamptz, now()),
            COALESCE((v_wth->>'netWeight')::numeric, (v_wth->>'quantity')::numeric, (v_wth->>'quantityWithdrawn')::numeric, 0),
            COALESCE(v_wth->>'truckPlate', v_wth->>'plateNumber'), v_wth->>'driverName',
            COALESCE(v_wth->>'carrierName', v_wth->>'transporterName'),
            COALESCE(v_wth->>'ticketNumber', v_wth->>'weighTicketNumber'), v_wth->>'notes', v_wth
          )
          ON CONFLICT (company_id, id) DO UPDATE SET
            net_weight = EXCLUDED.net_weight, truck_plate = EXCLUDED.truck_plate,
            driver_name = EXCLUDED.driver_name, carrier_name = EXCLUDED.carrier_name,
            ticket_number = EXCLUDED.ticket_number, notes = EXCLUDED.notes, extra = EXCLUDED.extra;
        END LOOP;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[dual-write] Erro ao projetar % (id=%) para schema erp: %', NEW.table_name, NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;
