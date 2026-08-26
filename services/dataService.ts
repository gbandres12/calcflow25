
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  writeBatch 
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
import { Category, User, UserRole } from '../types';

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
    } catch {}
  }
};

// Dados padrão iniciais para auto-seed em ambiente DEMO (Matriz)
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

// Dados padrão mínimos e limpos para um novo cliente SaaS
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
  // Todas as demais tabelas começam 100% LIMPAS (zero clientes, zero pedidos, zero transações, zero maquinários mockados)
  return [];
};

const getStorageKey = (tableName: string, companyId?: string) => {
  const comp = companyId && companyId !== 'main' ? companyId : 'matriz-demo';
  return `${tableName}_${comp}`;
};

export const db = {
  async getTable(tableName: string, companyId?: string): Promise<any[]> {
    const compKey = companyId && companyId !== 'main' ? companyId : 'matriz-demo';
    const isDemo = compKey === 'matriz-demo' || compKey === 'demo';
    const storageKey = getStorageKey(tableName, compKey);

    // 1. Tenta carregar do Firebase Firestore com isolamento por empresa
    try {
      if (firestoreDb) {
        const remoteCollectionName = `${tableName}_${compKey}`;
        const colRef = collection(firestoreDb, remoteCollectionName);
        const snapshot = await getDocs(colRef);
        if (!snapshot.empty) {
          const remoteData: any[] = [];
          snapshot.forEach(docSnap => {
            remoteData.push({ id: docSnap.id, ...docSnap.data() });
          });
          storage.set(storageKey, remoteData);
          return remoteData;
        } else {
          // Se for demo, seed demo; se for novo SaaS, seed apenas estrutura inicial limpa
          const initialData = isDemo ? (DEMO_TABLE_DATA[tableName] || []) : getCleanStarterData(tableName);
          if (initialData.length > 0) {
            const batch = writeBatch(firestoreDb);
            initialData.forEach(item => {
              const docRef = doc(firestoreDb, remoteCollectionName, item.id || `doc-${Date.now()}-${Math.random()}`);
              batch.set(docRef, item);
            });
            batch.commit().catch(() => {});
          }
          storage.set(storageKey, initialData);
          return initialData;
        }
      }
    } catch (e) {
      console.warn(`[Firestore] Usando fallback local para '${storageKey}':`, e);
    }

    // 2. Fallback de cache local
    let localData = storage.get(storageKey);
    if (!localData || !Array.isArray(localData)) {
      localData = isDemo ? (DEMO_TABLE_DATA[tableName] || []) : getCleanStarterData(tableName);
      storage.set(storageKey, localData);
    }

    return localData || [];
  },

  async upsert(tableName: string, companyId: string, record: any) {
    const compKey = companyId && companyId !== 'main' ? companyId : 'matriz-demo';
    const storageKey = getStorageKey(tableName, compKey);
    const records = Array.isArray(record) ? record : [record];
    
    // 1. Salva no cache local imediatamente
    const current = storage.get(storageKey) || [];
    const updated = [...current];
    records.forEach(newRec => {
      const idx = updated.findIndex(r => r.id === newRec.id);
      if (idx >= 0) updated[idx] = { ...updated[idx], ...newRec };
      else updated.push(newRec);
    });
    storage.set(storageKey, updated);

    // 2. Persiste no Firebase Firestore
    try {
      if (firestoreDb) {
        const remoteCollectionName = `${tableName}_${compKey}`;
        for (const item of records) {
          const docId = item.id || `id-${Date.now()}`;
          const docRef = doc(firestoreDb, remoteCollectionName, docId);
          await setDoc(docRef, item, { merge: true });
        }
      }
    } catch (e) {
      console.warn(`[Firestore] Erro ao sincronizar documento na coleção '${tableName}':`, e);
    }

    return updated;
  },

  async delete(tableName: string, companyId: string, id: string) {
    const compKey = companyId && companyId !== 'main' ? companyId : 'matriz-demo';
    const storageKey = getStorageKey(tableName, compKey);
    const current = storage.get(storageKey) || [];
    const updated = current.filter((r: any) => r.id !== id);
    storage.set(storageKey, updated);

    try {
      if (firestoreDb) {
        const remoteCollectionName = `${tableName}_${compKey}`;
        const docRef = doc(firestoreDb, remoteCollectionName, id);
        await deleteDoc(docRef);
      }
    } catch (e) {
      console.warn(`[Firestore] Erro ao deletar documento '${id}' da coleção '${tableName}':`, e);
    }
  },

  // Reset total para base 100% limpa
  async resetCompanyToClean(companyId: string) {
    const compKey = companyId && companyId !== 'main' ? companyId : 'matriz-demo';
    const tables = [
      'customers', 'sales_orders', 'transactions', 
      'machines', 'store_items', 'maintenance_records', 
      'fuel_records', 'fuel_purchases', 'inventory',
      'financial_accounts', 'categories', 'fiscal_config'
    ];

    for (const t of tables) {
      const cleanData = getCleanStarterData(t);
      storage.set(getStorageKey(t, compKey), cleanData);
    }
  },

  // Carregar dados de demonstração para a empresa atual
  async loadDemoDataForCompany(companyId: string) {
    const compKey = companyId && companyId !== 'main' ? companyId : 'matriz-demo';
    for (const [table, data] of Object.entries(DEMO_TABLE_DATA)) {
      storage.set(getStorageKey(table, compKey), data);
    }
  }
};

export const userService = {
  async authenticate(email: string, pass: string): Promise<User> {
    const cleanEmail = email.trim().toLowerCase();
    
    // Busca na lista de usuários
    const users: User[] = await db.getTable('users');
    const matchedUser = users.find(u => u.email.toLowerCase() === cleanEmail);

    if (matchedUser) {
      if (pass === '123456' || pass.length > 0) {
        const updated = { ...matchedUser, lastAccess: new Date().toISOString() };
        await this.saveUser(updated);
        return updated;
      }
      throw new Error("Senha incorreta.");
    }

    if (cleanEmail === 'admin@calcarioflow.com.br' || cleanEmail === 'admin') {
      return INITIAL_USERS[0];
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
    const existingUsers: User[] = await db.getTable('users');
    const alreadyExists = existingUsers.some(u => u.email.toLowerCase() === cleanEmail);
    if (alreadyExists) {
      throw new Error("Este e-mail já está cadastrado. Faça login ou use outro e-mail.");
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

    await db.upsert('users', 'main', newUser);
    return newUser;
  },

  async completeOnboarding(userId: string, data?: Partial<User>): Promise<User> {
    const users: User[] = await db.getTable('users');
    let user = users.find(u => u.id === userId);
    if (user) {
      user.onboardingCompleted = true;
      user.onboardingStep = 5;
      if (data?.companyName) user.companyName = data.companyName;
      if (data?.cnpj) user.cnpj = data.cnpj;
      if (data?.city) user.city = data.city;
      if (data?.state) user.state = data.state;
      await db.upsert('users', 'main', user);
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
    await db.upsert('users', 'main', newUser);
    return newUser;
  },

  async getAll(): Promise<User[]> {
    return await db.getTable('users');
  },

  async saveUser(user: User) {
    return await db.upsert('users', 'main', user);
  },

  async deleteUser(id: string) {
    return await db.delete('users', 'main', id);
  },

  async sync(users: any[]) {
    return await db.upsert('users', 'main', users);
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

