import { User, UserRole } from '../types';
import { INITIAL_USERS } from '../constants';
import { getSupabase } from './supabaseClient';
import { db, getCleanStarterData, resolveCompanyKey } from './dbCore';
import { hashPassword, isDemoEmail, passwordMatches, toPublicUser } from './authLogic';

const pickUser = (rows: any[]): User | null => {
  const users = (rows || [])
    .map((r: any) => (r?.data && typeof r.data === 'object' ? r.data : r))
    .filter((u: any) => u && u.email && u.id !== '__seed__' && !u.__isSeedMeta) as User[];
  if (users.length === 0) return null;
  return users.find((u) => Boolean(u.passwordHash)) || users[0];
};

const findUserByEmailRemote = async (cleanEmail: string): Promise<User | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('app_records')
      .select('data, company_id')
      .eq('table_name', 'users')
      .filter('data->>email', 'eq', cleanEmail)
      .limit(8);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return pickUser(data);
  } catch (e) {
    console.warn('[Supabase] Falha ao localizar usuário por e-mail:', e);
    return null;
  }
};

export const userService = {
  async authenticate(email: string, pass: string): Promise<User> {
    const cleanEmail = email.trim().toLowerCase();

    let matchedUser = await findUserByEmailRemote(cleanEmail);

    if (!matchedUser) {
      let users: User[] = [];
      try {
        users = await db.getTable('users', 'matriz-demo');
      } catch {
        users = INITIAL_USERS;
      }
      matchedUser = users.find((u) => (u.email || '').toLowerCase() === cleanEmail) || null;
    }

    if (matchedUser) {
      const ok = await passwordMatches(matchedUser, pass);
      if (!ok) {
        throw new Error(isDemoEmail(cleanEmail) ? 'Senha incorreta. Demo: 123456.' : 'Senha incorreta.');
      }
      const withCompany: User = {
        ...matchedUser,
        email: cleanEmail,
        companyId: matchedUser.companyId || (isDemoEmail(cleanEmail) ? 'matriz-demo' : `comp-${matchedUser.id}`),
        lastAccess: new Date().toISOString()
      };
      this.saveUser(withCompany).catch((e) => console.warn('[Auth] Falha ao atualizar lastAccess:', e));
      return toPublicUser(withCompany);
    }

    if (cleanEmail === 'admin@calcarioflow.com.br' || cleanEmail === 'admin') {
      if (pass !== '123456') throw new Error('Senha incorreta. Demo: 123456.');
      return toPublicUser({ ...INITIAL_USERS[0], companyId: 'matriz-demo' });
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

    const remoteExisting = await findUserByEmailRemote(cleanEmail);
    if (remoteExisting) {
      throw new Error('Este e-mail já está cadastrado. Faça login com sua senha.');
    }

    try {
      const existingUsers: User[] = await db.getTable('users', 'matriz-demo');
      if (existingUsers.some((u) => (u.email || '').toLowerCase() === cleanEmail)) {
        throw new Error('Este e-mail já está cadastrado. Faça login com sua senha.');
      }
    } catch (e: any) {
      if (e?.message?.includes('já está cadastrado')) throw e;
    }

    const rawPassword = (userData.password || '').trim();
    if (rawPassword.length < 6) {
      throw new Error('A senha precisa ter no mínimo 6 caracteres.');
    }

    const compId = `comp-${Date.now().toString(36)}`;
    const newUser: User = {
      id: `usr-${Date.now().toString(36)}`,
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

    await db.upsert('users', compId, newUser);

    const initialAccounts = getCleanStarterData('financial_accounts');
    const initialCategories = getCleanStarterData('categories');
    const initialInventory = getCleanStarterData('inventory');
    const initialFiscal = getCleanStarterData('fiscal_config').map((cfg: any) => ({
      ...cfg,
      companyId: compId,
      razaoSocial: newUser.companyName,
      nomeFantasia: newUser.companyName,
      cnpjEmitente: newUser.cnpj || cfg.cnpjEmitente
    }));

    await Promise.all([
      db.upsert('financial_accounts', compId, initialAccounts),
      db.upsert('categories', compId, initialCategories),
      db.upsert('inventory', compId, initialInventory),
      db.upsert('fiscal_config', compId, initialFiscal)
    ]).catch((e) => console.warn('[Supabase/Storage] Erro ao semear empresa nova:', e));

    return toPublicUser(newUser);
  },

  async completeOnboarding(userId: string, data?: Partial<User>): Promise<User> {
    const companyId = resolveCompanyKey(data?.companyId);
    const users: User[] = await db.getTable('users', companyId);
    let user = users.find((u) => u.id === userId);

    if (!user) {
      const remote = data?.email ? await findUserByEmailRemote(data.email.toLowerCase()) : null;
      user = remote || undefined;
    }

    if (user) {
      user = {
        ...user,
        onboardingCompleted: true,
        onboardingStep: 5,
        ...data
      };
      await db.upsert('users', user.companyId || companyId, user);
      return toPublicUser(user);
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
    return toPublicUser(newUser);
  },

  async getAll(companyId?: string): Promise<User[]> {
    const key = resolveCompanyKey(companyId);
    const compUsers = await db.getTable('users', key);
    if (compUsers.length > 0) return compUsers.map(toPublicUser);
    if (key === 'matriz-demo') return (await db.getTable('users', 'matriz-demo')).map(toPublicUser);
    return [];
  },

  async saveUser(user: User) {
    const companyId = resolveCompanyKey(user.companyId);
    const tagged = { ...user, email: (user.email || '').trim().toLowerCase(), companyId };
    await db.upsert('users', companyId, tagged);
    return tagged;
  },

  async deleteUser(id: string, companyId?: string) {
    const key = resolveCompanyKey(companyId);
    await db.delete('users', key, id);
    if (key !== 'matriz-demo') {
      await db.delete('users', 'matriz-demo', id);
    }
  },

  async sync(users: any[], companyId?: string) {
    return await db.upsert('users', resolveCompanyKey(companyId), users);
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
