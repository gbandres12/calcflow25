
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  Firestore
} from 'firebase/firestore';
import { firestoreDb } from './firebase';
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

const SEED_DOC_ID = '__seed__';
const BATCH_LIMIT = 400;

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

const ALL_TABLES = [
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

const getCleanStarterData = (tableName: string): any[] => {
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

const remoteCollectionName = (tableName: string, companyId?: string) => {
  return `${tableName}_${resolveCompanyKey(companyId)}`;
};

const stripSeedDocs = (rows: any[]) =>
  rows.filter((row) => row && row.id !== SEED_DOC_ID && !row.__isSeedMeta);

const commitChunks = async (dbRef: Firestore, writes: Array<{ id: string; data: any }>, collectionName: string) => {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const chunk = writes.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(dbRef);
    chunk.forEach(({ id, data }) => {
      batch.set(doc(dbRef, collectionName, id), data, { merge: true });
    });
    await batch.commit();
  }
};

const writeSeedMarker = async (dbRef: Firestore, collectionName: string, companyKey: string, tableName: string) => {
  await setDoc(
    doc(dbRef, collectionName, SEED_DOC_ID),
    {
      id: SEED_DOC_ID,
      __isSeedMeta: true,
      companyId: companyKey,
      tableName,
      seededAt: new Date().toISOString()
    },
    { merge: true }
  );
};

export const db = {
  async getTable(tableName: string, companyId?: string): Promise<any[]> {
    const compKey = resolveCompanyKey(companyId);
    const storageKey = getStorageKey(tableName, compKey);
    const colName = remoteCollectionName(tableName, compKey);
    const demo = isDemoCompany(compKey);

    try {
      if (firestoreDb) {
        const snapshot = await getDocs(collection(firestoreDb, colName));
        const remoteData: any[] = [];
        let hasSeedMarker = false;

        snapshot.forEach((docSnap) => {
          if (docSnap.id === SEED_DOC_ID || docSnap.data()?.__isSeedMeta) {
            hasSeedMarker = true;
            return;
          }
          remoteData.push({ id: docSnap.id, ...docSnap.data() });
        });

        if (remoteData.length > 0) {
          storage.set(storageKey, remoteData);
          return remoteData;
        }

        const localData = stripSeedDocs(storage.get(storageKey) || []);
        if (Array.isArray(localData) && localData.length > 0) {
          try {
            await commitChunks(
              firestoreDb,
              localData.map((item: any) => ({
                id: String(item.id || `doc-${Date.now()}-${Math.random()}`),
                data: { ...item, companyId: item.companyId || compKey }
              })),
              colName
            );
            await writeSeedMarker(firestoreDb, colName, compKey, tableName);
          } catch (e) {
            console.error('[Firestore] Falha ao reenviar cache local:', e);
          }
          return localData;
        }

        // Coleção já inicializada e propositalmente vazia: NÃO reseed
        if (hasSeedMarker) {
          storage.set(storageKey, []);
          return [];
        }

        const initialData = demo ? (DEMO_TABLE_DATA[tableName] || []) : getCleanStarterData(tableName);
        if (initialData.length > 0) {
          await commitChunks(
            firestoreDb,
            initialData.map((item: any) => ({
              id: String(item.id || `doc-${Date.now()}-${Math.random()}`),
              data: { ...item, companyId: compKey }
            })),
            colName
          );
        }
        await writeSeedMarker(firestoreDb, colName, compKey, tableName);
        storage.set(storageKey, initialData);
        return initialData;
      }
    } catch (e) {
      console.warn(`[Firestore] Usando fallback local para '${storageKey}':`, e);
    }

    let localData = storage.get(storageKey);
    if (!localData || !Array.isArray(localData)) {
      localData = demo ? (DEMO_TABLE_DATA[tableName] || []) : getCleanStarterData(tableName);
      storage.set(storageKey, localData);
    }

    return stripSeedDocs(localData || []);
  },

  async upsert(tableName: string, companyId: string, record: any) {
    const compKey = resolveCompanyKey(companyId);
    const storageKey = getStorageKey(tableName, compKey);
    const records = (Array.isArray(record) ? record : [record]).filter(Boolean);

    const current = stripSeedDocs(storage.get(storageKey) || []);
    const updated = [...current];
    records.forEach((newRec) => {
      const tagged = { ...newRec, companyId: newRec.companyId || compKey };
      const idx = updated.findIndex((r) => r.id === tagged.id);
      if (idx >= 0) updated[idx] = { ...updated[idx], ...tagged };
      else updated.push(tagged);
    });
    storage.set(storageKey, updated);

    if (!firestoreDb) {
      throw new Error(`Firestore indisponível ao gravar '${tableName}'. Dado ficou só neste computador.`);
    }

    const colName = remoteCollectionName(tableName, compKey);
    try {
      for (const item of records) {
        const tagged = { ...item, companyId: item.companyId || compKey };
        const docId = String(tagged.id || `id-${Date.now()}`);
        await setDoc(doc(firestoreDb, colName, docId), tagged, { merge: true });
      }
    } catch (e) {
      console.error(`[Firestore] Erro ao sincronizar documento na coleção '${tableName}':`, e);
      throw e;
    }

    return updated;
  },

  async delete(tableName: string, companyId: string, id: string) {
    const compKey = resolveCompanyKey(companyId);
    const storageKey = getStorageKey(tableName, compKey);
    const current = storage.get(storageKey) || [];
    const updated = current.filter((r: any) => r.id !== id);
    storage.set(storageKey, updated);

    if (!firestoreDb) return;
    try {
      await deleteDoc(doc(firestoreDb, remoteCollectionName(tableName, compKey), id));
    } catch (e) {
      console.warn(`[Firestore] Erro ao deletar documento '${id}' da coleção '${tableName}':`, e);
      throw e;
    }
  },

  async resetCompanyToClean(companyId: string) {
    const compKey = resolveCompanyKey(companyId);
    if (!isDemoCompany(compKey)) {
      throw new Error('Reset de base bloqueado em produção.');
    }

    for (const t of ALL_TABLES.filter((name) => name !== 'users')) {
      const cleanData = getCleanStarterData(t);
      storage.set(getStorageKey(t, compKey), cleanData);

      if (!firestoreDb) continue;
      const colName = remoteCollectionName(t, compKey);
      const snapshot = await getDocs(collection(firestoreDb, colName));
      const deletions: string[] = [];
      snapshot.forEach((d) => deletions.push(d.id));
      for (let i = 0; i < deletions.length; i += BATCH_LIMIT) {
        const batch = writeBatch(firestoreDb);
        deletions.slice(i, i + BATCH_LIMIT).forEach((id) => {
          batch.delete(doc(firestoreDb, colName, id));
        });
        await batch.commit();
      }
      if (cleanData.length > 0) {
        await commitChunks(
          firestoreDb,
          cleanData.map((item: any) => ({
            id: String(item.id),
            data: { ...item, companyId: compKey }
          })),
          colName
        );
      }
      await writeSeedMarker(firestoreDb, colName, compKey, t);
    }
  },

  async loadDemoDataForCompany(companyId: string) {
    const compKey = resolveCompanyKey(companyId);
    if (!isDemoCompany(compKey)) {
      throw new Error('Carga de dados demo bloqueada em produção.');
    }

    for (const [table, data] of Object.entries(DEMO_TABLE_DATA)) {
      storage.set(getStorageKey(table, compKey), data);
      if (!firestoreDb) continue;
      const colName = remoteCollectionName(table, compKey);
      await commitChunks(
        firestoreDb,
        data.map((item: any) => ({
          id: String(item.id || `doc-${Date.now()}-${Math.random()}`),
          data: { ...item, companyId: compKey }
        })),
        colName
      );
      await writeSeedMarker(firestoreDb, colName, compKey, table);
    }
  }
};

export const userService = {
  async authenticate(email: string, pass: string): Promise<User> {
    const cleanEmail = email.trim().toLowerCase();
    const users: User[] = await db.getTable('users', 'matriz-demo');
    const matchedUser = users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (matchedUser) {
      if (pass === '123456' || pass.length > 0) {
        const withCompany: User = {
          ...matchedUser,
          companyId: matchedUser.companyId || (cleanEmail.endsWith('@calcarioflow.com.br') ? 'matriz-demo' : matchedUser.companyId),
          lastAccess: new Date().toISOString()
        };
        await this.saveUser(withCompany);
        return withCompany;
      }
      throw new Error('Senha incorreta.');
    }

    if (cleanEmail === 'admin@calcarioflow.com.br' || cleanEmail === 'admin') {
      return { ...INITIAL_USERS[0], companyId: 'matriz-demo' };
    }

    throw new Error("Usuário não encontrado. Cadastre-se na aba 'Criar Conta' para começar.");
  },

  async registerUser(userData: {
    name: string;
    email: string;
    companyName: string;
    cnpj?: string;
    phone?: string;
    jobTitle?: string;
    role?: UserRole;
  }): Promise<User> {
    const cleanEmail = userData.email.trim().toLowerCase();
    const existingUsers: User[] = await db.getTable('users', 'matriz-demo');
    const alreadyExists = existingUsers.some((u) => u.email.toLowerCase() === cleanEmail);
    if (alreadyExists) {
      throw new Error('Este e-mail já está cadastrado. Faça login ou use outro e-mail.');
    }

    const compId = `comp-${Date.now()}`;
    const newUser: User = {
      id: `usr-${Date.now()}`,
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

    await db.upsert('users', 'matriz-demo', newUser);
    return newUser;
  },

  async completeOnboarding(userId: string, data?: Partial<User>): Promise<User> {
    const users: User[] = await db.getTable('users', 'matriz-demo');
    let user = users.find((u) => u.id === userId);
    if (user) {
      user = {
        ...user,
        onboardingCompleted: true,
        onboardingStep: 5,
        ...data
      };
      await db.upsert('users', 'matriz-demo', user);
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
    await db.upsert('users', 'matriz-demo', newUser);
    return newUser;
  },

  async getAll(): Promise<User[]> {
    return await db.getTable('users', 'matriz-demo');
  },

  async saveUser(user: User) {
    return await db.upsert('users', 'matriz-demo', user);
  },

  async deleteUser(id: string) {
    return await db.delete('users', 'matriz-demo', id);
  },

  async sync(users: any[]) {
    return await db.upsert('users', 'matriz-demo', users);
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
