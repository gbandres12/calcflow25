import { User, UserRole } from '../types';
import { INITIAL_USERS } from '../constants';
import { getSupabase } from './supabaseClient';
import { db, getCleanStarterData } from './dbCore';
import { hashPassword, isDemoEmail, passwordMatches } from './authLogic';

export const userService = {
  async authenticate(email: string, pass: string): Promise<User> {
    const cleanEmail = email.trim().toLowerCase();

    let users: User[] = [];
    try {
      users = await db.getTable('users', 'matriz-demo');
    } catch {
      users = INITIAL_USERS;
    }

    const supabase = getSupabase();
    if (supabase && (!users || !users.some((u) => u.email.toLowerCase() === cleanEmail))) {
      try {
        const { data, error } = await supabase
          .from('app_records')
          .select('data')
          .eq('table_name', 'users');

        if (!error && Array.isArray(data) && data.length > 0) {
          const allRemoteUsers: User[] = data.map((r: any) => r.data).filter(Boolean);
          users = [...users, ...allRemoteUsers];
        }
      } catch (e) {
        console.warn('[Supabase] Falha ao pesquisar usuários remotos:', e);
      }
    }

    const matchedUser = users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (matchedUser) {
      const ok = await passwordMatches(matchedUser, pass);
      if (!ok) {
        throw new Error(isDemoEmail(cleanEmail) ? 'Senha incorreta. Demo: 123456.' : 'Senha incorreta.');
      }
      const withCompany: User = {
        ...matchedUser,
        companyId: matchedUser.companyId || (isDemoEmail(cleanEmail) ? 'matriz-demo' : `comp-${matchedUser.id}`),
        lastAccess: new Date().toISOString()
      };
      await this.saveUser(withCompany);
      return withCompany;
    }

    if (cleanEmail === 'admin@calcarioflow.com.br' || cleanEmail === 'admin') {
      if (pass !== '123456') throw new Error('Senha incorreta. Demo: 123456.');
      return { ...INITIAL_USERS[0], companyId: 'matriz-demo' };
    }

    throw new Error("Usuário não encontrado. Cadastre-se na aba 'Criar Conta' para começar.");
  },

  async registerUser(userData: {
    name: string;
    email: string;
    companyName: string;
    password?: string;
    cnpj?: string;
    phone?: string;
    jobTitle?: string;
    role?: UserRole;
  }): Promise<User> {
    const cleanEmail = userData.email.trim().toLowerCase();

    let existingUsers: User[] = [];
    try {
      existingUsers = await db.getTable('users', 'matriz-demo');
    } catch {
      existingUsers = [];
    }

    const alreadyExists = existingUsers.some((u) => u.email.toLowerCase() === cleanEmail);
    if (alreadyExists) {
      throw new Error('Este e-mail já está cadastrado. Faça login com sua senha.');
    }

    const rawPassword = (userData.password || '').trim();
    if (rawPassword.length < 6) {
      throw new Error('A senha precisa ter no mínimo 6 caracteres.');
    }

    const compId = `comp-${Date.now()}`;
    const newUser: User = {
      id: `usr-${Date.now()}`,
      name: userData.name.trim(),
      email: cleanEmail,
      passwordHash: await hashPassword(rawPassword),
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
    await db.upsert('users', compId, newUser);

    const initialAccounts = getCleanStarterData('financial_accounts');
    const initialCategories = getCleanStarterData('categories');
    const initialInventory = getCleanStarterData('inventory');

    await Promise.all([
      db.upsert('financial_accounts', compId, initialAccounts),
      db.upsert('categories', compId, initialCategories),
      db.upsert('inventory', compId, initialInventory)
    ]).catch((e) => console.warn('[Supabase/Storage] Erro ao semear empresa nova:', e));

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
      if (user.companyId) {
        await db.upsert('users', user.companyId, user);
      }
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

  async getAll(companyId?: string): Promise<User[]> {
    if (companyId && companyId !== 'matriz-demo') {
      const compUsers = await db.getTable('users', companyId);
      if (compUsers.length > 0) return compUsers;
    }
    return await db.getTable('users', 'matriz-demo');
  },

  async saveUser(user: User) {
    await db.upsert('users', 'matriz-demo', user);
    if (user.companyId && user.companyId !== 'matriz-demo') {
      await db.upsert('users', user.companyId, user);
    }
    return user;
  },

  async deleteUser(id: string, companyId?: string) {
    await db.delete('users', 'matriz-demo', id);
    if (companyId) {
      await db.delete('users', companyId, id);
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
