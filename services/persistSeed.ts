export const SEED_DOC_ID = '__seed__';

export const stripSeedDocs = (rows: any[]) =>
  (rows || []).filter((row) => row && row.id !== SEED_DOC_ID && !row.__isSeedMeta);

export const hasSeedMeta = (rows: any[]) =>
  (rows || []).some((row) => row && (row.id === SEED_DOC_ID || row.__isSeedMeta));

export const seedMetaRecord = (tableName: string, companyId: string) => ({
  id: SEED_DOC_ID,
  __isSeedMeta: true,
  tableName,
  companyId,
  initializedAt: new Date().toISOString()
});

export const mapSupabaseRows = (data: any[]) =>
  (data || [])
    .map((row: any) => {
      const payload = row?.data && typeof row.data === 'object' ? row.data : row;
      if (!payload) return null;
      return { ...payload, id: String(payload.id || row.id) };
    })
    .filter(Boolean);

export const seedMetaUpsertRow = (tableName: string, companyId: string) => ({
  id: SEED_DOC_ID,
  table_name: tableName,
  company_id: companyId,
  data: seedMetaRecord(tableName, companyId),
  updated_at: new Date().toISOString()
});
