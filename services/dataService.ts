import {
  INITIAL_INVENTORY,
  INITIAL_TRANSACTIONS,
  INITIAL_CUSTOMERS,
  INITIAL_ACCOUNTS,
  INITIAL_USERS,
  INITIAL_MACHINES,
  INITIAL_STORE_ITEMS,
  INITIAL_ORDERS,
  INITIAL_FUEL_PURCHASES,
  INITIAL_FUEL_RECORDS,
  INITIAL_MAINTENANCES,
  INFLOW_CATEGORIES,
  OUTFLOW_CATEGORIES,
  DEFAULT_FISCAL_CONFIG
} from '../constants';
import { User, UserRole } from '../types';
import { getSupabase } from './supabaseClient';
import { isDemoEmail, isLocalDevHost } from './authLogic';
import {
  SEED_DOC_ID,
  hasSeedMeta,
  mapSupabaseRows,
  mergeRecordsById,
  remainingPendingAfterConfirm,
  remainingPendingDeletes,
  reconcileVisibleRecords,
  seedMetaUpsertRow,
  splitConfirmedPending,
  stripSeedDocs
} from './persistSeed';
import { pickMembershipCompanyId } from './membershipCompany';
import { decideEmptyCloudRead } from './cloudRead';

// Cache local e fila de reenvio. A fonte da verdade é o Supabase.
const storage = {
  get(key: string) {
    try {
      const val = localStorage.getItem(`calcarioflow_${key}`);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  },
  set(key: string, val: any) {
    try {
      localStorage.setItem(`calcarioflow_${key}`, JSON.stringify(val));
    } catch (e) {
      console.warn('[localStorage] Falha ao gravar cache:', key, e);
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(`calcarioflow_${key}`);
    } catch (e) {
      console.warn('[localStorage] Falha ao remover cache:', key, e);
    }
  }
};

const pendingStorageKey = (tableStorageKey: string) => `${tableStorageKey}__pending_upserts`;
const pendingDeleteStorageKey = (tableStorageKey: string) => `${tableStorageKey}__pending_deletes`;

const getPendingUpserts = (tableStorageKey: string): any[] =>
  stripSeedDocs(storage.get(pendingStorageKey(tableStorageKey)) || []);

const getPendingDeleteIds = (tableStorageKey: string): string[] =>
  (storage.get(pendingDeleteStorageKey(tableStorageKey)) || []).map((id: any) => String(id));

const queuePendingUpserts = (tableStorageKey: string, records: any[]) => {
  const pending = mergeRecordsById(getPendingUpserts(tableStorageKey), records);
  storage.set(pendingStorageKey(tableStorageKey), pending);
};

const confirmPendingUpserts = (tableStorageKey: string, sentRecords: any[]) => {
  storage.set(
    pendingStorageKey(tableStorageKey),
    remainingPendingAfterConfirm(getPendingUpserts(tableStorageKey), sentRecords)
  );
};

const removePendingUpsert = (tableStorageKey: string, id: string) => {
  const remaining = getPendingUpserts(tableStorageKey)
    .filter((record) => String(record.id) !== String(id));
  storage.set(pendingStorageKey(tableStorageKey), remaining);
};

const queuePendingDelete = (tableStorageKey: string, id: string) => {
  const next = Array.from(new Set([...getPendingDeleteIds(tableStorageKey), String(id)]));
  storage.set(pendingDeleteStorageKey(tableStorageKey), next);
};

const confirmPendingDeletes = (tableStorageKey: string, remoteRecords: any[]) => {
  storage.set(
    pendingDeleteStorageKey(tableStorageKey),
    remainingPendingDeletes(getPendingDeleteIds(tableStorageKey), remoteRecords)
  );
};

const removePendingDelete = (tableStorageKey: string, id: string) => {
  storage.set(
    pendingDeleteStorageKey(tableStorageKey),
    getPendingDeleteIds(tableStorageKey).filter((item) => item !== String(id))
  );
};

let lastPersistError: string | null = null;

const setPersistError = (message: string | null) => {
  lastPersistError = message;
};

const composeVisibleRows = (
  remoteRecords: any[],
  pendingUpserts: any[],
  pendingDeletes: string[],
  localCache: any[] = []
) => reconcileVisibleRecords({
  remote: remoteRecords,
  local: localCache,
  pendingUpserts,
  pendingDeletes
});

const DEMO_TABLE_DATA: Record<string, any[]> = {
  inventory: INITIAL_INVENTORY,
  transactions: INITIAL_TRANSACTIONS,
  customers: INITIAL_CUSTOMERS,
  financial_accounts: INITIAL_ACCOUNTS,
  machines: INITIAL_MACHINES,
  store_items: INITIAL_STORE_ITEMS,
  sales_orders: INITIAL_ORDERS,
  fuel_purchases: INITIAL_FUEL_PURCHASES,
  fuel_records: INITIAL_FUEL_RECORDS,
  maintenance_records: INITIAL_MAINTENANCES,
  users: INITIAL_USERS,
  fiscal_config: [DEFAULT_FISCAL_CONFIG],
  categories: [
    ...INFLOW_CATEGORIES.map((name, i) => ({ id: `cat-in-${i + 1}`, name, type: 'INFLOW' as const })),
    ...OUTFLOW_CATEGORIES.map((name, i) => ({ id: `cat-out-${i + 1}`, name, type: 'OUTFLOW' as const }))
  ]
};

export const ALL_TABLES = [
  'customers',
  'sales_orders',
  'transactions',
  'machines',
  'store_items',
  'maintenance_records',
  'fuel_records',
  'fuel_purchases',
  'inventory',
  'financial_accounts',
  'categories',
  'fiscal_config',
  'users',
  'transfers',
  'transportadores'
];

export const resolveCompanyKey = (companyId?: string | null): string => {
  if (!companyId || companyId === 'main' || companyId === 'demo') return 'matriz-demo';
  return companyId;
};

export const isDemoCompany = (companyId?: string | null): boolean => {
  const key = resolveCompanyKey(companyId);
  return key === 'matriz-demo' || key === 'demo';
};

export const getCleanStarterData = (tableName: string): any[] => {
  if (tableName === 'financial_accounts') {
    return [
      { id: 'acc-1', name: 'Conta Principal / Caixa Geral', type: 'banco', initialBalance: 0, bankName: 'Banco Principal', accountNumber: '0001-0' }
    ];
  }
  if (tableName === 'categories') {
    return [
      ...INFLOW_CATEGORIES.map((name, i) => ({ id: `cat-in-${i + 1}`, name, type: 'INFLOW' as const })),
      ...OUTFLOW_CATEGORIES.map((name, i) => ({ id: `cat-out-${i + 1}`, name, type: 'OUTFLOW' as const }))
    ];
  }
  if (tableName === 'fiscal_config') {
    return [DEFAULT_FISCAL_CONFIG];
  }
  if (tableName === 'inventory') {
    return [
      { id: 'moido', name: 'Calcário Agrícola Moído (Granel)', unit: 'Ton', quantity: 0, minStock: 200, unitPrice: 180 },
      { id: 'britado', name: 'Calcário Britado (Matéria-Prima)', unit: 'Ton', quantity: 0, minStock: 500, unitPrice: 90 },
      { id: 'filler', name: 'Calcário Filler Ultrafino', unit: 'Ton', quantity: 0, minStock: 50, unitPrice: 240 }
    ];
  }
  return [];
};

const getStorageKey = (tableName: string, companyId?: string) => {
  return `${tableName}_${resolveCompanyKey(companyId)}`;
};

const createSupabaseRows = (tableName: string, companyId: string, records: any[]) =>
  records.map((record) => ({
    id: String(record.id),
    table_name: tableName,
    company_id: companyId,
    data: record,
    updated_at: new Date().toISOString()
  }));

export const waitForAuthUser = async (timeoutMs = 2500): Promise<boolean> => {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const first = await supabase.auth.getSession();
    if (first.data.session?.user) return true;
  } catch {
    return false;
  }

  return await new Promise((resolve) => {
    let settled = false;
    let subscription: { unsubscribe: () => void } | null = null;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      try { subscription?.unsubscribe(); } catch {}
      resolve(value);
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) finish(true);
    });
    subscription = data.subscription;
    setTimeout(() => finish(false), timeoutMs);
  });
};

const persistPendingUpserts = async (
  tableName: string,
  companyId: string,
  records: any[]
) => {
  const supabase = getSupabase();
  if (!supabase || records.length === 0) return;
  const operational = stripSeedDocs(records);
  if (operational.length === 0) return;

  try {
    await waitForAuthUser(1500);
  } catch {}

  const { error } = await supabase
    .from('app_records')
    .upsert(createSupabaseRows(tableName, companyId, operational), {
      onConflict: 'table_name,company_id,id'
    });

  if (error) {
    setPersistError(`Falha ao gravar ${tableName} no Supabase: ${error.message}`);
    throw new Error(error.message);
  }
  setPersistError(null);
};

const persistPendingDeletes = async (
  tableName: string,
  companyId: string,
  ids: string[]
) => {
  const supabase = getSupabase();
  if (!supabase || ids.length === 0) return;

  try {
    await waitForAuthUser(1500);
  } catch {}

  for (const id of ids) {
    const { error } = await supabase
      .from('app_records')
      .delete()
      .eq('table_name', tableName)
      .eq('company_id', companyId)
      .eq('id', String(id));
    if (error) {
      setPersistError(`Falha ao excluir ${tableName} no Supabase: ${error.message}`);
      throw new Error(error.message);
    }
  }
};

const writeSeedMeta = async (tableName: string, companyId: string) => {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase
    .from('app_records')
    .upsert([seedMetaUpsertRow(tableName, companyId)], {
      onConflict: 'table_name,company_id,id'
    });
  if (error) {
    console.warn(`[Supabase] Não foi possível marcar '${tableName}' como inicializada:`, error.message);
  }
};

const snapshotPending = (storageKey: string) => ({
  upserts: getPendingUpserts(storageKey),
  deletes: getPendingDeleteIds(storageKey)
});

const retryUnconfirmed = (
  tableName: string,
  companyId: string,
  storageKey: string,
  remoteRecords: any[],
  pendingUpserts: any[],
  pendingDeletes: string[]
) => {
  const { confirmed, unconfirmed } = splitConfirmedPending(pendingUpserts, remoteRecords);
  if (confirmed.length) confirmPendingUpserts(storageKey, confirmed);
  const leftoverDeletes = remainingPendingDeletes(pendingDeletes, remoteRecords);
  pendingDeletes.filter((id) => !leftoverDeletes.includes(id)).forEach((id) => removePendingDelete(storageKey, id));
  if (unconfirmed.length) {
    persistPendingUpserts(tableName, companyId, unconfirmed).catch((err) => {
      console.warn(`[Supabase] Reenvio pendente de '${tableName}' falhou:`, err);
    });
  }
  if (leftoverDeletes.length) {
    persistPendingDeletes(tableName, companyId, leftoverDeletes).then(() => {
      leftoverDeletes.forEach((id) => removePendingDelete(storageKey, id));
    }).catch((err) => {
      console.warn(`[Supabase] Reenvio de exclusão pendente em '${tableName}' falhou:`, err);
    });
  }
};

const membershipCompanyFromRpc = (payload: any): string | null => {
  if (!payload) return null;
  const row = Array.isArray(payload) ? payload[0] : payload;
  const companyId = row?.company_id || row?.companyId;
  return companyId ? String(companyId) : null;
};

const parsePendingStorageKey = (fullKey: string): { tableName: string; companyId: string } | null => {
  if (!fullKey.startsWith('calcarioflow_') || !fullKey.includes('__pending_')) return null;
  const inner = fullKey.replace(/^calcarioflow_/, '').replace(/__pending_(upserts|deletes)$/, '');
  const tableName = ALL_TABLES.find((name) => inner === name || inner.startsWith(`${name}_`));
  if (!tableName) return null;
  const companyId = inner.slice(tableName.length + 1);
  if (!companyId) return null;
  return { tableName, companyId };
};

const countAllBrowserPending = (): number => {
  if (typeof localStorage === 'undefined') return 0;
  let total = 0;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i) || '';
    if (!key.startsWith('calcarioflow_') || !key.includes('__pending_')) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      total += Array.isArray(value) ? value.length : 0;
    } catch {
      /* ignore */
    }
  }
  return total;
};

export const resolveMembershipCompanyId = async (
  userId: string,
  fallback: string
): Promise<string> => {
  const supabase = getSupabase();
  if (!supabase || !userId) return fallback;
  try {
    const { data, error } = await supabase
      .from('company_memberships')
      .select('company_id, created_at, role')
      .eq('user_id', userId);
    if (!error && Array.isArray(data) && data.length > 0) {
      const picked = pickMembershipCompanyId(data, fallback);
      if (picked) return picked;
    }
  } catch (err) {
    console.warn('[Supabase] Falha ao ler company_memberships:', err);
  }
  try {
    const { data, error } = await supabase.rpc('ensure_own_company_membership');
    const ensured = membershipCompanyFromRpc(data);
    if (!error && ensured) return ensured;
    if (error) console.warn('[Supabase] ensure_own_company_membership:', error.message);
  } catch (err) {
    console.warn('[Supabase] RPC ensure_own_company_membership indisponível:', err);
  }
  return fallback;
};

// ========================================================
// REPOSITÓRIO UNIFICADO: SUPABASE É A FONTE DA VERDADE
// localStorage só guarda cache e fila de reenvio
// ========================================================

export const db = {
  getSyncState(companyId?: string) {
    const compKey = resolveCompanyKey(companyId);
    let pendingCount = 0;
    ALL_TABLES.forEach((tableName) => {
      const storageKey = getStorageKey(tableName, compKey);
      pendingCount += getPendingUpserts(storageKey).length + getPendingDeleteIds(storageKey).length;
    });
    return {
      pendingCount: Math.max(pendingCount, countAllBrowserPending()),
      lastError: lastPersistError,
      cloudEnabled: Boolean(getSupabase())
    };
  },

  async flushPending(companyId?: string) {
    const compKey = resolveCompanyKey(companyId);
    for (const tableName of ALL_TABLES) {
      const storageKey = getStorageKey(tableName, compKey);
      const pendingUpserts = getPendingUpserts(storageKey);
      const pendingDeletes = getPendingDeleteIds(storageKey);
      if (pendingUpserts.length) {
        await persistPendingUpserts(tableName, compKey, pendingUpserts);
        confirmPendingUpserts(storageKey, pendingUpserts);
      }
      if (pendingDeletes.length) {
        await persistPendingDeletes(tableName, compKey, pendingDeletes);
        pendingDeletes.forEach((id) => removePendingDelete(storageKey, id));
      }
    }
  },

  async flushAllPending() {
    if (typeof localStorage === 'undefined') return;
    const seen = new Set<string>();
    for (let i = 0; i < localStorage.length; i += 1) {
      const fullKey = localStorage.key(i) || '';
      const parsed = parsePendingStorageKey(fullKey);
      if (!parsed) continue;
      const stamp = `${parsed.tableName}::${parsed.companyId}`;
      if (seen.has(stamp)) continue;
      seen.add(stamp);
      await this.flushPending(parsed.companyId);
    }
  },

  async getTable(tableName: string, companyId?: string): Promise<any[]> {
    const compKey = resolveCompanyKey(companyId);
    const storageKey = getStorageKey(tableName, compKey);
    const demo = isDemoCompany(compKey);
    const pendingAtReadStart = snapshotPending(storageKey);

    const supabase = getSupabase();
    if (supabase) {
      try {
        let hasAuthUser = demo;
        if (!demo) {
          hasAuthUser = await waitForAuthUser(2500);
        }

        const readRemote = () =>
          supabase
            .from('app_records')
            .select('id, data, updated_at')
            .eq('table_name', tableName)
            .eq('company_id', compKey);

        let { data, error } = await readRemote();
        if (!demo && hasAuthUser && !error && Array.isArray(data) && data.length === 0) {
          const retry = await readRemote();
          if (!retry.error && Array.isArray(retry.data)) {
            data = retry.data;
            error = retry.error;
          }
        }

        if (!error && Array.isArray(data)) {
          const decision = decideEmptyCloudRead({
            isDemo: demo,
            hasAuthUser,
            remoteRowCount: data.length
          });

          if (decision === 'keep-local-unauthenticated') {
            console.warn(`[Supabase] Sem sessão ao ler '${tableName}' (${compKey}). Não trato como pasta vazia.`);
            const localOnly = stripSeedDocs(storage.get(storageKey) || []);
            return composeVisibleRows(
              localOnly,
              pendingAtReadStart.upserts,
              pendingAtReadStart.deletes,
              localOnly
            );
          }

          const records = mapSupabaseRows(data);
          const initialized = hasSeedMeta(records) || data.length > 0;
          const cleanRecords = stripSeedDocs(records);
          const latestVisible = () => {
            const pendingUpserts = mergeRecordsById(pendingAtReadStart.upserts, getPendingUpserts(storageKey));
            const pendingDeletes = Array.from(new Set([
              ...pendingAtReadStart.deletes,
              ...getPendingDeleteIds(storageKey)
            ]));
            return {
              pendingUpserts,
              pendingDeletes,
              rows: composeVisibleRows(
                cleanRecords,
                pendingUpserts,
                pendingDeletes,
                stripSeedDocs(storage.get(storageKey) || [])
              )
            };
          };
          // Lê o cache de novo depois do fetch: um save no meio da espera não pode ser apagado.
          const visible = latestVisible();
          const safeRecords = visible.rows;

          if (initialized || cleanRecords.length > 0 || safeRecords.length > 0) {
            storage.set(storageKey, safeRecords);
            if (!hasSeedMeta(records)) writeSeedMeta(tableName, compKey);
            retryUnconfirmed(tableName, compKey, storageKey, cleanRecords, visible.pendingUpserts, visible.pendingDeletes);
            const remoteIds = new Set(cleanRecords.map((row) => String(row.id)));
            const pendingIds = new Set(visible.pendingUpserts.map((row) => String(row.id)));
            const missingRemote = safeRecords.filter((row) =>
              row?.id && !remoteIds.has(String(row.id)) && !pendingIds.has(String(row.id))
            );
            if (hasAuthUser && missingRemote.length) {
              this.upsert(tableName, compKey, missingRemote).catch((e) =>
                console.warn('[Supabase] Reenvio do cache local para a nuvem falhou:', e)
              );
            }
            return safeRecords;
          }

          if (decision === 'empty-authenticated') {
            console.warn(`[Supabase] Tabela '${tableName}' vazia na nuvem para a empresa '${compKey}'. Preservando estado local.`);
            const localData = storage.get(storageKey) || [];
            return stripSeedDocs(localData);
          }

          const initialData = DEMO_TABLE_DATA[tableName] || [];
          storage.set(storageKey, initialData);
          if (initialData.length > 0) {
            this.upsert(tableName, compKey, initialData).catch((e) =>
              console.warn('[Supabase] Seed initial data warning:', e)
            );
          }
          writeSeedMeta(tableName, compKey);
          return initialData;
        } else if (error) {
          console.warn(`[Supabase] Consulta '${tableName}' retornou aviso (código ${error.code}):`, error.message);
          setPersistError(`Falha ao ler ${tableName} no Supabase: ${error.message}`);
        }
      } catch (err) {
        console.warn(`[Supabase] Falha ao consultar '${tableName}':`, err);
      }
    }

    const pendingUpserts = mergeRecordsById(pendingAtReadStart.upserts, getPendingUpserts(storageKey));
    const pendingDeletes = Array.from(new Set([
      ...pendingAtReadStart.deletes,
      ...getPendingDeleteIds(storageKey)
    ]));
    let localData = storage.get(storageKey);
    if (!localData || !Array.isArray(localData)) {
      localData = demo ? (DEMO_TABLE_DATA[tableName] || []) : getCleanStarterData(tableName);
      storage.set(storageKey, localData);
    }
    return composeVisibleRows(localData || [], pendingUpserts, pendingDeletes, localData || []);
  },

  async upsert(tableName: string, companyId: string, record: any): Promise<any[]> {
    const compKey = resolveCompanyKey(companyId);
    const storageKey = getStorageKey(tableName, compKey);
    const records = (Array.isArray(record) ? record : [record]).filter(Boolean);

    if (records.length === 0) {
      return stripSeedDocs(storage.get(storageKey) || []);
    }

    const current = stripSeedDocs(storage.get(storageKey) || []);
    const normalizedRecords = records.map((newRec) => {
      if (newRec?.id === SEED_DOC_ID || newRec?.__isSeedMeta) return newRec;
      const safeRecord = tableName === 'users'
        ? Object.fromEntries(Object.entries(newRec).filter(([key]) => key !== 'passwordHash'))
        : newRec;
      return {
        ...safeRecord,
        id: String(safeRecord.id || `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`),
        companyId: safeRecord.companyId || compKey,
        updatedAt: new Date().toISOString()
      };
    });
    const operational = stripSeedDocs(normalizedRecords);
    const updated = mergeRecordsById(current, operational);
    storage.set(storageKey, updated);

    const supabase = getSupabase();
    if (!supabase) {
      if (!isDemoCompany(compKey)) {
        const err = new Error('Supabase não está configurado. Cliente e venda não foram gravados no banco.');
        setPersistError(err.message);
        throw err;
      }
      return updated;
    }

    queuePendingUpserts(storageKey, operational);
    try {
      await persistPendingUpserts(tableName, compKey, operational);
      confirmPendingUpserts(storageKey, operational);
      return updated;
    } catch (err) {
      console.warn(`[Supabase] Falha de comunicação ao gravar '${tableName}':`, err);
      throw err;
    }
  },

  async delete(tableName: string, companyId: string, id: string): Promise<void> {
    const compKey = resolveCompanyKey(companyId);
    const storageKey = getStorageKey(tableName, compKey);
    const current = storage.get(storageKey) || [];
    storage.set(storageKey, current.filter((r: any) => r.id !== id));
    removePendingUpsert(storageKey, id);
    queuePendingDelete(storageKey, id);

    const supabase = getSupabase();
    if (!supabase) {
      if (!isDemoCompany(compKey)) {
        const err = new Error('Supabase não está configurado. A exclusão não foi gravada no banco.');
        setPersistError(err.message);
        throw err;
      }
      removePendingDelete(storageKey, id);
      return;
    }

    try {
      await persistPendingDeletes(tableName, compKey, [String(id)]);
      removePendingDelete(storageKey, id);
    } catch (err) {
      console.warn(`[Supabase] Falha ao deletar em '${tableName}':`, err);
      throw err;
    }
  },

  async resetCompanyToClean(companyId: string) {
    const compKey = resolveCompanyKey(companyId);
    if (!isDemoCompany(compKey)) {
      throw new Error('Reset de base bloqueado em produção.');
    }

    for (const t of ALL_TABLES.filter((name) => name !== 'users')) {
      const cleanData = getCleanStarterData(t);
      const storageKey = getStorageKey(t, compKey);
      storage.set(storageKey, cleanData);
      storage.remove(pendingStorageKey(storageKey));
      storage.remove(pendingDeleteStorageKey(storageKey));

      const supabase = getSupabase();
      if (supabase) {
        try {
          await supabase
            .from('app_records')
            .delete()
            .eq('table_name', t)
            .eq('company_id', compKey);

          if (cleanData.length > 0) {
            await this.upsert(t, compKey, cleanData);
          }
          await writeSeedMeta(t, compKey);
        } catch (e) {
          console.warn(`[Supabase] Erro ao resetar tabela ${t}:`, e);
        }
      }
    }
  },

  async loadDemoDataForCompany(companyId: string) {
    const compKey = resolveCompanyKey(companyId);
    if (!isDemoCompany(compKey)) {
      throw new Error('Carga de dados demo bloqueada em produção.');
    }

    for (const [table, data] of Object.entries(DEMO_TABLE_DATA)) {
      const storageKey = getStorageKey(table, compKey);
      storage.set(storageKey, data);
      storage.remove(pendingDeleteStorageKey(storageKey));
      await this.upsert(table, compKey, data).catch((e) =>
        console.warn(`[Supabase] Erro ao carregar demo em ${table}:`, e)
      );
      await writeSeedMeta(table, compKey);
    }
  }
};

// ========================================================
// ========================================================
// SERVIÇO DE AUTENTICAÇÃO E USUÁRIOS (SUPABASE AUTH NATIVO)
// ========================================================

export const userService = {
  async inviteUser(userData: Omit<User, 'id'> & { password: string }): Promise<User> {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase não está configurado para criar acessos.');
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new Error('Entre novamente para convidar um usuário.');
    }

    const response = await fetch('/api/users/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(userData)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.user) {
      throw new Error(payload?.error || 'Não foi possível criar o acesso do colaborador.');
    }
    return payload.user as User;
  },

  /**
   * Autentica usuário via Supabase Auth (com fallback para base demo se offline)
   */
  async authenticate(email: string, pass: string): Promise<User> {
    const cleanEmail = email.trim().toLowerCase();
    const supabase = getSupabase();

    // 1. Tentar login oficial via Supabase Auth (Opção B)
    if (supabase) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: pass
        });

        if (!authError && authData?.user) {
          const authUser = authData.user;
          const meta = authUser.user_metadata || {};
          const fallbackCompanyId = meta.companyId || (cleanEmail.endsWith('@calcarioflow.com.br') ? 'matriz-demo' : `comp-${authUser.id}`);
          const userCompanyId = await resolveMembershipCompanyId(authUser.id, fallbackCompanyId);

          // Buscar perfil já salvo nas tabelas ou compor a partir dos metadados do Supabase Auth
          let profile: User | undefined;
          try {
            const users = await db.getTable('users', userCompanyId);
            profile = users.find((u) => u.email.toLowerCase() === cleanEmail || u.id === authUser.id);
          } catch {}

          if (!profile) {
            try {
              const demoUsers = await db.getTable('users', 'matriz-demo');
              profile = demoUsers.find((u) => u.email.toLowerCase() === cleanEmail || u.id === authUser.id);
            } catch {}
          }

          if (!profile) {
            profile = {
              id: authUser.id,
              name: meta.name || authUser.email?.split('@')[0] || 'Usuário',
              email: cleanEmail,
              role: (meta.role as UserRole) || UserRole.ADMIN,
              status: 'Ativo',
              companyId: userCompanyId,
              companyName: meta.companyName || 'Mineração & Moagem de Calcário',
              cnpj: meta.cnpj || '',
              phone: meta.phone || '',
              jobTitle: meta.jobTitle || 'Diretor / Gestor Geral',
              onboardingCompleted: meta.onboardingCompleted ?? false,
              onboardingStep: meta.onboardingStep || 1,
              createdAt: authUser.created_at || new Date().toISOString(),
              lastAccess: new Date().toISOString(),
              plan: 'PRO'
            };
            await this.saveUser(profile);
          } else {
            profile = {
              ...profile,
              companyId: userCompanyId,
              lastAccess: new Date().toISOString()
            };
            await this.saveUser(profile);
          }

          return { ...profile, companyId: userCompanyId };
        }

        // Se o Supabase Auth retornou erro
        if (authError) {
          // Permite que as contas padrão de demonstração sejam acessadas mesmo sem pré-registro no Auth
          const isDemoAccount = INITIAL_USERS.some(u => u.email.toLowerCase() === cleanEmail) || cleanEmail === 'admin@calcarioflow.com.br';
          if (isLocalDevHost() && isDemoAccount && pass === '123456') {
            console.info('[Supabase Auth] Usando perfil de demonstração local.');
            const demoMatch = INITIAL_USERS.find(u => u.email.toLowerCase() === cleanEmail) || INITIAL_USERS[0];
            return { ...demoMatch, companyId: 'matriz-demo', lastAccess: new Date().toISOString() };
          }

          // Mensagens amigáveis para o usuário
          if (authError.message.includes('Invalid login credentials')) {
            throw new Error('E-mail ou senha incorretos. Verifique suas credenciais.');
          }
          if (authError.message.includes('Email not confirmed')) {
            throw new Error('E-mail ainda não confirmado no Supabase. Verifique sua caixa de entrada ou desative "Confirm email" no painel do Supabase Auth.');
          }
          throw new Error(authError.message);
        }
      } catch (err: any) {
        if (err.message && (err.message.includes('E-mail') || err.message.includes('incorretos') || err.message.includes('confirmado'))) {
          throw err;
        }
        console.warn('[Supabase Auth] Tentando fallback para verificação de tabela:', err);
      }
    }

    // 2. Fallback de contingência (caso Supabase esteja offline ou sem rede temporária)
    let users: User[] = [];
    try {
      users = await db.getTable('users', 'matriz-demo');
    } catch {
      users = INITIAL_USERS;
    }

    const matchedUser = users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (matchedUser && isDemoEmail(cleanEmail)) {
      if (isLocalDevHost() && pass === '123456') {
        const withCompany: User = {
          ...matchedUser,
          companyId: matchedUser.companyId || (cleanEmail.endsWith('@calcarioflow.com.br') ? 'matriz-demo' : `comp-${matchedUser.id}`),
          lastAccess: new Date().toISOString()
        };
        await this.saveUser(withCompany);
        return withCompany;
      }
      throw new Error('E-mail ou senha incorretos. Verifique suas credenciais.');
    }

    if (isLocalDevHost() && (cleanEmail === 'admin@calcarioflow.com.br' || cleanEmail === 'admin') && pass === '123456') {
      return { ...INITIAL_USERS[0], companyId: 'matriz-demo' };
    }

    throw new Error("Usuário não encontrado. Cadastre-se na aba 'Criar Nova Conta' para começar.");
  },

  /**
   * Registra uma nova empresa e usuário no Supabase Auth e no Banco de Dados
   */
  async registerUser(userData: {
    name: string;
    email: string;
    password?: string;
    companyName: string;
    cnpj?: string;
    phone?: string;
    jobTitle?: string;
    role?: UserRole;
  }): Promise<{ user: User; requiresEmailConfirmation?: boolean }> {
    const cleanEmail = userData.email.trim().toLowerCase();
    const password = (userData.password || '').trim();
    if (password.length < 6) {
      throw new Error('A senha deve ter no mínimo 6 caracteres.');
    }
    const supabase = getSupabase();

    let authUserId = `usr-${Date.now()}`;
    let requiresEmailConfirmation = false;
    let compId = `comp-${Date.now()}`;

    // 1. Cadastrar no Supabase Auth nativo
    if (supabase) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: cleanEmail,
          password: password,
          options: {
            data: {
              name: userData.name.trim(),
              companyName: userData.companyName.trim(),
              companyId: compId,
              cnpj: userData.cnpj?.trim() || '',
              phone: userData.phone?.trim() || '',
              jobTitle: userData.jobTitle?.trim() || 'Diretor / Gestor Geral',
              role: userData.role || UserRole.ADMIN,
            }
          }
        });

        if (authError) {
          if (authError.message.includes('User already registered') || authError.message.includes('already exists')) {
            throw new Error('Este e-mail já está cadastrado no sistema. Faça login com sua senha.');
          }
          if (authError.message.includes('Password should be at least')) {
            throw new Error('A senha deve ter no mínimo 6 caracteres.');
          }
          throw new Error(`Erro no Supabase Auth: ${authError.message}`);
        }

        if (authData?.user) {
          authUserId = authData.user.id;
          if (authData.session) {
            compId = await resolveMembershipCompanyId(authData.user.id, compId);
          } else {
            requiresEmailConfirmation = true;
          }
        }
      } catch (err: any) {
        throw new Error(err?.message || 'Não foi possível criar a conta no Supabase Auth.');
      }
    }

    // 2. Construir objeto do usuário
    const newUser: User = {
      id: authUserId,
      name: userData.name.trim(),
      email: cleanEmail,
      role: userData.role || UserRole.ADMIN,
      status: 'Ativo',
      companyId: compId,
      companyName: userData.companyName.trim(),
      cnpj: userData.cnpj?.trim() || '',
      phone: userData.phone?.trim() || '',
      jobTitle: userData.jobTitle?.trim() || 'Diretor / Gestor Geral',
      onboardingCompleted: false,
      onboardingStep: 1,
      createdAt: new Date().toISOString(),
      lastAccess: new Date().toISOString(),
      plan: 'PRO'
    };

    // 3. Salvar o perfil apenas na empresa do usuário, sem diretório central público.
    await db.upsert('users', compId, newUser);

    // 4. Inicializar dados básicos (contas bancárias e categorias) para a nova empresa
    const initialAccounts = getCleanStarterData('financial_accounts');
    const initialCategories = getCleanStarterData('categories');
    const initialInventory = getCleanStarterData('inventory');

    await Promise.all([
      db.upsert('financial_accounts', compId, initialAccounts),
      db.upsert('categories', compId, initialCategories),
      db.upsert('inventory', compId, initialInventory)
    ]).catch((e) => console.warn('[Supabase/Storage] Erro ao semear empresa nova:', e));

    return { user: newUser, requiresEmailConfirmation };
  },

  /**
   * Envia e-mail de recuperação de senha oficial via Supabase Auth
   */
  async resetPassword(email: string): Promise<{ success: boolean; message: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase não conectado. Configure as variáveis de ambiente.');
    }

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: window.location.origin
    });

    if (error) {
      throw new Error(`Falha ao solicitar recuperação: ${error.message}`);
    }

    return {
      success: true,
      message: `Link de redefinição de senha enviado com sucesso para ${cleanEmail}. Verifique sua caixa de entrada!`
    };
  },

  /**
   * Encerra a sessão ativa do usuário no Supabase Auth e localmente
   */
  async logout(): Promise<void> {
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('[Supabase Auth] Erro no signOut:', e);
      }
    }
    try {
      localStorage.removeItem('calcarioflow_active_session_user');
    } catch {}
  },

  /**
   * Resgata o usuário da sessão ativa do Supabase Auth (se existir)
   */
  async getCurrentSessionUser(): Promise<User | null> {
    const supabase = getSupabase();
    if (!supabase) return null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const email = session.user.email?.toLowerCase();
        if (!email) return null;
        const meta = session.user.user_metadata || {};
        const fallbackCompanyId = meta.companyId || (email.endsWith('@calcarioflow.com.br') ? 'matriz-demo' : `comp-${session.user.id}`);
        const compId = await resolveMembershipCompanyId(session.user.id, fallbackCompanyId);

        let profile: User | undefined;
        try {
          const users = await db.getTable('users', compId);
          profile = users.find(u => u.email.toLowerCase() === email || u.id === session.user.id);
        } catch {}

        if (profile) return { ...profile, companyId: compId };

        return {
          id: session.user.id,
          name: meta.name || email.split('@')[0] || 'Usuário',
          email: email,
          role: (meta.role as UserRole) || UserRole.ADMIN,
          status: 'Ativo',
          companyId: compId,
          companyName: meta.companyName || 'Mineração / Usina',
          cnpj: meta.cnpj || '',
          phone: meta.phone || '',
          jobTitle: meta.jobTitle || 'Diretor / Gestor Geral',
          onboardingCompleted: meta.onboardingCompleted ?? false,
          onboardingStep: meta.onboardingStep || 1,
          createdAt: session.user.created_at || new Date().toISOString(),
          lastAccess: new Date().toISOString(),
          plan: 'PRO'
        };
      }
    } catch (e) {
      console.warn('[Supabase Auth] Erro ao obter sessão ativa:', e);
    }
    return null;
  },

  /**
  * Conclui o assistente de onboarding
  */
  async completeOnboarding(userId: string, data?: Partial<User>): Promise<User> {
    const companyId = resolveCompanyKey(data?.companyId);
    const users: User[] = await db.getTable('users', companyId);
    let user = users.find((u) => u.id === userId);

    if (user) {
      user = {
        ...user,
        onboardingCompleted: true,
        onboardingStep: 5,
        ...data
      };
      await db.upsert('users', user.companyId || companyId, user);
      return user;
    }

    const newUser: User = {
      id: userId,
      name: 'Usuário',
      email: '',
      role: UserRole.ADMIN,
      status: 'Ativo',
      onboardingCompleted: true,
      onboardingStep: 5,
      ...(data || {})
    };
    await db.upsert('users', newUser.companyId || companyId, newUser);
    return newUser;
  },

  async getAll(companyId?: string): Promise<User[]> {
    const supabase = getSupabase();
    if (supabase && typeof window !== 'undefined') {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (accessToken) {
          const response = await fetch('/api/users/list', {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          const payload = await response.json().catch(() => ({}));
          if (response.ok && Array.isArray(payload?.users)) {
            return payload.users as User[];
          }
        }
      } catch (err) {
        console.warn('[USUÁRIOS] Falha ao listar equipe no servidor, usando pasta local:', err);
      }
    }
    return await db.getTable('users', resolveCompanyKey(companyId));
  },

  async saveUser(user: User & { newPassword?: string }) {
    const { newPassword, ...userWithoutPassword } = user as any;
    await db.upsert('users', resolveCompanyKey(user.companyId), userWithoutPassword);

    // If a newPassword was set, call the invite API (which uses Admin SDK) to reset it
    if (newPassword && newPassword.length >= 6) {
      const supabase = getSupabase();
      if (supabase && typeof window !== 'undefined') {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData?.session?.access_token;
          if (accessToken) {
            fetch('/api/users/invite', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`
              },
              body: JSON.stringify({ ...userWithoutPassword, password: newPassword })
            }).catch((err) => console.warn('[USUÁRIOS] Falha ao redefinir senha:', err));
          }
        } catch (err) {
          console.warn('[USUÁRIOS] Erro ao redefinir senha:', err);
        }
      }
    }

    return user;
  },

  async deleteUser(id: string, companyId?: string) {
    const key = resolveCompanyKey(companyId);
    const supabase = getSupabase();
    const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      if (isDemoCompany(key)) return db.delete('users', key, id);
      throw new Error('Entre novamente para remover um acesso.');
    }

    const response = await fetch('/api/users/invite', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ userId: id })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Não foi possível remover o acesso.');
    }
  },

  async sync(users: any[], companyId?: string) {
    return await db.upsert('users', companyId || 'matriz-demo', users);
  }
};

export const financeService = {
  async getTransactions(companyId?: string) {
    return await db.getTable('transactions', companyId);
  },
  async saveTransactions(companyId: string, txs: any[]) {
    return await db.upsert('transactions', companyId, txs);
  }
};

export const inventoryService = {
  async getInventory(companyId?: string) {
    return await db.getTable('inventory', companyId);
  },
  async updateStock(companyId: string, id: string, quantity: number) {
    const current = await this.getInventory(companyId);
    const item = current.find((i: any) => i.id === id);
    if (item) await db.upsert('inventory', companyId, { ...item, quantity });
  }
};

export const orderService = {
  async getOrders(companyId?: string) {
    return await db.getTable('sales_orders', companyId);
  },
  async saveOrders(companyId: string, orders: any[]) {
    return await db.upsert('sales_orders', companyId, orders);
  }
};
