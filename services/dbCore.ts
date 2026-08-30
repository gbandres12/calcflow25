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
import { getSupabase } from './supabaseClient';
import { firestoreDb } from './firebase';
import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { SEED_DOC_ID, stripSeedDocs, hasSeedMeta, seedMetaRecord, mapSupabaseRows, seedMetaUpsertRow } from './persistSeed';

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
  }
};

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
  'users'
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

export const db = {
  async getTable(tableName: string, companyId?: string): Promise<any[]> {
    const compKey = resolveCompanyKey(companyId);
    const storageKey = getStorageKey(tableName, compKey);
    const demo = isDemoCompany(compKey);

    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('app_records')
          .select('id, data')
          .eq('table_name', tableName)
          .eq('company_id', compKey);

        if (!error && Array.isArray(data)) {
          const records = mapSupabaseRows(data);
          const initialized = hasSeedMeta(records) || data.length > 0;
          const cleanRecords = stripSeedDocs(records);

          if (cleanRecords.length > 0) {
            storage.set(storageKey, cleanRecords);
            return cleanRecords;
          }

          if (initialized) {
            storage.set(storageKey, []);
            return [];
          }

          const localCache = stripSeedDocs(storage.get(storageKey) || []);
          if (localCache.length > 0) {
            this.upsert(tableName, compKey, localCache).catch((e) =>
              console.warn('[Supabase] Sync local cache to cloud warning:', e)
            );
            return localCache;
          }

          const initialData = demo ? (DEMO_TABLE_DATA[tableName] || []) : getCleanStarterData(tableName);
          this.upsert(tableName, compKey, [...initialData, seedMetaRecord(tableName, compKey)]).catch((e) =>
            console.warn('[Supabase] Seed initial data warning:', e)
          );
          storage.set(storageKey, initialData);
          return initialData;
        } else if (error) {
          console.warn(`[Supabase] Consulta '${tableName}' retornou aviso (código ${error.code}):`, error.message);
        }
      } catch (err) {
        console.warn(`[Supabase] Falha ao consultar '${tableName}':`, err);
      }
    }

    if (firestoreDb) {
      try {
        const colName = `${tableName}_${compKey}`;
        const snapshot = await getDocs(collection(firestoreDb, colName));
        const remoteData: any[] = [];
        snapshot.forEach((docSnap) => {
          if (docSnap.id !== SEED_DOC_ID && !docSnap.data()?.__isSeedMeta) {
            remoteData.push({ id: docSnap.id, ...docSnap.data() });
          }
        });
        if (remoteData.length > 0) {
          storage.set(storageKey, remoteData);
          return remoteData;
        }
      } catch (e) {
        console.warn(`[Firestore] Falha ao consultar '${tableName}':`, e);
      }
    }

    let localData = storage.get(storageKey);
    if (!localData || !Array.isArray(localData)) {
      localData = demo ? (DEMO_TABLE_DATA[tableName] || []) : getCleanStarterData(tableName);
      storage.set(storageKey, localData);
    }
    return stripSeedDocs(localData || []);
  },

  async upsert(tableName: string, companyId: string, record: any): Promise<any[]> {
    const compKey = resolveCompanyKey(companyId);
    const storageKey = getStorageKey(tableName, compKey);
    const records = (Array.isArray(record) ? record : [record]).filter(Boolean);
    if (records.length === 0) {
      return stripSeedDocs(storage.get(storageKey) || []);
    }

    const current = stripSeedDocs(storage.get(storageKey) || []);
    const updated = [...current];
    records.forEach((newRec) => {
      if (!newRec || newRec.id === SEED_DOC_ID || newRec.__isSeedMeta) return;
      const tagged = {
        ...newRec,
        id: String(newRec.id || `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`),
        companyId: newRec.companyId || compKey
      };
      const idx = updated.findIndex((r) => r.id === tagged.id);
      if (idx >= 0) updated[idx] = { ...updated[idx], ...tagged };
      else updated.push(tagged);
    });
    storage.set(storageKey, stripSeedDocs(updated));

    const supabase = getSupabase();
    if (supabase) {
      try {
        const rowsToUpsert = records.map((item) => {
          const docId = String(item.id || `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
          const tagged = { ...item, id: docId, companyId: item.companyId || compKey };
          return {
            id: docId,
            table_name: tableName,
            company_id: compKey,
            data: tagged,
            updated_at: new Date().toISOString()
          };
        });
        rowsToUpsert.push(seedMetaUpsertRow(tableName, compKey));
        const { error } = await supabase
          .from('app_records')
          .upsert(rowsToUpsert, { onConflict: 'table_name,company_id,id' });
        if (error) console.warn(`[Supabase] Erro ao gravar '${tableName}':`, error.message);
      } catch (err) {
        console.warn(`[Supabase] Falha de comunicação ao gravar '${tableName}':`, err);
      }
    }

    if (firestoreDb) {
      try {
        const colName = `${tableName}_${compKey}`;
        for (const item of records) {
          const docId = String(item.id || `doc-${Date.now()}`);
          const tagged = { ...item, id: docId, companyId: item.companyId || compKey };
          await setDoc(doc(firestoreDb, colName, docId), tagged, { merge: true });
        }
      } catch (e) {
        console.warn(`[Firestore] Erro ao gravar '${tableName}':`, e);
      }
    }
    return updated;
  },

  async delete(tableName: string, companyId: string, id: string): Promise<void> {
    const compKey = resolveCompanyKey(companyId);
    const storageKey = getStorageKey(tableName, compKey);
    const current = storage.get(storageKey) || [];
    storage.set(storageKey, current.filter((r: any) => r.id !== id));

    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase
          .from('app_records')
          .delete()
          .eq('table_name', tableName)
          .eq('company_id', compKey)
          .eq('id', String(id));
        if (error) console.warn(`[Supabase] Erro ao deletar em '${tableName}':`, error.message);
      } catch (err) {
        console.warn(`[Supabase] Falha ao deletar em '${tableName}':`, err);
      }
    }

    if (firestoreDb) {
      try {
        await deleteDoc(doc(firestoreDb, `${tableName}_${compKey}`, id));
      } catch (e) {
        console.warn(`[Firestore] Erro ao deletar em '${tableName}':`, e);
      }
    }
  },

  async resetCompanyToClean(companyId: string) {
    const compKey = resolveCompanyKey(companyId);
    if (!isDemoCompany(compKey)) throw new Error('Reset de base bloqueado em produção.');
    for (const t of ALL_TABLES.filter((name) => name !== 'users')) {
      const cleanData = getCleanStarterData(t);
      storage.set(getStorageKey(t, compKey), cleanData);
      const supabase = getSupabase();
      if (supabase) {
        try {
          await supabase.from('app_records').delete().eq('table_name', t).eq('company_id', compKey);
          if (cleanData.length > 0) await this.upsert(t, compKey, cleanData);
        } catch (e) {
          console.warn(`[Supabase] Erro ao resetar tabela ${t}:`, e);
        }
      }
    }
  },

  async loadDemoDataForCompany(companyId: string) {
    const compKey = resolveCompanyKey(companyId);
    if (!isDemoCompany(compKey)) throw new Error('Carga de dados demo bloqueada em produção.');
    for (const [table, data] of Object.entries(DEMO_TABLE_DATA)) {
      storage.set(getStorageKey(table, compKey), data);
      await this.upsert(table, compKey, data).catch((e) =>
        console.warn(`[Supabase] Erro ao carregar demo em ${table}:`, e)
      );
    }
  }
};
