
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
import { Category, User } from '../types';

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

// Dados padrão iniciais para auto-seed
const DEFAULT_TABLE_DATA: Record<string, any[]> = {
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

export const db = {
  async getTable(tableName: string, _companyId?: string): Promise<any[]> {
    // 1. Tenta carregar do Firebase Firestore
    try {
      if (firestoreDb) {
        const colRef = collection(firestoreDb, tableName);
        const snapshot = await getDocs(colRef);
        if (!snapshot.empty) {
          const remoteData: any[] = [];
          snapshot.forEach(docSnap => {
            remoteData.push({ id: docSnap.id, ...docSnap.data() });
          });
          storage.set(tableName, remoteData);
          return remoteData;
        } else if (DEFAULT_TABLE_DATA[tableName]) {
          // Auto-seed inicial no Firestore
          const initialData = DEFAULT_TABLE_DATA[tableName];
          const batch = writeBatch(firestoreDb);
          initialData.forEach(item => {
            const docRef = doc(firestoreDb, tableName, item.id || `doc-${Date.now()}-${Math.random()}`);
            batch.set(docRef, item);
          });
          batch.commit().catch(() => {});
          storage.set(tableName, initialData);
          return initialData;
        }
      }
    } catch (e) {
      console.warn(`[Firestore] Usando fallback local para '${tableName}':`, e);
    }

    // 2. Fallback de cache local
    let localData = storage.get(tableName);
    if (!localData || !Array.isArray(localData) || localData.length === 0) {
      if (DEFAULT_TABLE_DATA[tableName]) {
        localData = DEFAULT_TABLE_DATA[tableName];
        storage.set(tableName, localData);
      } else {
        localData = [];
      }
    }

    return localData || [];
  },

  async upsert(tableName: string, _companyId: string, record: any) {
    const records = Array.isArray(record) ? record : [record];
    
    // 1. Salva no cache local imediatamente
    const current = storage.get(tableName) || DEFAULT_TABLE_DATA[tableName] || [];
    const updated = [...current];
    records.forEach(newRec => {
      const idx = updated.findIndex(r => r.id === newRec.id);
      if (idx >= 0) updated[idx] = { ...updated[idx], ...newRec };
      else updated.push(newRec);
    });
    storage.set(tableName, updated);

    // 2. Persiste no Firebase Firestore
    try {
      if (firestoreDb) {
        for (const item of records) {
          const docId = item.id || `id-${Date.now()}`;
          const docRef = doc(firestoreDb, tableName, docId);
          await setDoc(docRef, item, { merge: true });
        }
      }
    } catch (e) {
      console.warn(`[Firestore] Erro ao sincronizar documento na coleção '${tableName}':`, e);
    }

    return updated;
  },

  async delete(tableName: string, _companyId: string, id: string) {
    const current = storage.get(tableName) || DEFAULT_TABLE_DATA[tableName] || [];
    const updated = current.filter((r: any) => r.id !== id);
    storage.set(tableName, updated);

    try {
      if (firestoreDb) {
        const docRef = doc(firestoreDb, tableName, id);
        await deleteDoc(docRef);
      }
    } catch (e) {
      console.warn(`[Firestore] Erro ao deletar documento '${id}' da coleção '${tableName}':`, e);
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

    throw new Error("Usuário não encontrado. Use uma das contas demonstrativas ou crie um novo.");
  },

  async getAll(): Promise<User[]> {
    return await db.getTable('users');
  },

  async saveUser(user: User) {
    return await db.upsert('users', 'main', user);
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

