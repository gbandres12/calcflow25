export type AppRecordRow = {
  id: string;
  table_name: string;
  company_id: string;
  data?: any;
  updated_at?: string;
};

const recordKey = (row: Pick<AppRecordRow, 'table_name' | 'id'>) =>
  `${row.table_name}::${row.id}`;

export function planTenantCopy(sourceRows: AppRecordRow[], targetRows: AppRecordRow[]) {
  const targetKeys = new Set(targetRows.map(recordKey));
  const toCopy: AppRecordRow[] = [];
  const skipped: AppRecordRow[] = [];
  for (const row of sourceRows) {
    if (targetKeys.has(recordKey(row))) skipped.push(row);
    else toCopy.push(row);
  }
  return { toCopy, skipped };
}

export function isAuthUserId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ''));
}

export function planUserDedupe(
  userRows: AppRecordRow[],
  authIdByEmail: Record<string, string> = {}
) {
  const groups = new Map<string, AppRecordRow[]>();
  for (const row of userRows) {
    const email = String(row.data?.email || '').trim().toLowerCase();
    if (!email) continue;
    const list = groups.get(email) || [];
    list.push(row);
    groups.set(email, list);
  }

  const keep: AppRecordRow[] = [];
  const remove: AppRecordRow[] = [];

  groups.forEach((rows, email) => {
    if (rows.length < 2) {
      keep.push(...rows);
      return;
    }
    const authId = authIdByEmail[email];
    const ranked = [...rows].sort((a, b) => {
      const aAuth = authId && a.id === authId ? 1 : 0;
      const bAuth = authId && b.id === authId ? 1 : 0;
      if (aAuth !== bAuth) return bAuth - aAuth;
      const aUuid = isAuthUserId(a.id) ? 1 : 0;
      const bUuid = isAuthUserId(b.id) ? 1 : 0;
      if (aUuid !== bUuid) return bUuid - aUuid;
      return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
    });
    keep.push(ranked[0]);
    remove.push(...ranked.slice(1));
  });

  return { keep, remove };
}

export function summarizeTenantRecords(rows: AppRecordRow[]) {
  const users = rows.filter((row) => row.table_name === 'users' && row.id !== '__seed__' && !row.data?.__isSeedMeta);
  const orders = rows.filter((row) => row.table_name === 'sales_orders' && row.id !== '__seed__' && !row.data?.__isSeedMeta);
  const nfeOrders = orders.filter((row) => {
    const data = row.data || {};
    if (data.nfeStatus === 'autorizada' || data.nfeChave) return true;
    return Array.isArray(data.nfes) && data.nfes.some((nfe: any) => nfe?.nfeStatus === 'autorizada' || nfe?.nfeChave);
  });
  return {
    total: rows.filter((row) => row.id !== '__seed__' && !row.data?.__isSeedMeta).length,
    salesOrders: orders.length,
    nfeOrders: nfeOrders.length,
    customers: rows.filter((row) => row.table_name === 'customers' && row.id !== '__seed__').length,
    transactions: rows.filter((row) => row.table_name === 'transactions' && row.id !== '__seed__').length,
    users: users.map((row) => ({
      id: row.id,
      name: row.data?.name || '',
      email: row.data?.email || '',
      role: row.data?.role || ''
    }))
  };
}
