import { getAdminSupabase } from './supabaseAdmin.js';

/**
 * Acesso server-side ao app_records com a service role.
 *
 * A service role ignora a RLS de company_memberships, então o company_id
 * passado aqui é a única fronteira entre empresas: toda query filtra por ele.
 */

const SEED_DOC_ID = '__seed__';

const isOperationalRecord = (record: any): boolean =>
  Boolean(record) && record.id !== SEED_DOC_ID && !record.__isSeedMeta;

const normalizeRow = (row: any): any | null => {
  const payload = row?.data && typeof row.data === 'object' ? row.data : null;
  if (!payload) return null;
  return { ...payload, id: String(payload.id || row.id) };
};

/**
 * Mesma normalização do resolveCompanyKey do dataService. Repetida aqui de
 * propósito: importar o dataService no servidor traria localStorage e os
 * constants com componentes React junto.
 */
function requireCompanyId(companyId: string): string {
  const clean = String(companyId || '').trim();
  if (!clean) throw new Error('companyId obrigatório para ler ou gravar no app_records.');
  if (clean === 'main' || clean === 'demo') return 'matriz-demo';
  return clean;
}

export async function getTable(companyId: string, tableName: string): Promise<any[]> {
  const supabase = getAdminSupabase();
  if (!supabase) return [];
  const company = requireCompanyId(companyId);

  const { data, error } = await supabase
    .from('app_records')
    .select('id, data')
    .eq('table_name', tableName)
    .eq('company_id', company);

  if (error) {
    throw new Error(`Falha ao ler ${tableName} no Supabase: ${error.message}`);
  }

  return (data || []).map(normalizeRow).filter(isOperationalRecord);
}

export async function getTables(
  companyId: string,
  tableNames: string[]
): Promise<Record<string, any[]>> {
  const results = await Promise.all(
    tableNames.map(async (tableName) => [tableName, await getTable(companyId, tableName)] as const)
  );
  return Object.fromEntries(results);
}

export async function getRecord(
  companyId: string,
  tableName: string,
  id: string
): Promise<any | null> {
  const supabase = getAdminSupabase();
  if (!supabase) return null;
  const company = requireCompanyId(companyId);

  const { data, error } = await supabase
    .from('app_records')
    .select('id, data')
    .eq('table_name', tableName)
    .eq('company_id', company)
    .eq('id', String(id))
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao ler ${tableName}/${id} no Supabase: ${error.message}`);
  }

  const record = data ? normalizeRow(data) : null;
  return isOperationalRecord(record) ? record : null;
}

export async function upsert(companyId: string, tableName: string, record: any): Promise<any> {
  const [saved] = await upsertMany(companyId, tableName, [record]);
  return saved;
}

export async function upsertMany(
  companyId: string,
  tableName: string,
  records: any[]
): Promise<any[]> {
  const supabase = getAdminSupabase();
  if (!supabase) throw new Error('Supabase não configurado no servidor.');
  const company = requireCompanyId(companyId);

  const operational = (records || []).filter(isOperationalRecord);
  if (!operational.length) return [];

  const now = new Date().toISOString();
  const rows = operational.map((record) => ({
    id: String(record.id),
    table_name: tableName,
    company_id: company,
    data: { ...record, id: String(record.id), companyId: record.companyId || company },
    updated_at: now
  }));

  const { error } = await supabase
    .from('app_records')
    .upsert(rows, { onConflict: 'table_name,company_id,id' });

  if (error) {
    throw new Error(`Falha ao gravar ${tableName} no Supabase: ${error.message}`);
  }

  return rows.map((row) => row.data);
}
