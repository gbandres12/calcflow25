const https = require("https");

const OAUTH_TOKEN = "sbp_oauth_bf19fbfb29739ab8f0281ac130b7cc7a72b6d45d";
const PROJECT_REF = "qbnmtimnurbciuzqtlxd";
const COMPANY_ID = "comp-1788898385141"; // CBA Mineração

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

async function runVerification() {
  console.log("=================================================================");
  console.log("TESTE DE VERIFICAÇÃO: GRAVAÇÃO DE NOVAS LINHAS NO ERP (SCHEMA erp.*)");
  console.log("=================================================================\n");

  const timestamp = Date.now();
  const testCustomerId = `test-cust-${timestamp}`;
  const testOrderId = `test-ord-${timestamp}`;
  const testTxId = `test-tx-${timestamp}`;
  const testProductId = `test-prod-${timestamp}`;

  let passed = 0;
  let failed = 0;

  // -------------------------------------------------------------
  // 1. TESTE DE NOVO CLIENTE
  // -------------------------------------------------------------
  console.log("1. Testando gravação de NOVO CLIENTE...");
  try {
    await querySupabase(`
      INSERT INTO erp.customers (
        company_id, id, name, document, phone, email, street, number, 
        neighborhood, city, state, zip_code, ibge_code, isento_ie, tipo_pessoa, status
      ) VALUES (
        '${COMPANY_ID}', '${testCustomerId}', 'Cliente Teste Automatizado ${timestamp}',
        '12345678000199', '93988887777', 'teste@calcflow.com.br', 'Rua Teste', '100',
        'Centro', 'Santarém', 'PA', '68000-000', '1506807', false, 'PJ', 'Ativo'
      );
    `);

    // Verificar se foi gravado no erp.customers
    const erpCust = await querySupabase(`
      SELECT id, name, document, deleted_at FROM erp.customers 
      WHERE company_id = '${COMPANY_ID}' AND id = '${testCustomerId}';
    `);

    // Verificar se a trigger projetou para public.app_records
    const appCust = await querySupabase(`
      SELECT id, data->>'name' as name, data->>'document' as document 
      FROM public.app_records 
      WHERE company_id = '${COMPANY_ID}' AND table_name = 'customers' AND id = '${testCustomerId}';
    `);

    if (erpCust.length > 0 && appCust.length > 0 && erpCust[0].name === appCust[0].name) {
      console.log("   ✅ Cliente gravado com sucesso no erp.customers!");
      console.log("   ✅ Projeção reversa para public.app_records confirmada!");
      passed++;
    } else {
      throw new Error(`Falha na validação do cliente: erp=${JSON.stringify(erpCust)} app=${JSON.stringify(appCust)}`);
    }
  } catch (err) {
    console.error("   ❌ Erro ao gravar cliente:", err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // 2. TESTE DE NOVO PRODUTO NO ESTOQUE
  // -------------------------------------------------------------
  console.log("\n2. Testando gravação de NOVO PRODUTO NO ESTOQUE...");
  try {
    await querySupabase(`
      INSERT INTO erp.products (
        company_id, id, code, name, unit, category, min_stock, quantity,
        cost_price, unit_price, ncm, cst, cfop
      ) VALUES (
        '${COMPANY_ID}', '${testProductId}', 'TEST-99', 'Produto Teste Verificação',
        'TON', 'Calcário', 10, 250, 80.00, 150.00, '25171000', '40', '5101'
      );
    `);

    const erpProd = await querySupabase(`
      SELECT id, name, quantity FROM erp.products 
      WHERE company_id = '${COMPANY_ID}' AND id = '${testProductId}';
    `);

    const appProd = await querySupabase(`
      SELECT id, data->>'name' as name, data->>'quantity' as quantity 
      FROM public.app_records 
      WHERE company_id = '${COMPANY_ID}' AND table_name = 'inventory' AND id = '${testProductId}';
    `);

    if (erpProd.length > 0 && appProd.length > 0 && erpProd[0].name === appProd[0].name) {
      console.log("   ✅ Produto gravado com sucesso no erp.products!");
      console.log("   ✅ Projeção reversa para public.app_records (tabela inventory) confirmada!");
      passed++;
    } else {
      throw new Error(`Falha na validação do produto: erp=${JSON.stringify(erpProd)} app=${JSON.stringify(appProd)}`);
    }
  } catch (err) {
    console.error("   ❌ Erro ao gravar produto:", err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // 3. TESTE DE NOVO PEDIDO DE VENDA COMPLETO (COM FILHAS)
  // -------------------------------------------------------------
  console.log("\n3. Testando gravação de NOVO PEDIDO DE VENDA COMPLETO (Cabeçalho + Itens + Parcelas + Retiradas)...");
  try {
    // 3.1 Cabeçalho
    await querySupabase(`
      INSERT INTO erp.sales_orders (
        company_id, id, reference, customer_id, seller_name, date, status,
        subtotal, discount, total, without_finance, payment_method, is_avulsa
      ) VALUES (
        '${COMPANY_ID}', '${testOrderId}', 'PED-TEST-${timestamp}', '${testCustomerId}',
        'Vendedor Teste', now(), 'Venda Confirmada', 5000.00, 0, 5000.00, false, 'Boleto', false
      );
    `);

    // 3.2 Itens
    await querySupabase(`
      INSERT INTO erp.sales_order_items (
        company_id, id, order_id, product_id, product_name, quantity, unit, unit_price, total
      ) VALUES (
        '${COMPANY_ID}', '${testOrderId}_item_1', '${testOrderId}', '${testProductId}',
        'Produto Teste Verificação', 25.0, 'TON', 200.00, 5000.00
      );
    `);

    // 3.3 Parcelas financeiras
    await querySupabase(`
      INSERT INTO erp.sales_order_installments (
        company_id, id, order_id, amount, due_date, status, paid_amount
      ) VALUES (
        '${COMPANY_ID}', '${testOrderId}_inst_1', '${testOrderId}', 5000.00,
        (now() + interval '30 days')::date, 'pendente', 0
      );
    `);

    // 3.4 Retirada / Romaneio de pesagem de caminhão
    await querySupabase(`
      INSERT INTO erp.sales_order_withdrawals (
        company_id, id, order_id, date, net_weight, truck_plate, driver_name
      ) VALUES (
        '${COMPANY_ID}', '${testOrderId}_w_1', '${testOrderId}', now()::date,
        25.0, 'ABC1D23', 'Motorista Teste'
      );
    `);

    // Verificar se o pedido completo foi montado na projeção reversa de app_records
    const appOrder = await querySupabase(`
      SELECT id, 
             data->>'reference' as reference,
             data->>'total' as total,
             jsonb_array_length(data->'items') as items_count,
             jsonb_array_length(data->'payments') as payments_count,
             jsonb_array_length(data->'withdrawals') as withdrawals_count
      FROM public.app_records 
      WHERE company_id = '${COMPANY_ID}' AND table_name = 'sales_orders' AND id = '${testOrderId}';
    `);

    if (appOrder.length > 0 && 
        Number(appOrder[0].items_count) === 1 && 
        Number(appOrder[0].payments_count) === 1 && 
        Number(appOrder[0].withdrawals_count) === 1) {
      console.log("   ✅ Pedido gravado com sucesso no erp.sales_orders!");
      console.log("   ✅ Tabelas filhas (itens, parcelas, retiradas) gravadas com sucesso no erp.*!");
      console.log("   ✅ Trigger reverse_project_single_order montou o JSON completo perfeitamente em public.app_records!");
      console.log(`      (Itens: ${appOrder[0].items_count}, Parcelas: ${appOrder[0].payments_count}, Retiradas: ${appOrder[0].withdrawals_count})`);
      passed++;
    } else {
      throw new Error(`Falha na projeção do pedido: ${JSON.stringify(appOrder)}`);
    }
  } catch (err) {
    console.error("   ❌ Erro ao gravar pedido:", err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // 4. TESTE DE NOVO LANÇAMENTO FINANCEIRO
  // -------------------------------------------------------------
  console.log("\n4. Testando gravação de NOVO LANÇAMENTO FINANCEIRO...");
  try {
    await querySupabase(`
      INSERT INTO erp.transactions (
        company_id, id, type, description, amount, date, status, account_id, order_id
      ) VALUES (
        '${COMPANY_ID}', '${testTxId}', 'receita', 'Recebimento Teste ${timestamp}',
        5000.00, now()::date, 'concluido', 'acc-1', '${testOrderId}'
      );
    `);

    const erpTx = await querySupabase(`
      SELECT id, description, amount FROM erp.transactions 
      WHERE company_id = '${COMPANY_ID}' AND id = '${testTxId}';
    `);

    const appTx = await querySupabase(`
      SELECT id, data->>'description' as description, data->>'amount' as amount 
      FROM public.app_records 
      WHERE company_id = '${COMPANY_ID}' AND table_name = 'transactions' AND id = '${testTxId}';
    `);

    if (erpTx.length > 0 && appTx.length > 0 && erpTx[0].description === appTx[0].description) {
      console.log("   ✅ Lançamento gravado com sucesso no erp.transactions!");
      console.log("   ✅ Projeção reversa para public.app_records confirmada!");
      passed++;
    } else {
      throw new Error(`Falha na validação do lançamento: erp=${JSON.stringify(erpTx)} app=${JSON.stringify(appTx)}`);
    }
  } catch (err) {
    console.error("   ❌ Erro ao gravar transação:", err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // 5. TESTE DE EXCLUSÃO LIMPA DOS REGISTROS DE TESTE
  // -------------------------------------------------------------
  console.log("\n5. Testando EXCLUSÃO LIMPA dos registros de teste...");
  try {
    // Soft delete no erp.sales_orders
    await querySupabase(`
      UPDATE erp.sales_orders SET deleted_at = now() WHERE company_id = '${COMPANY_ID}' AND id = '${testOrderId}';
    `);

    // A trigger deve remover de public.app_records
    const appOrderAfterDel = await querySupabase(`
      SELECT id FROM public.app_records WHERE company_id = '${COMPANY_ID}' AND table_name = 'sales_orders' AND id = '${testOrderId}';
    `);

    if (appOrderAfterDel.length === 0) {
      console.log("   ✅ Soft-delete em erp.sales_orders removeu automaticamente do app_records ativo!");
      passed++;
    } else {
      throw new Error("Registro de pedido permaneceu no app_records após exclusão!");
    }

    // Limpeza física dos dados de teste
    await querySupabase(`
      DELETE FROM erp.sales_order_withdrawals WHERE company_id = '${COMPANY_ID}' AND order_id = '${testOrderId}';
      DELETE FROM erp.sales_order_installments WHERE company_id = '${COMPANY_ID}' AND order_id = '${testOrderId}';
      DELETE FROM erp.sales_order_items WHERE company_id = '${COMPANY_ID}' AND order_id = '${testOrderId}';
      DELETE FROM erp.sales_orders WHERE company_id = '${COMPANY_ID}' AND id = '${testOrderId}';
      DELETE FROM erp.transactions WHERE company_id = '${COMPANY_ID}' AND id = '${testTxId}';
      DELETE FROM public.app_records WHERE company_id = '${COMPANY_ID}' AND table_name = 'transactions' AND id = '${testTxId}';
      DELETE FROM erp.products WHERE company_id = '${COMPANY_ID}' AND id = '${testProductId}';
      DELETE FROM public.app_records WHERE company_id = '${COMPANY_ID}' AND table_name = 'inventory' AND id = '${testProductId}';
      DELETE FROM erp.customers WHERE company_id = '${COMPANY_ID}' AND id = '${testCustomerId}';
      DELETE FROM public.app_records WHERE company_id = '${COMPANY_ID}' AND table_name = 'customers' AND id = '${testCustomerId}';
    `);
    console.log("   ✅ Limpeza física dos registros de teste concluída com perfeição!");
  } catch (err) {
    console.error("   ❌ Erro ao limpar registros de teste:", err.message);
    failed++;
  }

  console.log("\n=================================================================");
  console.log(`RESULTADO FINAL: ${passed} PASSOU | ${failed} FALHOU`);
  console.log("=================================================================");
}

runVerification();
