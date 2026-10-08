const https = require("https");

const OAUTH_TOKEN = "sbp_oauth_bf19fbfb29739ab8f0281ac130b7cc7a72b6d45d";
const PROJECT_REF = "qbnmtimnurbciuzqtlxd";
const COMPANY_ID = "comp-1788898385141"; // CBA Mineração

function q(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    const req = https.request(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OAUTH_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    }, res => {
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.message && parsed.message.includes("ERROR")) {
            return reject(new Error(parsed.message));
          }
          resolve(parsed);
        } catch (e) {
          resolve(body);
        }
      });
    });
    req.write(data);
    req.end();
  });
}

async function testAbatimentoFlow() {
  console.log("=========================================================================");
  console.log("TESTE DE FUNCIONALIDADE: FLUXO DE ABATIMENTO E LANÇAMENTO NO BANCO");
  console.log("=========================================================================\n");

  const ts = Date.now();
  const testCustId = `test-cust-abat-${ts}`;
  const testOrderId = `test-ord-abat-${ts}`;
  const testInstId = `test-inst-${ts}`;
  const testRecId = `test-rec-${ts}`;
  const testTxId = `test-tx-${ts}`;
  const testPmtId = `pmt-${testRecId}-${testTxId}`;

  try {
    // 0. Criar cliente de teste para satisfazer FK
    console.log("0. Criando cliente de teste para integridade referencial...");
    await q(`
      INSERT INTO erp.customers (
        company_id, id, name, document, phone, email, street, number, 
        neighborhood, city, state, zip_code, ibge_code, isento_ie, tipo_pessoa, status
      ) VALUES (
        '${COMPANY_ID}', '${testCustId}', 'Cliente Teste Abatimento ${ts}',
        '99999999000199', '93988887777', 'teste@calcflow.com.br', 'Rua Teste', '100',
        'Centro', 'Santarém', 'PA', '68000-000', '1506807', false, 'PJ', 'Ativo'
      );
    `);
    console.log("   ✅ Cliente de teste criado com sucesso!");

    // 1. Criar pedido com parcela pendente de R$ 10.000,00
    console.log("1. Criando pedido com 1 parcela pendente de R$ 10.000,00...");
    await q(`
      INSERT INTO erp.sales_orders (
        company_id, id, reference, customer_id, seller_name, date, status,
        subtotal, discount, total, without_finance, payment_method, is_avulsa
      ) VALUES (
        '${COMPANY_ID}', '${testOrderId}', 'PED-TEST-${ts}', '${testCustId}',
        'Vendedor Teste', now(), 'Venda Confirmada', 10000.00, 0, 10000.00, false, 'Boleto', false
      );

      INSERT INTO erp.sales_order_installments (
        company_id, id, order_id, amount, due_date, status, paid_amount
      ) VALUES (
        '${COMPANY_ID}', '${testInstId}', '${testOrderId}', 10000.00,
        (now() + interval '30 days')::date, 'pendente', 0
      );
    `);
    console.log("   ✅ Pedido e parcela criados no erp.*!");

    // 2. Criar lançamento financeiro a receber correspondente à venda
    console.log("2. Criando lançamento financeiro vinculado...");
    await q(`
      INSERT INTO erp.transactions (
        company_id, id, type, description, amount, paid_amount, date, status, account_id, order_id
      ) VALUES (
        '${COMPANY_ID}', '${testTxId}', 'receita', 'Venda Teste PED-TEST-${ts}',
        10000.00, 0.00, now()::date, 'pendente', 'acc-1', '${testOrderId}'
      );
    `);
    console.log("   ✅ Lançamento criado com status 'pendente' e paid_amount = 0!");

    // 3. Registrar abatimento / recibo de pagamento parcial de R$ 4.000,00
    console.log("3. Registrando ABATIMENTO / RECIBO de R$ 4.000,00...");
    await q(`
      INSERT INTO erp.sales_order_receipts (
        company_id, id, order_id, customer_id, order_reference,
        amount, payment_date, payment_method, account_id, received_by, notes, extra
      ) VALUES (
        '${COMPANY_ID}', '${testRecId}', '${testOrderId}', 'cust-test', 'PED-TEST-${ts}',
        4000.00, now()::date, 'PIX', 'acc-1', 'Caixa Teste', 'Abatimento teste parcela 1',
        '{"number": "REC-TEST-${ts}"}'::jsonb
      );

      UPDATE erp.sales_order_installments
      SET paid_amount = 4000.00, status = 'parcial'
      WHERE company_id = '${COMPANY_ID}' AND id = '${testInstId}';
    `);
    console.log("   ✅ Recibo gravado e parcela atualizada para status 'parcial'!");

    // 4. Registrar a baixa / pagamento correspondente em erp.transaction_payments
    console.log("4. Inserindo baixa em erp.transaction_payments...");
    await q(`
      INSERT INTO erp.transaction_payments (
        company_id, id, transaction_id, amount, payment_date, payment_method, account_id, receipt_id, notes
      ) VALUES (
        '${COMPANY_ID}', '${testPmtId}', '${testTxId}', 4000.00, now()::date, 'PIX', 'acc-1', '${testRecId}', 'Baixa ref recibo ${testRecId}'
      );
    `);
    console.log("   ✅ Baixa inserida em erp.transaction_payments!");

    // 5. Verificar a reação do banco: Trigger trg_tx_payments_sync deve ter recalculado a transação
    console.log("5. Verificando recálculo automático da transação via trigger...");
    const txUpdated = await q(`
      SELECT id, amount, paid_amount, status 
      FROM erp.transactions 
      WHERE company_id = '${COMPANY_ID}' AND id = '${testTxId}';
    `);
    console.log("   Transação atualizada:", txUpdated[0]);
    if (Number(txUpdated[0].paid_amount) === 4000.00 && txUpdated[0].status === 'parcial') {
      console.log("   ✅ Trigger trg_tx_payments_sync atualizou paid_amount para R$ 4.000,00 e status para 'parcial'!");
    } else {
      throw new Error(`Falha na atualização automática da transação: ${JSON.stringify(txUpdated)}`);
    }

    // 6. Verificar se a projeção reversa em public.app_records montou o recibo no JSON do pedido
    console.log("6. Verificando montagem do JSON do pedido em public.app_records...");
    const appOrder = await q(`
      SELECT id, 
             jsonb_array_length(data->'payments') as parcelas_count,
             jsonb_array_length(data->'receipts') as recibos_count,
             data->'receipts'->0->>'amount' as primeiro_recibo_valor
      FROM public.app_records 
      WHERE company_id = '${COMPANY_ID}' AND table_name = 'sales_orders' AND id = '${testOrderId}';
    `);
    console.log("   Pedido em public.app_records:", appOrder[0]);
    if (appOrder.length > 0 && 
        Number(appOrder[0].parcelas_count) === 1 && 
        Number(appOrder[0].recibos_count) === 1 && 
        Number(appOrder[0].primeiro_recibo_valor) === 4000) {
      console.log("   ✅ Projeção reversa do pedido montou as parcelas e os recibos perfeitamente!");
    } else {
      throw new Error(`Falha na projeção reversa do pedido: ${JSON.stringify(appOrder)}`);
    }

    // 7. Testar a trava de índice único contra recibos duplicados
    console.log("7. Testando trava de unicidade contra duplicidade de recibo em pagamentos...");
    let blocked = false;
    try {
      await q(`
        INSERT INTO erp.transaction_payments (
          company_id, id, transaction_id, amount, payment_date, payment_method, account_id, receipt_id, notes
        ) VALUES (
          '${COMPANY_ID}', 'pmt-tentativa-duplicata', '${testTxId}', 4000.00, now()::date, 'PIX', 'acc-1', '${testRecId}', 'Tentativa duplicada'
        );
      `);
    } catch (e) {
      blocked = true;
      console.log("   ✅ Sucesso! O PostgreSQL bloqueou a inserção duplicada:", e.message);
    }
    if (!blocked) {
      throw new Error("ALERTA: O índice de unicidade não bloqueou o recibo duplicado!");
    }

    // 8. Limpeza dos dados de teste
    console.log("\n8. Limpando dados de teste...");
    await q(`
      DELETE FROM erp.transaction_payments WHERE company_id = '${COMPANY_ID}' AND transaction_id = '${testTxId}';
      DELETE FROM erp.transactions WHERE company_id = '${COMPANY_ID}' AND id = '${testTxId}';
      DELETE FROM public.app_records WHERE company_id = '${COMPANY_ID}' AND table_name = 'transactions' AND id = '${testTxId}';
      DELETE FROM erp.sales_order_receipts WHERE company_id = '${COMPANY_ID}' AND order_id = '${testOrderId}';
      DELETE FROM erp.sales_order_installments WHERE company_id = '${COMPANY_ID}' AND order_id = '${testOrderId}';
      DELETE FROM erp.sales_orders WHERE company_id = '${COMPANY_ID}' AND id = '${testOrderId}';
      DELETE FROM public.app_records WHERE company_id = '${COMPANY_ID}' AND table_name = 'sales_orders' AND id = '${testOrderId}';
      DELETE FROM erp.customers WHERE company_id = '${COMPANY_ID}' AND id = '${testCustId}';
      DELETE FROM public.app_records WHERE company_id = '${COMPANY_ID}' AND table_name = 'customers' AND id = '${testCustId}';
    `);
    console.log("   ✅ Limpeza completa efetuada com sucesso!");

    console.log("\n=========================================================================");
    console.log("TODAS AS FUNCIONALIDADES DE ABATIMENTO E LANÇAMENTO FORAM VALIDADAS!");
    console.log("=========================================================================");
  } catch (err) {
    console.error("❌ ERRO NO TESTE:", err);
    process.exit(1);
  }
}

testAbatimentoFlow();
