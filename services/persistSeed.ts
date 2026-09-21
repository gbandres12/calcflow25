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
      const updatedAt = payload.updatedAt || payload.updated_at || row.updated_at;
      return {
        ...payload,
        id: String(payload.id || row.id),
        ...(updatedAt ? { updatedAt } : {})
      };
    })
    .filter(Boolean);

export const recordUpdatedAtMs = (record: any): number => {
  const raw = record?.updatedAt || record?.updated_at;
  const parsed = Date.parse(String(raw || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

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

/** Junta listas pelo id e deixa a versão com updatedAt mais recente ganhar o conflito. */
export const mergeRecordsByUpdatedAt = (baseRecords: any[], overlayRecords: any[]): any[] => {
  const merged = new Map<string, any>();
  const put = (record: any, preferIncomingOnTie: boolean) => {
    if (!record?.id) return;
    const id = String(record.id);
    const existing = merged.get(id);
    if (!existing) {
      merged.set(id, { ...record, id });
      return;
    }
    const incomingTime = recordUpdatedAtMs(record);
    const existingTime = recordUpdatedAtMs(existing);
    if (incomingTime > existingTime || (incomingTime === existingTime && preferIncomingOnTie)) {
      merged.set(id, { ...existing, ...record, id });
    }
  };
  stripSeedDocs(baseRecords).forEach((record) => put(record, false));
  stripSeedDocs(overlayRecords).forEach((record) => put(record, true));
  return Array.from(merged.values());
};

/** Mantém cadastros locais que um fetch atrasado da nuvem ainda não devolveu. */
export const keepUnseenLocalRecords = (remoteRecords: any[], localRecords: any[]): any[] =>
  mergeRecordsByUpdatedAt(remoteRecords, localRecords);

/**
 * Nuvem + cache + fila local. Nada some, a menos que esteja na fila de exclusão.
 * Edição mais nova (updatedAt / pendência) vence a cópia velha.
 */
export const reconcileVisibleRecords = (input: {
  remote: any[];
  local?: any[];
  pendingUpserts?: any[];
  pendingDeletes?: string[];
}): any[] => {
  const withLocal = mergeRecordsByUpdatedAt(input.remote, input.local || []);
  const withPending = mergeRecordsById(withLocal, input.pendingUpserts || []);
  return applyPendingDeletes(withPending, input.pendingDeletes || []);
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
