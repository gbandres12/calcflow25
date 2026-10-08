import fs from 'fs';
import path from 'path';

const TOKEN = 'sbp_oauth_e11b7e6134e0175e1ffb599e5f5f521bf8495a18';
const PROJECT_REF = 'qbnmtimnurbciuzqtlxd';
const QUERY_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

async function sql(query: string): Promise<any> {
  const res = await fetch(QUERY_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return await res.json();
}

async function main() {
  console.log('=== CALCFLOW25 - FASE 0: DIAGNÓSTICO E BACKUP SOMENTE LEITURA ===\n');

  // 1. Empresas cadastradas na tabela 'companies'
  console.log('1. Verificando tabela public.companies...');
  const companies = await sql('SELECT id, name, created_at FROM public.companies ORDER BY id;');
  console.log(`Empresas cadastradas (${companies.length}):`, companies);

  // 2. Contagem de app_records por empresa e tabela
  console.log('\n2. Contagem de public.app_records por company_id e table_name...');
  const counts = await sql(`
    SELECT company_id, table_name, count(*) as total
    FROM public.app_records
    GROUP BY company_id, table_name
    ORDER BY company_id, table_name;
  `);
  console.table(counts);

  // 3. Verificando tabelas legadas do public
  console.log('\n3. Verificando se as tabelas legadas contêm dados...');
  const legacyTables = ['customers', 'products', 'orders', 'stock_moves', 'invoices'];
  for (const t of legacyTables) {
    try {
      const rows = await sql(`SELECT count(*) as count FROM public."${t}";`);
      console.log(`- public.${t}: ${rows[0]?.count ?? 0} registros`);
    } catch (e: any) {
      console.log(`- public.${t}: erro ao consultar (${e.message})`);
    }
  }

  // 4. Divergência de companyId no JSON vs coluna company_id
  console.log('\n4. Verificando divergência de companyId no JSON vs coluna company_id...');
  const companyMismatch = await sql(`
    SELECT table_name, company_id, data->>'companyId' as json_company_id, count(*) as total
    FROM public.app_records
    WHERE data->>'companyId' IS NOT NULL AND data->>'companyId' != company_id
    GROUP BY table_name, company_id, data->>'companyId';
  `);
  console.log('Divergências de companyId:', companyMismatch.length === 0 ? 'NENHUMA (100% íntegro)' : companyMismatch);

  // 5. Pedidos com referência duplicada na mesma empresa
  console.log('\n5. Verificando referências duplicadas em pedidos...');
  const dupRefs = await sql(`
    SELECT company_id, data->>'reference' as reference, count(*) as count
    FROM public.app_records
    WHERE table_name = 'sales_orders' AND data->>'reference' IS NOT NULL
    GROUP BY company_id, data->>'reference'
    HAVING count(*) > 1;
  `);
  console.log('Pedidos com referência duplicada:', dupRefs.length === 0 ? 'NENHUM (100% único)' : dupRefs);

  // 6. Estoque negativo ou fracionado incomum
  console.log('\n6. Verificando estoque negativo em inventory e store_items...');
  const negInventory = await sql(`
    SELECT company_id, table_name, id, data->>'name' as name, data->>'quantity' as quantity
    FROM public.app_records
    WHERE table_name IN ('inventory', 'store_items')
      AND (data->>'quantity') ~ '^-?[0-9]+(\.[0-9]+)?$'
      AND (data->>'quantity')::numeric < 0;
  `);
  console.log('Itens com estoque negativo:', negInventory.length === 0 ? 'NENHUM' : negInventory);

  // 7. Backup completo de public.app_records
  console.log('\n7. Realizando backup completo de public.app_records...');
  const allRecords = await sql(`
    SELECT table_name, company_id, id, data, updated_at
    FROM public.app_records
    ORDER BY company_id, table_name, id;
  `);
  console.log(`Total de registros baixados para backup: ${allRecords.length}`);

  const backupDir = path.resolve('backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `app_records_backup_${timestamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(allRecords, null, 2), 'utf-8');
  console.log(`✓ Backup salvo com sucesso em: ${backupFile}`);

  console.log('\n=== FASE 0 CONCLUÍDA COM SUCESSO ===');
}

main().catch(err => {
  console.error('Erro na execução da Fase 0:', err);
  process.exit(1);
});
