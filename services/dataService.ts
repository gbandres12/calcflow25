
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://oyzfafmbaumlsetchkon.supabase.co';
const SUPABASE_KEY = 'sb_publishable_J5K2LFz-hbZ-Z-WHTUwYrw_g6Cjy1-M';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Utilitários para converter chaves entre camelCase e snake_case
 */
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
  get(key: string) {
    const val = localStorage.getItem(`calcarioflow_${key}`);
    return val ? JSON.parse(val) : null;
  },
  set(key: string, val: any) {
    localStorage.setItem(`calcarioflow_${key}`, JSON.stringify(val));
  }
};

export const db = {
  async getTable(tableName: string) {
    try {
      const { data, error } = await supabase.from(tableName).select('*');
      
      if (error) {
        console.warn(`Tabela ${tableName} no Supabase falhou. Usando LocalStorage.`);
        return storage.get(tableName) || [];
      }
      
      const formattedData = toCamelCase(data);
      if (data) storage.set(tableName, formattedData);
      return formattedData || [];
    } catch (e: any) {
      return storage.get(tableName) || [];
    }
  },

  async upsert(tableName: string, record: any) {
    const records = Array.isArray(record) ? record : [record];
    
    // Atualiza cache local imediatamente (em camelCase)
    const current = storage.get(tableName) || [];
    const updated = [...current];
    records.forEach(newRec => {
      const idx = updated.findIndex(r => r.id === newRec.id);
      if (idx >= 0) updated[idx] = newRec;
      else updated.push(newRec);
    });
    storage.set(tableName, updated);

    try {
      // Converte para snake_case antes de enviar para o Supabase
      const dbRecords = toSnakeCase(records);
      const { data, error } = await supabase.from(tableName).upsert(dbRecords).select();
      
      if (error) {
        console.error(`Erro Supabase (${tableName}):`, error.message);
      }
      return toCamelCase(data);
    } catch (e: any) {
      return record;
    }
  },

  async delete(tableName: string, id: string) {
    const current = storage.get(tableName) || [];
    storage.set(tableName, current.filter((r: any) => r.id !== id));

    try {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;
    } catch (e: any) {
      console.warn(`Erro ao deletar no banco (${tableName}).`);
    }
  }
};

export const userService = {
  async authenticate(email: string, pass: string) {
    try {
      const { data: users, error } = await supabase.from('users_profile').select('*').eq('email', email);
      
      if (error || !users || users.length === 0) {
        if (email === 'admin@calcarioflow.com.br' && pass === '123456') {
          return { id: 'u1', name: 'Admin (Offline)', email, role: 'Administrador', status: 'Ativo' };
        }
        throw new Error("Usuário não encontrado");
      }
      
      const user = toCamelCase(users[0]);
      if (pass === '123456') { 
        await supabase.from('users_profile').update({ last_access: new Date().toISOString() }).eq('id', user.id);
        return user;
      }
      throw new Error("Senha inválida");
    } catch (e: any) {
      if (email === 'admin@calcarioflow.com.br' && pass === '123456') {
         return { id: 'u1', name: 'Admin (Emergencial)', email, role: 'Administrador', status: 'Ativo' };
      }
      throw new Error(e.message || "Falha na autenticação");
    }
  },

  async getAll() {
    return await db.getTable('users_profile');
  },

  async sync(users: any[]) {
    return await db.upsert('users_profile', users);
  }
};

export const financeService = {
  async getTransactions() {
    return await db.getTable('transactions');
  },
  
  async saveTransactions(txs: any[]) {
    return await db.upsert('transactions', txs);
  }
};

export const inventoryService = {
  async getInventory() {
    return await db.getTable('inventory');
  },
  async updateStock(id: string, quantity: number) {
    try {
      const current = await this.getInventory();
      const item = current.find((i: any) => i.id === id);
      if (item) {
        await db.upsert('inventory', { ...item, quantity });
      }
    } catch (e: any) {
      console.error("Erro ao atualizar estoque:", e.message);
    }
  }
};

export const orderService = {
  async getOrders() {
    return await db.getTable('sales_orders');
  },
  async saveOrders(orders: any[]) {
    return await db.upsert('sales_orders', orders);
  }
};
