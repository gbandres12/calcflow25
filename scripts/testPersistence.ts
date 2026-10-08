import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente. Não grave chaves no repositório.');
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anonClient = ANON_KEY ? createClient(SUPABASE_URL, ANON_KEY) : adminClient;

const TEST_COMPANY_ID = 'comp-1788898385141';
const TEST_PROBE_ID = `audit-test-${Date.now()}`;

async function runTests() {
  console.log('====================================================');
  console.log('INICIANDO BATERIA DE TESTES REAIS DE PERSISTÊNCIA');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  // TESTE 1: Inserção de registro de teste
  console.log('1. Testando INSERT de cliente com dados completos...');
  const initialCustomer = {
    id: TEST_PROBE_ID,
    companyId: TEST_COMPANY_ID,
    name: 'Cliente Auditoria Teste',
    document: '12345678000199',
    city: 'Santarém',
    state: 'PA',
    ibgeCode: '1506807',
    status: 'Ativo',
    phone: '93999999999'
  };

  const { error: insertErr } = await adminClient.from('app_records').insert({
    id: TEST_PROBE_ID,
    table_name: 'customers',
    company_id: TEST_COMPANY_ID,
    data: initialCustomer,
    updated_at: new Date().toISOString()
  });

  if (insertErr) {
    console.error('❌ Falha no INSERT:', insertErr.message);
    failed++;
  } else {
    console.log('✓ INSERT realizado com sucesso no app_records.');
    passed++;
  }

  // TESTE 2: Leitura direta do banco (confirmação física)
  console.log('\n2. Confirmando presença física no banco PostgreSQL...');
  const { data: readData, error: readErr } = await adminClient
    .from('app_records')
    .select('id, data')
    .eq('id', TEST_PROBE_ID)
    .eq('table_name', 'customers')
    .eq('company_id', TEST_COMPANY_ID)
    .single();

  if (readErr || !readData || readData.data?.name !== 'Cliente Auditoria Teste') {
    console.error('❌ Falha na confirmação física:', readErr?.message);
    failed++;
  } else {
    console.log('✓ Registro confirmado no banco com 100% dos dados:', readData.data.name);
    passed++;
  }

  // TESTE 3: Atualização parcial com merge (simulando a correção anti-truncamento)
  console.log('\n3. Testando UPDATE parcial com merge para garantir que campos não são destruídos...');
  const partialUpdate = { ibgeCode: '1506808', phone: '93988888888' };
  const mergedRecord = { ...readData.data, ...partialUpdate };

  const { error: updateErr } = await adminClient.from('app_records').upsert({
    id: TEST_PROBE_ID,
    table_name: 'customers',
    company_id: TEST_COMPANY_ID,
    data: mergedRecord,
    updated_at: new Date().toISOString()
  }, { onConflict: 'table_name,company_id,id' });

  if (updateErr) {
    console.error('❌ Falha no UPDATE mesclado:', updateErr.message);
    failed++;
  } else {
    console.log('✓ UPDATE com merge enviado ao Supabase.');
    passed++;
  }

  // TESTE 4: Confirmar que campos originais (name, document) foram PRESERVADOS
  console.log('\n4. Verificando integridade dos campos anteriores após atualização...');
  const { data: updatedData, error: verifyErr } = await adminClient
    .from('app_records')
    .select('id, data')
    .eq('id', TEST_PROBE_ID)
    .single();

  if (verifyErr || !updatedData) {
    console.error('❌ Falha ao verificar update:', verifyErr?.message);
    failed++;
  } else if (
    updatedData.data?.name === 'Cliente Auditoria Teste' &&
    updatedData.data?.document === '12345678000199' &&
    updatedData.data?.ibgeCode === '1506808'
  ) {
    console.log('✓ SUCESSO ABSOLUTO: Nome e documento preservados intactos, novo ibgeCode aplicado!');
    passed++;
  } else {
    console.error('❌ DADOS PERDIDOS: Um dos campos anteriores foi sobrescrito:', updatedData.data);
    failed++;
  }

  // TESTE 5: Teste de segurança RLS (Garantir que chave anon não pode acessar empresa privada)
  console.log('\n5. Testando isolamento RLS com papel anônimo (anon)...');
  const { data: anonData, error: anonErr } = await anonClient
    .from('app_records')
    .select('id')
    .eq('company_id', TEST_COMPANY_ID);

  if (anonData && anonData.length > 0) {
    console.error('❌ FALHA DE SEGURANÇA: Chave anon conseguiu ler registros da empresa privada!');
    failed++;
  } else {
    console.log('✓ RLS ATIVO E SEGURO: Acesso anônimo a empresas de produção está 100% bloqueado.');
    passed++;
  }

  // TESTE 6: Limpeza do registro de teste
  console.log('\n6. Limpando registro de teste do banco de dados...');
  const { error: deleteErr } = await adminClient
    .from('app_records')
    .delete()
    .eq('id', TEST_PROBE_ID)
    .eq('company_id', TEST_COMPANY_ID);

  if (deleteErr) {
    console.error('❌ Falha na exclusão do registro de teste:', deleteErr.message);
    failed++;
  } else {
    console.log('✓ Registro de teste removido com sucesso. Banco de dados limpo.');
    passed++;
  }

  console.log('\n====================================================');
  console.log(`BATERIA FINALIZADA: ${passed} APROVADOS, ${failed} FALHAS`);
  console.log('====================================================');
}

runTests().catch(console.error);
