-- Migration: 026_fix_trigger_recursion_depth.sql
-- Objetivo: Evitar eco/recursão bidirecional entre erp.* e public.app_records
-- Adiciona verificação de pg_trigger_depth() > 1 e preservação de IDs em elementos-filhos (itens, parcelas, recibos, retiradas).

CREATE OR REPLACE FUNCTION erp.trg_project_app_records_to_erp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- SEGURANÇA CONTRA RECURSÃO: Se a escrita em public.app_records veio de uma trigger do schema erp.*,
  -- interrompe imediatamente para evitar loop de eco ou duplicação de filhas.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Ignorar registros de seed/meta
  IF NEW.id = '__seed__' OR COALESCE((NEW.data->>'__isSeedMeta')::boolean, false) = true THEN
    RETURN NEW;
  END IF;

  BEGIN
    CASE NEW.table_name
      WHEN 'categories' THEN
        INSERT INTO erp.categories (company_id, id, name, type, version, created_at, updated_at, extra)
        VALUES (
          NEW.company_id, NEW.id,
          COALESCE(NEW.data->>'name', 'Sem nome'),
          CASE WHEN NEW.data->>'type' = 'OUTFLOW' THEN 'OUTFLOW' ELSE 'INFLOW' END,
          COALESCE(NEW.version, 1),
          NEW.updated_at, NEW.updated_at, NEW.data
        )
        ON CONFLICT (company_id, id) DO UPDATE SET
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          extra = EXCLUDED.extra;

      WHEN 'transportadores' THEN
        INSERT INTO erp.transportadores (
          company_id, id, nome, documento, tipo_servico, contratacao,
          ie, telefone, email, endereco, cidade, uf, rntrc,
          cnh, categoria_cnh, validade_cnh, placa, uf_placa, modelo_veiculo,
          ativo, version, created_at, updated_at, extra
        ) VALUES (
          NEW.company_id, NEW.id,
          COALESCE(NEW.data->>'nome', 'Sem nome'),
          COALESCE(NEW.data->>'documento', ''),
          COALESCE(NEW.data->>'tipoServico', 'AMBOS'),
          COALESCE(NEW.data->>'contratacao', 'CLIENTE'),
          NEW.data->>'ie', NEW.data->>'telefone', NEW.data->>'email',
          NEW.data->>'endereco', NEW.data->>'cidade', NEW.data->>'uf',
          NEW.data->>'rntrc', NEW.data->>'cnh', NEW.data->>'categoriaCnh',
          NEW.data->>'validadeCnh', NEW.data->>'placa', NEW.data->>'ufPlaca',
          NEW.data->>'modeloVeiculo',
          COALESCE((NEW.data->>'ativo')::boolean, true),
          COALESCE(NEW.version, 1),
          COALESCE((NEW.data->>'createdAt')::timestamptz, NEW.updated_at),
          NEW.updated_at, NEW.data
        )
        ON CONFLICT (company_id, id) DO UPDATE SET
          nome = EXCLUDED.nome,
          documento = EXCLUDED.documento,
          tipo_servico = EXCLUDED.tipo_servico,
          contratacao = EXCLUDED.contratacao,
          placa = EXCLUDED.placa,
          uf_placa = EXCLUDED.uf_placa,
          ativo = EXCLUDED.ativo,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          extra = EXCLUDED.extra;

      WHEN 'customers' THEN
        INSERT INTO erp.customers (
          company_id, id, name, document, phone, email,
          street, number, neighborhood, city, state, zip_code,
          ibge_code, state_registration, isento_ie, tipo_pessoa, status,
          version, created_at, updated_at, extra
        ) VALUES (
          NEW.company_id, NEW.id,
          COALESCE(NEW.data->>'name', 'Sem nome'),
          COALESCE(NEW.data->>'document', ''),
          NEW.data->>'phone', NEW.data->>'email',
          NEW.data->>'street', NEW.data->>'number', NEW.data->>'neighborhood',
          NEW.data->>'city', NEW.data->>'state', NEW.data->>'zipCode',
          NEW.data->>'ibgeCode', NEW.data->>'stateRegistration',
          COALESCE((NEW.data->>'isentoIE')::boolean, false),
          COALESCE(NEW.data->>'tipoPessoa', 'PF'),
          COALESCE(NEW.data->>'status', 'Ativo'),
          COALESCE(NEW.version, 1),
          COALESCE((NEW.data->>'createdAt')::timestamptz, NEW.updated_at),
          NEW.updated_at, NEW.data
        )
        ON CONFLICT (company_id, id) DO UPDATE SET
          name = EXCLUDED.name,
          document = EXCLUDED.document,
          phone = EXCLUDED.phone,
          email = EXCLUDED.email,
          street = EXCLUDED.street,
          number = EXCLUDED.number,
          neighborhood = EXCLUDED.neighborhood,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          zip_code = EXCLUDED.zip_code,
          ibge_code = EXCLUDED.ibge_code,
          state_registration = EXCLUDED.state_registration,
          isento_ie = EXCLUDED.isento_ie,
          tipo_pessoa = EXCLUDED.tipo_pessoa,
          status = EXCLUDED.status,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          extra = EXCLUDED.extra;

      WHEN 'inventory' THEN
        INSERT INTO erp.products (
          company_id, id, code, name, unit, category, min_stock, quantity,
          cost_price, unit_price, ncm, cst, cfop,
          version, created_at, updated_at, extra
        ) VALUES (
          NEW.company_id, NEW.id,
          COALESCE(NEW.data->>'code', NEW.id),
          COALESCE(NEW.data->>'name', 'Produto sem nome'),
          COALESCE(NEW.data->>'unit', 'Ton'),
          COALESCE(NEW.data->>'category', 'Calcário'),
          COALESCE((NEW.data->>'minStock')::numeric, 0),
          COALESCE((NEW.data->>'quantity')::numeric, 0),
          COALESCE((NEW.data->>'costPrice')::numeric, 0),
          COALESCE((NEW.data->>'unitPrice')::numeric, 0),
          NEW.data->>'ncm', NEW.data->>'cst', NEW.data->>'cfop',
          COALESCE(NEW.version, 1),
          NEW.updated_at, NEW.updated_at, NEW.data
        )
        ON CONFLICT (company_id, id) DO UPDATE SET
          name = EXCLUDED.name,
          unit = EXCLUDED.unit,
          category = EXCLUDED.category,
          min_stock = EXCLUDED.min_stock,
          quantity = EXCLUDED.quantity,
          cost_price = EXCLUDED.cost_price,
          unit_price = EXCLUDED.unit_price,
          ncm = EXCLUDED.ncm,
          cst = EXCLUDED.cst,
          cfop = EXCLUDED.cfop,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          extra = EXCLUDED.extra;

      WHEN 'store_items' THEN
        INSERT INTO erp.store_items (
          company_id, id, name, category, quantity, unit,
          min_stock, cost_price, selling_price,
          version, created_at, updated_at, extra
        ) VALUES (
          NEW.company_id, NEW.id,
          COALESCE(NEW.data->>'name', 'Item almoxarifado'),
          COALESCE(NEW.data->>'category', 'Geral'),
          COALESCE((NEW.data->>'quantity')::numeric, 0),
          COALESCE(NEW.data->>'unit', 'UN'),
          COALESCE((NEW.data->>'minStock')::numeric, 0),
          COALESCE((NEW.data->>'costPrice')::numeric, 0),
          COALESCE((NEW.data->>'sellingPrice')::numeric, 0),
          COALESCE(NEW.version, 1),
          NEW.updated_at, NEW.updated_at, NEW.data
        )
        ON CONFLICT (company_id, id) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          quantity = EXCLUDED.quantity,
          unit = EXCLUDED.unit,
          min_stock = EXCLUDED.min_stock,
          cost_price = EXCLUDED.cost_price,
          selling_price = EXCLUDED.selling_price,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          extra = EXCLUDED.extra;

      WHEN 'financial_accounts' THEN
        INSERT INTO erp.financial_accounts (
          company_id, id, name, type, bank_name, agency, account_number,
          initial_balance, current_balance,
          version, created_at, updated_at, extra
        ) VALUES (
          NEW.company_id, NEW.id,
          COALESCE(NEW.data->>'name', 'Conta sem nome'),
          COALESCE(NEW.data->>'type', 'banco'),
          NEW.data->>'bankName', NEW.data->>'agency', NEW.data->>'accountNumber',
          COALESCE((NEW.data->>'initialBalance')::numeric, 0),
          COALESCE((NEW.data->>'currentBalance')::numeric, 0),
          COALESCE(NEW.version, 1),
          NEW.updated_at, NEW.updated_at, NEW.data
        )
        ON CONFLICT (company_id, id) DO UPDATE SET
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          bank_name = EXCLUDED.bank_name,
          agency = EXCLUDED.agency,
          account_number = EXCLUDED.account_number,
          initial_balance = EXCLUDED.initial_balance,
          current_balance = EXCLUDED.current_balance,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          extra = EXCLUDED.extra;

      WHEN 'transactions' THEN
        INSERT INTO erp.transactions (
          company_id, id, description, type, amount, paid_amount, status,
          date, payment_date, category, account_id, order_id, customer_id,
          receipt_id, cost_center_id, payment_method, notes,
          version, created_at, updated_at, extra
        ) VALUES (
          NEW.company_id, NEW.id,
          COALESCE(NEW.data->>'description', 'Lançamento sem descrição'),
          COALESCE(NEW.data->>'type', 'SALE'),
          COALESCE((NEW.data->>'amount')::numeric, 0),
          COALESCE((NEW.data->>'paidAmount')::numeric, 0),
          COALESCE(NEW.data->>'status', 'pendente'),
          COALESCE((NEW.data->>'date')::date, (NEW.updated_at)::date),
          (NEW.data->>'paymentDate')::date,
          NEW.data->>'category', NEW.data->>'accountId', NEW.data->>'orderId',
          NEW.data->>'customerId', NEW.data->>'receiptId', NEW.data->>'costCenterId',
          NEW.data->>'paymentMethod', NEW.data->>'notes',
          COALESCE(NEW.version, 1),
          COALESCE((NEW.data->>'createdAt')::timestamptz, NEW.updated_at),
          NEW.updated_at, NEW.data
        )
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
          cost_center_id = EXCLUDED.cost_center_id,
          payment_method = EXCLUDED.payment_method,
          notes = EXCLUDED.notes,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          extra = EXCLUDED.extra;

        -- Projeção de payments[] de transações
        IF jsonb_typeof(NEW.data->'payments') = 'array' THEN
          INSERT INTO erp.transaction_payments (
            company_id, id, transaction_id, amount, payment_date,
            payment_method, account_id, receipt_id, notes, created_at
          )
          SELECT
            NEW.company_id,
            COALESCE(p->>'id', 'pmt-' || NEW.id || '-' || (row_number() OVER ())),
            NEW.id,
            COALESCE((p->>'amount')::numeric, 0),
            COALESCE((p->>'paymentDate')::date, (p->>'date')::date, (NEW.updated_at)::date),
            COALESCE(p->>'paymentMethod', 'PIX'),
            p->>'accountId',
            p->>'receiptId',
            p->>'notes',
            COALESCE((p->>'createdAt')::timestamptz, NEW.updated_at)
          FROM jsonb_array_elements(NEW.data->'payments') AS p
          ON CONFLICT (company_id, id) DO UPDATE SET
            amount = EXCLUDED.amount,
            payment_date = EXCLUDED.payment_date,
            payment_method = EXCLUDED.payment_method,
            notes = EXCLUDED.notes;
        END IF;

      WHEN 'machines' THEN
        INSERT INTO erp.machines (
          company_id, id, name, type, plate_or_id, current_horimeter,
          status, last_maintenance,
          version, created_at, updated_at, extra
        ) VALUES (
          NEW.company_id, NEW.id,
          COALESCE(NEW.data->>'name', 'Sem nome'),
          COALESCE(NEW.data->>'type', 'Outros'),
          COALESCE(NEW.data->>'plateOrId', ''),
          COALESCE((NEW.data->>'currentHorimeter')::numeric, 0),
          COALESCE(NEW.data->>'status', 'Operacional'),
          (NEW.data->>'lastMaintenance')::timestamptz,
          COALESCE(NEW.version, 1),
          NEW.updated_at, NEW.updated_at, NEW.data
        )
        ON CONFLICT (company_id, id) DO UPDATE SET
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          plate_or_id = EXCLUDED.plate_or_id,
          current_horimeter = EXCLUDED.current_horimeter,
          status = EXCLUDED.status,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          extra = EXCLUDED.extra;

      WHEN 'maintenance_records' THEN
        INSERT INTO erp.maintenance_records (
          company_id, id, machine_id, date, description, cost,
          type, horimeter, version, created_at, updated_at, extra
        ) VALUES (
          NEW.company_id, NEW.id,
          COALESCE(NEW.data->>'machineId', ''),
          COALESCE((NEW.data->>'date')::date, (NEW.updated_at)::date),
          COALESCE(NEW.data->>'description', ''),
          COALESCE((NEW.data->>'cost')::numeric, 0),
          COALESCE(NEW.data->>'type', 'Preventiva'),
          COALESCE((NEW.data->>'horimeter')::numeric, 0),
          COALESCE(NEW.version, 1),
          NEW.updated_at, NEW.updated_at, NEW.data
        )
        ON CONFLICT (company_id, id) DO UPDATE SET
          description = EXCLUDED.description,
          cost = EXCLUDED.cost,
          horimeter = EXCLUDED.horimeter,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          extra = EXCLUDED.extra;

      WHEN 'fuel_records' THEN
        INSERT INTO erp.fuel_records (
          company_id, id, machine_id, date, liters, price_per_liter,
          total_cost, horimeter, fuel_type, version, created_at, updated_at, extra
        ) VALUES (
          NEW.company_id, NEW.id,
          COALESCE(NEW.data->>'machineId', ''),
          COALESCE((NEW.data->>'date')::date, (NEW.updated_at)::date),
          COALESCE((NEW.data->>'liters')::numeric, 0),
          COALESCE((NEW.data->>'pricePerLiter')::numeric, 0),
          COALESCE((NEW.data->>'totalCost')::numeric, 0),
          COALESCE((NEW.data->>'horimeter')::numeric, 0),
          COALESCE(NEW.data->>'fuelType', 'DIESEL_S10'),
          COALESCE(NEW.version, 1),
          NEW.updated_at, NEW.updated_at, NEW.data
        )
        ON CONFLICT (company_id, id) DO UPDATE SET
          liters = EXCLUDED.liters,
          price_per_liter = EXCLUDED.price_per_liter,
          total_cost = EXCLUDED.total_cost,
          horimeter = EXCLUDED.horimeter,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          extra = EXCLUDED.extra;

      WHEN 'fuel_purchases' THEN
        INSERT INTO erp.fuel_purchases (
          company_id, id, date, invoice_number, supplier, fuel_type,
          liters, price_per_liter, total_cost, payment_status, notes,
          version, created_at, updated_at, extra
        ) VALUES (
          NEW.company_id, NEW.id,
          COALESCE((NEW.data->>'date')::date, (NEW.updated_at)::date),
          NEW.data->>'invoiceNumber', NEW.data->>'supplier',
          COALESCE(NEW.data->>'fuelType', 'DIESEL_S10'),
          COALESCE((NEW.data->>'liters')::numeric, 0),
          COALESCE((NEW.data->>'pricePerLiter')::numeric, 0),
          COALESCE((NEW.data->>'totalCost')::numeric, 0),
          COALESCE(NEW.data->>'paymentStatus', 'PAGO'),
          NEW.data->>'notes',
          COALESCE(NEW.version, 1),
          NEW.updated_at, NEW.updated_at, NEW.data
        )
        ON CONFLICT (company_id, id) DO UPDATE SET
          invoice_number = EXCLUDED.invoice_number,
          supplier = EXCLUDED.supplier,
          liters = EXCLUDED.liters,
          price_per_liter = EXCLUDED.price_per_liter,
          total_cost = EXCLUDED.total_cost,
          payment_status = EXCLUDED.payment_status,
          notes = EXCLUDED.notes,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          extra = EXCLUDED.extra;

      WHEN 'sales_orders' THEN
        IF NEW.data->>'customerId' IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM erp.customers c WHERE c.company_id = NEW.company_id AND c.id = NEW.data->>'customerId'
        ) THEN
          INSERT INTO erp.customers (company_id, id, name, created_at, updated_at)
          VALUES (NEW.company_id, NEW.data->>'customerId', 'Cliente ' || (NEW.data->>'customerId'), now(), now())
          ON CONFLICT (company_id, id) DO NOTHING;
        END IF;

        INSERT INTO erp.sales_orders (
          company_id, id, reference, customer_id, date, status,
          subtotal, discount, total, seller_name, without_finance,
          payment_method, is_avulsa, shipping, frete,
          version, created_at, updated_at, extra
        ) VALUES (
          NEW.company_id, NEW.id,
          NEW.data->>'reference',
          COALESCE(NEW.data->>'customerId', 'sem-cliente'),
          COALESCE((NEW.data->>'date')::timestamptz, NEW.updated_at),
          COALESCE(NEW.data->>'status', 'Orçamento'),
          COALESCE((NEW.data->>'subtotal')::numeric, 0),
          COALESCE((NEW.data->>'discount')::numeric, 0),
          COALESCE((NEW.data->>'total')::numeric, 0),
          NEW.data->>'sellerName',
          COALESCE((NEW.data->>'withoutFinance')::boolean, false),
          NEW.data->>'paymentMethod',
          COALESCE((NEW.data->>'isAvulsa')::boolean, false),
          NEW.data->'shipping', NEW.data->'frete',
          COALESCE(NEW.version, 1),
          NEW.updated_at, NEW.updated_at, NEW.data
        )
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
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          extra = EXCLUDED.extra;

        -- Projeção de items[] (upsert aditivo com preservação de ID)
        IF jsonb_typeof(NEW.data->'items') = 'array' THEN
          INSERT INTO erp.sales_order_items (
            company_id, id, order_id, product_id, product_code, product_name,
            quantity, unit, unit_price, discount, total, ncm, cst, cfop, extra
          )
          SELECT 
            NEW.company_id,
            COALESCE(it->>'id', NEW.id || '_item_' || (row_number() OVER ())),
            NEW.id,
            it->>'productId', it->>'productCode', COALESCE(it->>'productName', 'Produto'),
            COALESCE((it->>'quantity')::numeric, 0),
            COALESCE(it->>'unit', 'Ton'),
            COALESCE((it->>'unitPrice')::numeric, 0),
            COALESCE((it->>'discount')::numeric, 0),
            COALESCE((it->>'total')::numeric, 0),
            it->>'ncm', it->>'cst', it->>'cfop', it
          FROM jsonb_array_elements(NEW.data->'items') AS it
          ON CONFLICT (company_id, id) DO UPDATE SET
            quantity = EXCLUDED.quantity,
            unit_price = EXCLUDED.unit_price,
            total = EXCLUDED.total,
            extra = EXCLUDED.extra;
        END IF;

        -- Projeção de payments[] (upsert aditivo com preservação de ID)
        IF jsonb_typeof(NEW.data->'payments') = 'array' THEN
          INSERT INTO erp.sales_order_installments (
            company_id, id, order_id, amount, due_date, status, paid_amount, payment_method, receipt_id, extra
          )
          SELECT 
            NEW.company_id,
            COALESCE(p->>'id', NEW.id || '_inst_' || (row_number() OVER ())),
            NEW.id,
            COALESCE((p->>'amount')::numeric, 0),
            COALESCE((p->>'dueDate')::date, (p->>'date')::date, (NEW.updated_at)::date),
            COALESCE(p->>'status', 'PENDENTE'),
            COALESCE((p->>'paidAmount')::numeric, 0),
            p->>'paymentMethod', p->>'receiptId', p
          FROM jsonb_array_elements(NEW.data->'payments') AS p
          ON CONFLICT (company_id, id) DO UPDATE SET
            amount = EXCLUDED.amount,
            status = EXCLUDED.status,
            paid_amount = EXCLUDED.paid_amount,
            extra = EXCLUDED.extra;
        END IF;

        -- Projeção de receipts[] (preservando id exato do recibo)
        IF jsonb_typeof(NEW.data->'receipts') = 'array' THEN
          INSERT INTO erp.sales_order_receipts (
            company_id, id, order_id, customer_id, order_reference, amount,
            payment_date, payment_method, account_id, received_by, notes, created_at, extra
          )
          SELECT 
            NEW.company_id,
            COALESCE(r->>'id', NEW.id || '_rec_' || (row_number() OVER ())),
            NEW.id,
            COALESCE(r->>'customerId', NEW.data->>'customerId'),
            r->>'orderReference',
            COALESCE((r->>'amount')::numeric, 0),
            COALESCE((r->>'date')::date, (NEW.updated_at)::date),
            r->>'paymentMethod', r->>'accountId', r->>'receivedBy', r->>'notes',
            COALESCE((r->>'createdAt')::timestamptz, NEW.updated_at), r
          FROM jsonb_array_elements(NEW.data->'receipts') AS r
          ON CONFLICT (company_id, id) DO UPDATE SET
            amount = EXCLUDED.amount,
            payment_date = EXCLUDED.payment_date,
            extra = EXCLUDED.extra;
        END IF;

        -- Projeção de withdrawals[] (preservando id exato)
        IF jsonb_typeof(NEW.data->'withdrawals') = 'array' THEN
          INSERT INTO erp.sales_order_withdrawals (
            company_id, id, order_id, date, net_weight, truck_plate, driver_name,
            carrier_name, ticket_number, notes, created_at, extra
          )
          SELECT 
            NEW.company_id,
            COALESCE(w->>'id', NEW.id || '_wth_' || (row_number() OVER ())),
            NEW.id,
            COALESCE((w->>'date')::timestamptz, NEW.updated_at),
            COALESCE((w->>'netWeight')::numeric, (w->>'quantity')::numeric, 0),
            w->>'truckPlate', w->>'driverName', w->>'carrierName', w->>'ticketNumber', w->>'notes',
            COALESCE((w->>'createdAt')::timestamptz, NEW.updated_at), w
          FROM jsonb_array_elements(NEW.data->'withdrawals') AS w
          ON CONFLICT (company_id, id) DO UPDATE SET
            net_weight = EXCLUDED.net_weight,
            truck_plate = EXCLUDED.truck_plate,
            extra = EXCLUDED.extra;
        END IF;

        -- Projeção de NF-e
        IF (NEW.data->>'nfeChave' IS NOT NULL OR NEW.data->>'nfeNumero' IS NOT NULL OR NEW.data->>'nfeStatus' IS NOT NULL) THEN
          INSERT INTO erp.sales_order_nfes (
            company_id, id, order_id, chave, numero, serie, status, emissao,
            protocolo, danfe_url, xml_url, nfe_payload, nfe_response, created_at, updated_at
          ) VALUES (
            NEW.company_id,
            NEW.id || '_nfe_' || COALESCE(NEW.data->>'nfeId', 'main'),
            NEW.id,
            NEW.data->>'nfeChave', NEW.data->>'nfeNumero', NEW.data->>'nfeSerie',
            COALESCE(NEW.data->>'nfeStatus', 'draft'),
            (NEW.data->>'nfeEmissao')::timestamptz,
            NEW.data->>'nfeProtocolo', NEW.data->>'nfeDanfeUrl', NEW.data->>'nfeXmlUrl',
            NEW.data->'nfePayload', NEW.data->'nfeRawResponse',
            NEW.updated_at, NEW.updated_at
          )
          ON CONFLICT (company_id, id) DO UPDATE SET
            chave = EXCLUDED.chave,
            numero = EXCLUDED.numero,
            status = EXCLUDED.status,
            protocolo = EXCLUDED.protocolo,
            updated_at = EXCLUDED.updated_at;
        END IF;

      ELSE
        NULL;
    END CASE;

  EXCEPTION WHEN OTHERS THEN
    -- SEGURANÇA TOTAL: Registra conflito sem parar a aplicação
    INSERT INTO erp.projection_conflicts (
      company_id, module, record_id, conflict_type, legacy_data, details
    ) VALUES (
      NEW.company_id, NEW.table_name, NEW.id, 'PROJECTION_ERROR', NEW.data, SQLERRM
    );
  END;

  RETURN NEW;
END;
$function$;
