
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://oyzfafmbaumlsetchkon.supabase.co';
const SUPABASE_KEY = 'sb_publishable_J5K2LFz-hbZ-Z-WHTUwYrw_g6Cjy1-M';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const db = {
  async getTable(tableName: string) {
    try {
      const { data, error } = await supabase.from(tableName).select('*');
      if (error) throw error;
      return data || [];
    } catch (e: any) {
      console.error(`Erro ao buscar tabela ${tableName}:`, e.message);
      return [];
    }
  },

  async upsert(tableName: string, record: any) {
    try {
      const { data, error } = await supabase.from(tableName).upsert(record).select();
      if (error) throw error;
      return data;
    } catch (e: any) {
      console.error(`Erro ao salvar na tabela ${tableName}:`, e.message);
      throw e;
    }
  },

  async delete(tableName: string, id: string) {
    try {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;
    } catch (e: any) {
      console.error(`Erro ao deletar de ${tableName}:`, e.message);
      throw e;
    }
  }
};

export const userService = {
  async authenticate(email: string, pass: string) {
    try {
      const { data: users, error } = await supabase.from('users_profile').select('*').eq('email', email);
      if (error || !users || users.length === 0) throw new Error("Usuário não encontrado");
      
      const user = users[0];
      // Nota: Em produção real, use Supabase Auth. Aqui mantemos a lógica simplificada solicitada.
      if (pass === '123456') { 
        await supabase.from('users_profile').update({ last_access: new Date().toISOString() }).eq('id', user.id);
        return user;
      }
      throw new Error("Senha inválida");
    } catch (e: any) {
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
      const { error } = await supabase.from('inventory').update({ quantity }).eq('id', id);
      if (error) throw error;
    } catch (e: any) {
      console.error("Erro ao atualizar estoque:", e.message);
    }
  }
};
