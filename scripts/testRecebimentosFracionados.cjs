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

async function verifyFractionalPaymentsLogic() {
  console.log("=========================================================================");
  console.log("VERIFICAÇÃO DA LÓGICA DE ABATIMENTOS E RECEBIMENTOS FRACIONADOS");
  console.log("=========================================================================\n");

  const ts = Date.now();
  const testCustId = `test-cust-frac-${ts}`;
  const testOrderId = `test-ord-frac-${ts}`;
  const testTxId = `test-tx-frac-${ts}`;

  try {
    // Cenário: Venda de R$ 50.000,00 dividida em 2 parcelas de R$ 25.000,00
    // O cliente vai pagar de forma fracionada em 4 depósitos picados:
    // Depósito 1: R$ 10.000,00 (abate parcialmente a parcela 1)
    // Depósito 2: R$ 15.000,00 (quita a parcela 1)
    // Depósito 3: R$ 8.354,27 (abate parcialmente a parcela 2 com centavos quebrados)
    // Depósito 4: R$ 16.645,73 (quita a parcela 2 exatamente até o centavo)
    // Total pago: R$ 50.000,00

    console.log("1. Criando pedido de R$ 50.000,00 e 2 parcelas de R$ 25.000,00...");
    await q(`
      INSERT INTO erp.customers (
        company_id, id, name, document, status
      ) VALUES (
        '${COMPANY_ID}', '${testCustId}', 'Cliente Fracionado Teste', '11122233344', 'Ativo'
      );

      INSERT INTO erp.sales_orders (
        company_id, id, reference, customer_id, total, status, without_finance
      ) VALUES (
        '${COMPANY_ID}', '${testOrderId}', 'PED-FRAC-${ts}', '${testCustId}', 50000.00, 'Venda Confirmada', false
      );

      INSERT INTO erp.sales_order_installments (
        company_id, id, order_id, amount, due_date, status, paid_amount
      ) VALUES 
      ('${COMPANY_ID}', '${testOrderId}_inst_1', '${testOrderId}', 25000.00, now()::date + 30, 'pendente', 0),
      ('${COMPANY_ID}', '${testOrderId}_inst_2', '${testOrderId}', 25000.00, now()::date + 60, 'pendente', 0);

      INSERT INTO erp.transactions (
        company_id, id, type, description, amount, paid_amount, status, order_id, account_id
      ) VALUES (
        '${COMPANY_ID}', '${testTxId}', 'receita', 'Venda PED-FRAC-${ts}', 50000.00, 0, 'pendente', '${testOrderId}', 'acc-1'
      );
    `);
    console.log("   ✅ Pedido, parcelas e transação criados com sucesso!");

    // Simulação do Depósito 1 (R$ 10.000,00)
    console.log("\n2. Processando 1º Recebimento Fracionado: R$ 10.000,00...");
    const rec1Id = `REC-${ts}-1`;
    await q(`
      INSERT INTO erp.sales_order_receipts (
        company_id, id, order_id, customer_id, amount, payment_date, payment_method, account_id, notes
      ) VALUES (
        '${COMPANY_ID}', '${rec1Id}', '${testOrderId}', '${testCustId}', 10000.00, now()::date, 'PIX', 'acc-1', 'Depósito 1 de 4'
      );

      INSERT INTO erp.transaction_payments (
        company_id, id, transaction_id, amount, payment_date, payment_method, account_id, receipt_id, notes
      ) VALUES (
        '${COMPANY_ID}', 'pmt-${rec1Id}-${testTxId}', '${testTxId}', 10000.00, now()::date, 'PIX', 'acc-1', '${rec1Id}', 'Baixa fracionada 1'
      );
    `);
    let tx = await q(`SELECT paid_amount, status FROM erp.transactions WHERE id = '${testTxId}';`);
    console.log(`   Transação após Depósito 1: paid_amount = R$ ${tx[0].paid_amount} | status = ${tx[0].status}`);
    if (Number(tx[0].paid_amount) !== 10000 || tx[0].status !== 'parcial') throw new Error("Falha no recálculo do depósito 1");

    // Simulação do Depósito 2 (R$ 15.000,00) -> total acumulado R$ 25.000,00
    console.log("\n3. Processando 2º Recebimento Fracionado: R$ 15.000,00...");
    const rec2Id = `REC-${ts}-2`;
    await q(`
      INSERT INTO erp.sales_order_receipts (
        company_id, id, order_id, customer_id, amount, payment_date, payment_method, account_id, notes
      ) VALUES (
        '${COMPANY_ID}', '${rec2Id}', '${testOrderId}', '${testCustId}', 15000.00, now()::date, 'PIX', 'acc-1', 'Depósito 2 de 4'
      );

      INSERT INTO erp.transaction_payments (
        company_id, id, transaction_id, amount, payment_date, payment_method, account_id, receipt_id, notes
      ) VALUES (
        '${COMPANY_ID}', 'pmt-${rec2Id}-${testTxId}', '${testTxId}', 15000.00, now()::date, 'PIX', 'acc-1', '${rec2Id}', 'Baixa fracionada 2'
      );
    `);
    tx = await q(`SELECT paid_amount, status FROM erp.transactions WHERE id = '${testTxId}';`);
    console.log(`   Transação após Depósito 2: paid_amount = R$ ${tx[0].paid_amount} | status = ${tx[0].status}`);
    if (Number(tx[0].paid_amount) !== 25000 || tx[0].status !== 'parcial') throw new Error("Falha no recálculo do depósito 2");

    // Simulação do Depósito 3 com centavos quebrados (R$ 8.354,27)
    console.log("\n4. Processando 3º Recebimento Fracionado (quebrado): R$ 8.354,27...");
    const rec3Id = `REC-${ts}-3`;
    await q(`
      INSERT INTO erp.sales_order_receipts (
        company_id, id, order_id, customer_id, amount, payment_date, payment_method, account_id, notes
      ) VALUES (
        '${COMPANY_ID}', '${rec3Id}', '${testOrderId}', '${testCustId}', 8354.27, now()::date, 'PIX', 'acc-1', 'Depósito 3 de 4'
      );

      INSERT INTO erp.transaction_payments (
        company_id, id, transaction_id, amount, payment_date, payment_method, account_id, receipt_id, notes
      ) VALUES (
        '${COMPANY_ID}', 'pmt-${rec3Id}-${testTxId}', '${testTxId}', 8354.27, now()::date, 'PIX', 'acc-1', '${rec3Id}', 'Baixa fracionada 3'
      );
    `);
    tx = await q(`SELECT paid_amount, status FROM erp.transactions WHERE id = '${testTxId}';`);
    console.log(`   Transação após Depósito 3: paid_amount = R$ ${tx[0].paid_amount} | status = ${tx[0].status}`);
    if (Number(tx[0].paid_amount) !== 33354.27 || tx[0].status !== 'parcial') throw new Error("Falha no recálculo do depósito 3");

    // Simulação do Depósito 4 com centavos complementares (R$ 16.645,73) -> total exato R$ 50.000,00
    console.log("\n5. Processando 4º Recebimento Fracionado (quitação total): R$ 16.645,73...");
    const rec4Id = `REC-${ts}-4`;
    await q(`
      INSERT INTO erp.sales_order_receipts (
        company_id, id, order_id, customer_id, amount, payment_date, payment_method, account_id, notes
      ) VALUES (
        '${COMPANY_ID}', '${rec4Id}', '${testOrderId}', '${testCustId}', 16645.73, now()::date, 'PIX', 'acc-1', 'Depósito 4 de 4 - Quitação'
      );

      INSERT INTO erp.transaction_payments (
        company_id, id, transaction_id, amount, payment_date, payment_method, account_id, receipt_id, notes
      ) VALUES (
        '${COMPANY_ID}', 'pmt-${rec4Id}-${testTxId}', '${testTxId}', 16645.73, now()::date, 'PIX', 'acc-1', '${rec4Id}', 'Baixa fracionada 4'
      );
    `);
    tx = await q(`SELECT paid_amount, status FROM erp.transactions WHERE id = '${testTxId}';`);
    console.log(`   Transação após Depósito 4: paid_amount = R$ ${tx[0].paid_amount} | status = ${tx[0].status}`);
    if (Number(tx[0].paid_amount) !== 50000 || tx[0].status !== 'pago') throw new Error("Falha no recálculo da quitação total");

    // Verificar se o pedido montou todos os 4 recibos na projeção reversa de app_records
    console.log("\n6. Verificando montagem de todos os recibos em public.app_records...");
    const appOrder = await q(`
      SELECT 
        jsonb_array_length(data->'receipts') as receipts_count,
        (
          SELECT sum((elem->>'amount')::numeric)
          FROM jsonb_array_elements(data->'receipts') elem
        ) as receipts_sum
      FROM public.app_records 
      WHERE table_name = 'sales_orders' AND id = '${testOrderId}';
    `);
    console.log("   Dados no app_records:", appOrder[0]);
    if (Number(appOrder[0].receipts_count) !== 4 || Number(appOrder[0].receipts_sum) !== 50000) {
      throw new Error(`Divergência na agregação dos recibos: ${JSON.stringify(appOrder)}`);
    }
    console.log("   ✅ Todos os 4 recebimentos fracionados foram agregados com precisão absoluta de centavos!");

    // Limpeza
    console.log("\n7. Limpeza dos dados de teste...");
    await q(`
      DELETE FROM erp.transaction_payments WHERE transaction_id = '${testTxId}';
      DELETE FROM erp.transactions WHERE id = '${testTxId}';
      DELETE FROM public.app_records WHERE table_name = 'transactions' AND id = '${testTxId}';
      DELETE FROM erp.sales_order_receipts WHERE order_id = '${testOrderId}';
      DELETE FROM erp.sales_order_installments WHERE order_id = '${testOrderId}';
      DELETE FROM erp.sales_orders WHERE id = '${testOrderId}';
      DELETE FROM public.app_records WHERE table_name = 'sales_orders' AND id = '${testOrderId}';
      DELETE FROM erp.customers WHERE id = '${testCustId}';
      DELETE FROM public.app_records WHERE table_name = 'customers' AND id = '${testCustId}';
    `);
    console.log("   ✅ Limpeza efetuada!");

    console.log("\n=========================================================================");
    console.log("LÓGICA DE RECEBIMENTOS FRACIONADOS E ABATIMENTOS VALIDADA COM SUCESSO!");
    console.log("=========================================================================");
  } catch (err) {
    console.error("❌ ERRO:", err.message);
    process.exit(1);
  }
}

verifyFractionalPaymentsLogic();
