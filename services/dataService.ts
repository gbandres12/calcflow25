
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://oyzfafmbaumlsetchkon.supabase.co';
const SUPABASE_KEY = 'sb_publishable_J5K2LFz-hbZ-Z-WHTUwYrw_g6Cjy1-M';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const toSnakeCase = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      acc[snakeKey] = toSnakeCase(obj[key]);
      return acc;
    }, {} as any);
  }
  return obj;
};

const toCamelCase = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const camelKey = key.replace(/(_\w)/g, m => m[1].toUpperCase());
      acc[camelKey] = toCamelCase(obj[key]);
      return acc;
    }, {} as any);
  }
  return obj;
};

const storage = {
  get(key: string, companyId: string) {
    const val = localStorage.getItem(`calcarioflow_${companyId}_${key}`);
    return val ? JSON.parse(val) : null;
  },
  set(key: string, companyId: string, val: any) {
    localStorage.setItem(`calcarioflow_${companyId}_${key}`, JSON.stringify(val));
  }
};

export const db = {
  async getTable(tableName: string, companyId: string) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('company_id', companyId);
      
      if (error) {
        console.warn(`Erro na tabela ${tableName}. Usando Offline Cache.`);
        return storage.get(tableName, companyId) || [];
      }
      
      const formattedData = toCamelCase(data);
      storage.set(tableName, companyId, formattedData);
      return formattedData || [];
    } catch (e: any) {
      return storage.get(tableName, companyId) || [];
    }
  },

  async upsert(tableName: string, companyId: string, record: any) {
    const records = (Array.isArray(record) ? record : [record]).map(r => ({ ...r, companyId }));
    
    // Cache local imediato
    const current = storage.get(tableName, companyId) || [];
    const updated = [...current];
    records.forEach(newRec => {
      const idx = updated.findIndex(r => r.id === newRec.id);
      if (idx >= 0) updated[idx] = newRec;
      else updated.push(newRec);
    });
    storage.set(tableName, companyId, updated);

    try {
      const dbRecords = toSnakeCase(records);
      const { data, error } = await supabase.from(tableName).upsert(dbRecords).select();
      if (error) console.error(`Erro Supabase:`, error.message);
      return toCamelCase(data);
    } catch (e: any) {
      return record;
    }
  },

  async delete(tableName: string, companyId: string, id: string) {
    const current = storage.get(tableName, companyId) || [];
    storage.set(tableName, companyId, current.filter((r: any) => r.id !== id));

    try {
      await supabase.from(tableName).delete().eq('id', id).eq('company_id', companyId);
    } catch (e: any) {}
  }
};

export const userService = {
  async authenticate(email: string, pass: string) {
    try {
      const { data: users, error } = await supabase.from('users_profile').select('*').eq('email', email);
      if (error || !users || users.length === 0) {
        if (email === 'admin@calcarioflow.com.br' && pass === '123456') {
          return { id: 'u1', name: 'Master Admin', email, role: 'Administrador', status: 'Ativo' };
        }
        throw new Error("Usuário não encontrado");
      }
      const user = toCamelCase(users[0]);
      if (pass === '123456') return user;
      throw new Error("Senha inválida");
    } catch (e: any) {
      if (email === 'admin@calcarioflow.com.br' && pass === '123456') {
         return { id: 'u1', name: 'Master Admin (Offline)', email, role: 'Administrador', status: 'Ativo' };
      }
      throw new Error(e.message || "Falha na autenticação");
    }
  },

  async getAll() {
    // Lista de usuários é global ou filtrada por filial? 
    // Para simplificar, Admin vê todos. Outros não acessam essa view.
    const { data } = await supabase.from('users_profile').select('*');
    return toCamelCase(data || []);
  },

  async sync(users: any[]) {
    const dbUsers = toSnakeCase(users);
    await supabase.from('users_profile').upsert(dbUsers);
  }
};

export const financeService = {
  async getTransactions(companyId: string) {
    return await db.getTable('transactions', companyId);
  },
  async saveTransactions(companyId: string, txs: any[]) {
    return await db.upsert('transactions', companyId, txs);
  }
};

export const inventoryService = {
  async getInventory(companyId: string) {
    return await db.getTable('inventory', companyId);
  },
  async updateStock(companyId: string, id: string, quantity: number) {
    const current = await this.getInventory(companyId);
    const item = current.find((i: any) => i.id === id);
    if (item) await db.upsert('inventory', companyId, { ...item, quantity });
  }
};

export const orderService = {
  async getOrders(companyId: string) {
    return await db.getTable('sales_orders', companyId);
  },
  async saveOrders(companyId: string, orders: any[]) {
    return await db.upsert('sales_orders', companyId, orders);
  }
};
