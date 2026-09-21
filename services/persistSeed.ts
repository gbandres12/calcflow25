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

export const serializeRecord = (value: any): string => {
  if (Array.isArray(value)) return `[${value.map(serializeRecord).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${serializeRecord(value[key])}`
    ).join(',')}}`;
  }
  return JSON.stringify(value);
};

export const mergeRecordsById = (remoteRecords: any[], localRecords: any[]): any[] => {
  const merged = new Map<string, any>();
  stripSeedDocs(remoteRecords).forEach((record) => {
    if (record?.id) merged.set(String(record.id), record);
  });
  stripSeedDocs(localRecords).forEach((record) => {
    if (record?.id) {
      const id = String(record.id);
      merged.set(id, { ...(merged.get(id) || {}), ...record, id });
    }
  });
  return Array.from(merged.values());
};

/** Mantém cadastros locais que um fetch atrasado da nuvem ainda não devolveu. */
export const keepUnseenLocalRecords = (remoteRecords: any[], localRecords: any[]): any[] => {
  const remote = stripSeedDocs(remoteRecords);
  const remoteIds = new Set(remote.map((record) => String(record.id)));
  const extras = stripSeedDocs(localRecords).filter(
    (record) => record?.id && !remoteIds.has(String(record.id))
  );
  return extras.length ? [...remote, ...extras] : remote;
};

export const applyPendingDeletes = (records: any[], deletedIds: string[]): any[] => {
  if (!deletedIds?.length) return stripSeedDocs(records);
  const removed = new Set(deletedIds.map((id) => String(id)));
  return stripSeedDocs(records).filter((record) => !removed.has(String(record.id)));
};

export const splitConfirmedPending = (pending: any[], remoteRecords: any[]) => {
  const remoteById = new Map(
    stripSeedDocs(remoteRecords).map((record) => [String(record.id), serializeRecord(record)])
  );
  const confirmed: any[] = [];
  const unconfirmed: any[] = [];
  stripSeedDocs(pending).forEach((record) => {
    if (remoteById.get(String(record.id)) === serializeRecord(record)) confirmed.push(record);
    else unconfirmed.push(record);
  });
  return { confirmed, unconfirmed };
};

export const remainingPendingAfterConfirm = (pending: any[], sentRecords: any[]): any[] => {
  const sentById = new Map(sentRecords.map((record) => [String(record.id), serializeRecord(record)]));
  return stripSeedDocs(pending).filter((record) => {
    const sentVersion = sentById.get(String(record.id));
    return !sentVersion || serializeRecord(record) !== sentVersion;
  });
};

export const remainingPendingDeletes = (pendingIds: string[], remoteRecords: any[]): string[] => {
  const remoteIds = new Set(stripSeedDocs(remoteRecords).map((record) => String(record.id)));
  return (pendingIds || []).map(String).filter((id) => remoteIds.has(id));
};
