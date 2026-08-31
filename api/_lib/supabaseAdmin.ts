import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null | undefined;

export function getAdminSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();
  if (!url || !key) {
    cached = null;
    return cached;
  }
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

export async function getFiscalConfigForCompany(companyId: string): Promise<any | null> {
  const supabase = getAdminSupabase();
  if (!supabase || !companyId) return null;
  const { data, error } = await supabase
    .from('app_records')
    .select('data')
    .eq('table_name', 'fiscal_config')
    .eq('company_id', companyId)
    .limit(5);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = data.find((r: any) => r?.data && !r.data.__isSeedMeta && r.data.id !== '__seed__') || data[0];
  return row?.data || null;
}

type OrderRow = { id: string; company_id: string; data: any };

export async function findSalesOrder(opts: {
  companyId?: string;
  orderId?: string;
  invoiceId?: string;
  reference?: string;
}): Promise<OrderRow | null> {
  const supabase = getAdminSupabase();
  if (!supabase) return null;

  const run = async (column: string, value: string, companyId?: string) => {
    if (!value) return null;
    let q = supabase
      .from('app_records')
      .select('id, company_id, data')
      .eq('table_name', 'sales_orders')
      .filter(column === 'id' ? 'id' : column, 'eq', value)
      .limit(5);
    if (companyId) q = q.eq('company_id', companyId);
    const { data, error } = await q;
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const hit = data.find((r: any) => r?.data && r.id !== '__seed__') || data[0];
    if (!hit) return null;
    return { id: hit.id, company_id: hit.company_id, data: hit.data };
  };

  if (opts.orderId) {
    const byId = await run('id', opts.orderId, opts.companyId);
    if (byId) return byId;
  }
  if (opts.invoiceId) {
    const byInvoice = await run('data->>nfeId', opts.invoiceId, opts.companyId);
    if (byInvoice) return byInvoice;
  }
  if (opts.reference) {
    const byRef = await run('data->>reference', opts.reference, opts.companyId);
    if (byRef) return byRef;
  }
  return null;
}

export async function patchSalesOrder(row: OrderRow, patch: Record<string, any>): Promise<boolean> {
  const supabase = getAdminSupabase();
  if (!supabase) return false;
  const next = { ...(row.data || {}), ...patch, id: row.id, companyId: row.data?.companyId || row.company_id };
  const { error } = await supabase.from('app_records').upsert(
    {
      id: row.id,
      table_name: 'sales_orders',
      company_id: row.company_id,
      data: next,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'table_name,company_id,id' }
  );
  return !error;
}
