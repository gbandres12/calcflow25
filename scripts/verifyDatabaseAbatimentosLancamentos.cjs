const https = require("https");

const OAUTH_TOKEN = "sbp_oauth_bf19fbfb29739ab8f0281ac130b7cc7a72b6d45d";
const PROJECT_REF = "qbnmtimnurbciuzqtlxd";

function querySupabase(sql) {
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
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function auditDatabase() {
  console.log("=========================================================================");
  console.log("AUDITORIA COMPLETA: PROCEDIMENTOS, ABATIMENTOS E LANÇAMENTOS NO BANCO");
  console.log("=========================================================================\n");

  // 1. PROCEDIMENTOS E TRIGGERS ATIVOS NO BANCO
  console.log("--- 1. PROCEDIMENTOS E TRIGGERS NO SCHEMA 'erp' E 'public' ---");
  const triggers = await querySupabase(`
    SELECT 
      event_object_schema as schema,
      event_object_table as table,
      trigger_name,
      action_timing,
      event_manipulation as event
    FROM information_schema.triggers
    WHERE event_object_schema IN ('erp', 'public')
      AND trigger_name LIKE '%reverse%' OR trigger_name LIKE '%nfe%' OR trigger_name LIKE '%sync%' OR trigger_name LIKE '%order%'
    ORDER BY event_object_schema, event_object_table, trigger_name;
  `);
  console.log(`Encontrados ${triggers.length} triggers de sincronização/projeção/proteção:`);
  triggers.forEach(t => {
    console.log(` - [${t.schema}.${t.table}] ${t.trigger_name} (${t.action_timing} ${t.event})`);
  });

  // 2. AUDITORIA DE ABATIMENTOS E RECIBOS (erp.sales_order_receipts)
  console.log("\n--- 2. AUDITORIA DE ABATIMENTOS E RECIBOS (erp.sales_order_receipts) ---");
  const receiptsSummary = await querySupabase(`
    SELECT 
      company_id,
      count(*) as total_recibos,
      sum(amount) as valor_total_abatido,
      min(payment_date) as primeiro_recibo,
      max(payment_date) as ultimo_recibo
    FROM erp.sales_order_receipts
    GROUP BY company_id;
  `);
  console.log("Resumo de Recibos/Abatimentos por Empresa:");
  console.table(receiptsSummary);

  // Amostra de recibos recentes
  const recentReceipts = await querySupabase(`
    SELECT 
      r.company_id,
      r.id,
      r.extra->>'number' as numero_recibo,
      r.order_id,
      o.reference as order_ref,
      r.amount,
      r.payment_date,
      r.payment_method
    FROM erp.sales_order_receipts r
    LEFT JOIN erp.sales_orders o ON o.company_id = r.company_id AND o.id = r.order_id
    ORDER BY r.created_at DESC
    LIMIT 10;
  `);
  console.log("\nÚltimos 10 Recibos/Abatimentos Gravados no Banco:");
  console.table(recentReceipts);

  // 3. AUDITORIA DE PARCELAS DE PEDIDOS (erp.sales_order_installments)
  console.log("\n--- 3. AUDITORIA DE PARCELAS DE PEDIDOS (erp.sales_order_installments) ---");
  const installmentsSummary = await querySupabase(`
    SELECT 
      company_id,
      status,
      count(*) as qtd_parcelas,
      sum(amount) as valor_total,
      sum(paid_amount) as valor_total_pago
    FROM erp.sales_order_installments
    GROUP BY company_id, status
    ORDER BY company_id, status;
  `);
  console.table(installmentsSummary);

  // 4. AUDITORIA DE LANÇAMENTOS FINANCEIROS (erp.transactions)
  console.log("\n--- 4. AUDITORIA DE LANÇAMENTOS FINANCEIROS (erp.transactions) ---");
  const transactionsSummary = await querySupabase(`
    SELECT 
      company_id,
      type,
      status,
      count(*) as total_transacoes,
      sum(amount) as valor_total,
      sum(paid_amount) as total_pago_abatido
    FROM erp.transactions
    WHERE deleted_at IS NULL
    GROUP BY company_id, type, status
    ORDER BY company_id, type, status;
  `);
  console.table(transactionsSummary);

  // 5. AUDITORIA DE BAIXAS / PAGAMENTOS DE TRANSAÇÕES (erp.transaction_payments)
  console.log("\n--- 5. AUDITORIA DE BAIXAS DE TRANSAÇÕES (erp.transaction_payments) ---");
  const paymentsSummary = await querySupabase(`
    SELECT 
      company_id,
      count(*) as total_baixas,
      sum(amount) as total_baixado,
      count(receipt_id) as baixas_com_recibo_vinculado
    FROM erp.transaction_payments
    GROUP BY company_id;
  `);
  console.table(paymentsSummary);

  // 6. CHECAGEM DE DISCREPÂNCIAS ENTRE TRANSAÇÕES E BAIXAS
  console.log("\n--- 6. VERIFICAÇÃO DE DISCREPÂNCIAS (paid_amount vs sum(transaction_payments)) ---");
  const discrepancies = await querySupabase(`
    SELECT 
      t.company_id,
      t.id as transaction_id,
      t.description,
      t.amount as transaction_amount,
      t.paid_amount as recorded_paid_amount,
      coalesce(sum(p.amount), 0) as sum_payments_table,
      abs(t.paid_amount - coalesce(sum(p.amount), 0)) as diff
    FROM erp.transactions t
    LEFT JOIN erp.transaction_payments p ON p.company_id = t.company_id AND p.transaction_id = t.id
    WHERE t.deleted_at IS NULL
    GROUP BY t.company_id, t.id, t.description, t.amount, t.paid_amount
    HAVING abs(t.paid_amount - coalesce(sum(p.amount), 0)) > 0.01;
  `);
  if (discrepancies.length === 0) {
    console.log("   ✅ Nenhuma discrepância entre paid_amount das transações e erp.transaction_payments!");
  } else {
    console.log(`   ⚠️ Encontradas ${discrepancies.length} transações com discrepância:`);
    console.table(discrepancies);
  }

  // 7. CHECAGEM ESPECÍFICA DE RECIBOS DUPLICADOS EM transaction_payments
  console.log("\n--- 7. VERIFICAÇÃO DE RECIBOS DUPLICADOS EM erp.transaction_payments ---");
  const duplicateReceiptPayments = await querySupabase(`
    SELECT 
      company_id,
      transaction_id,
      receipt_id,
      count(*) as total_ocorrencias,
      sum(amount) as soma_valores
    FROM erp.transaction_payments
    WHERE receipt_id IS NOT NULL
    GROUP BY company_id, transaction_id, receipt_id
    HAVING count(*) > 1;
  `);
  if (duplicateReceiptPayments.length === 0) {
    console.log("   ✅ Nenhum recibo duplicado em erp.transaction_payments!");
  } else {
    console.log(`   ⚠️ Encontrados recibos duplicados em erp.transaction_payments:`);
    console.table(duplicateReceiptPayments);
  }

  // 8. CHECAGEM DO CASO PED-2026-0043 (ord-muld5yf5-8vx18a)
  console.log("\n--- 8. AUDITORIA DETALHADA DO PED-2026-0043 ---");
  const caseOrder = await querySupabase(`
    SELECT id, reference, total, created_at FROM erp.sales_orders WHERE id = 'ord-muld5yf5-8vx18a';
  `);
  console.log("Pedido:", caseOrder);

  const orderReceipts = await querySupabase(`
    SELECT id, extra->>'number' as number, amount, payment_date, payment_method, extra->'installmentsCovered' as installments_covered 
    FROM erp.sales_order_receipts 
    WHERE order_id = 'ord-muld5yf5-8vx18a' 
    ORDER BY payment_date ASC;
  `);
  console.log(`Recibos do pedido (${orderReceipts.length} recibos, totalizando ${orderReceipts.reduce((a,c) => a + Number(c.amount), 0)}):`);
  console.table(orderReceipts);

  const linkedTx = await querySupabase(`
    SELECT id, description, amount, paid_amount, status 
    FROM erp.transactions 
    WHERE order_id = 'ord-muld5yf5-8vx18a' OR id = 'tx-muldbndm-9xnzc7';
  `);
  console.log("Transação vinculada:", linkedTx);

  const linkedPayments = await querySupabase(`
    SELECT id, transaction_id, receipt_id, amount, payment_date, payment_method 
    FROM erp.transaction_payments 
    WHERE transaction_id = 'tx-muldbndm-9xnzc7'
    ORDER BY payment_date ASC;
  `);
  console.log(`Pagamentos registrados na transação (${linkedPayments.length} pagamentos, totalizando ${linkedPayments.reduce((a,c) => a + Number(c.amount), 0)}):`);
  console.table(linkedPayments);
}

auditDatabase().catch(console.error);
