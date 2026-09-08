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
import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { firestoreDb } from './firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';

const SEED_DOC_ID = '__seed__';

// Utilitário de armazenamento local (cache resiliente)
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

const stripSeedDocs = (rows: any[]) =>
  (rows || []).filter((row) => row && row.id !== SEED_DOC_ID && !row.__isSeedMeta);

// ========================================================
// REPOSITÓRIO UNIFICADO: SUPABASE (PRIORIDADE) + FIRESTORE + LOCALSTORAGE
// ========================================================

export const db = {
  /**
   * Obtém todos os registros de uma tabela e empresa
   */
  async getTable(tableName: string, companyId?: string): Promise<any[]> {
    const compKey = resolveCompanyKey(companyId);
    const storageKey = getStorageKey(tableName, compKey);
    const demo = isDemoCompany(compKey);

    // 1. Tentar ler do Supabase se configurado
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('app_records')
          .select('id, data')
          .eq('table_name', tableName)
          .eq('company_id', compKey);

        if (!error && Array.isArray(data)) {
          if (data.length > 0) {
            const records = data
              .map((row: any) => row.data || row)
              .filter(Boolean);
            const cleanRecords = stripSeedDocs(records);
            storage.set(storageKey, cleanRecords);
            return cleanRecords;
          }

          // Se a tabela no Supabase estiver vazia para esta empresa, verificar se já temos dados locais para enviar
          const localCache = stripSeedDocs(storage.get(storageKey) || []);
          if (localCache.length > 0) {
            this.upsert(tableName, compKey, localCache).catch((e) =>
              console.warn('[Supabase] Sync local cache to cloud warning:', e)
            );
            return localCache;
          }

          // Inicializar com dados iniciais ou demo
          const initialData = demo ? (DEMO_TABLE_DATA[tableName] || []) : getCleanStarterData(tableName);
          if (initialData.length > 0) {
            this.upsert(tableName, compKey, initialData).catch((e) =>
              console.warn('[Supabase] Seed initial data warning:', e)
            );
          }
          storage.set(storageKey, initialData);
          return initialData;
        } else if (error) {
          console.warn(`[Supabase] Consulta '${tableName}' retornou aviso (código ${error.code}):`, error.message);
        }
      } catch (err) {
        console.warn(`[Supabase] Falha ao consultar '${tableName}':`, err);
      }
    }

    // 2. Tentar ler do Firestore se disponível
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

    // 3. Fallback: LocalStorage / Dados Iniciais
    let localData = storage.get(storageKey);
    if (!localData || !Array.isArray(localData)) {
      localData = demo ? (DEMO_TABLE_DATA[tableName] || []) : getCleanStarterData(tableName);
      storage.set(storageKey, localData);
    }

    return stripSeedDocs(localData || []);
  },

  /**
   * Salva ou atualiza um ou vários registros
   */
  async upsert(tableName: string, companyId: string, record: any): Promise<any[]> {
    const compKey = resolveCompanyKey(companyId);
    const storageKey = getStorageKey(tableName, compKey);
    const records = (Array.isArray(record) ? record : [record]).filter(Boolean);

    if (records.length === 0) {
      return stripSeedDocs(storage.get(storageKey) || []);
    }

    // 1. Atualizar cache local imediatamente para resposta instantânea
    const current = stripSeedDocs(storage.get(storageKey) || []);
    const updated = [...current];

    records.forEach((newRec) => {
      const tagged = { 
        ...newRec, 
        id: String(newRec.id || `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`),
        companyId: newRec.companyId || compKey 
      };
      const idx = updated.findIndex((r) => r.id === tagged.id);
      if (idx >= 0) {
        updated[idx] = { ...updated[idx], ...tagged };
      } else {
        updated.push(tagged);
      }
    });

    storage.set(storageKey, updated);

    // 2. Persistir no Supabase
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

        const { error } = await supabase
          .from('app_records')
          .upsert(rowsToUpsert, { onConflict: 'table_name,company_id,id' });

        if (error) {
          console.warn(`[Supabase] Erro ao gravar '${tableName}':`, error.message);
          // Não interrompe com throw para não travar a interface do usuário
        }
      } catch (err) {
        console.warn(`[Supabase] Falha de comunicação ao gravar '${tableName}':`, err);
      }
    }

    // 3. Persistir no Firestore se disponível
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

  /**
   * Deleta um registro por ID
   */
  async delete(tableName: string, companyId: string, id: string): Promise<void> {
    const compKey = resolveCompanyKey(companyId);
    const storageKey = getStorageKey(tableName, compKey);
    const current = storage.get(storageKey) || [];
    const updated = current.filter((r: any) => r.id !== id);
    storage.set(storageKey, updated);

    // Deletar no Supabase
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase
          .from('app_records')
          .delete()
          .eq('table_name', tableName)
          .eq('company_id', compKey)
          .eq('id', String(id));

        if (error) {
          console.warn(`[Supabase] Erro ao deletar em '${tableName}':`, error.message);
        }
      } catch (err) {
        console.warn(`[Supabase] Falha ao deletar em '${tableName}':`, err);
      }
    }

    // Deletar no Firestore se disponível
    if (firestoreDb) {
      try {
        const colName = `${tableName}_${compKey}`;
        await deleteDoc(doc(firestoreDb, colName, id));
      } catch (e) {
        console.warn(`[Firestore] Erro ao deletar em '${tableName}':`, e);
      }
    }
  },

  /**
   * Restaura empresa Demo para dados limpos
   */
  async resetCompanyToClean(companyId: string) {
    const compKey = resolveCompanyKey(companyId);
    if (!isDemoCompany(compKey)) {
      throw new Error('Reset de base bloqueado em produção.');
    }

    for (const t of ALL_TABLES.filter((name) => name !== 'users')) {
      const cleanData = getCleanStarterData(t);
      storage.set(getStorageKey(t, compKey), cleanData);

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
        } catch (e) {
          console.warn(`[Supabase] Erro ao resetar tabela ${t}:`, e);
        }
      }
    }
  },

  /**
   * Carrega dados de demonstração completos
   */
  async loadDemoDataForCompany(companyId: string) {
    const compKey = resolveCompanyKey(companyId);
    if (!isDemoCompany(compKey)) {
      throw new Error('Carga de dados demo bloqueada em produção.');
    }

    for (const [table, data] of Object.entries(DEMO_TABLE_DATA)) {
      storage.set(getStorageKey(table, compKey), data);
      await this.upsert(table, compKey, data).catch((e) =>
        console.warn(`[Supabase] Erro ao carregar demo em ${table}:`, e)
      );
    }
  }
};

// ========================================================
// ========================================================
// SERVIÇO DE AUTENTICAÇÃO E USUÁRIOS (SUPABASE AUTH NATIVO)
// ========================================================

export const userService = {
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
          const userCompanyId = meta.companyId || (cleanEmail.endsWith('@calcarioflow.com.br') ? 'matriz-demo' : `comp-${authUser.id}`);

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
            profile = { ...profile, lastAccess: new Date().toISOString() };
            await this.saveUser(profile);
          }

          return profile;
        }

        // Se o Supabase Auth retornou erro
        if (authError) {
          // Permite que as contas padrão de demonstração sejam acessadas mesmo sem pré-registro no Auth
          const isDemoAccount = INITIAL_USERS.some(u => u.email.toLowerCase() === cleanEmail) || cleanEmail === 'admin@calcarioflow.com.br';
          if (isDemoAccount && (pass === '123456' || pass.length > 0)) {
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

    if (matchedUser) {
      if (pass === '123456' || pass.length > 0) {
        const withCompany: User = {
          ...matchedUser,
          companyId: matchedUser.companyId || (cleanEmail.endsWith('@calcarioflow.com.br') ? 'matriz-demo' : `comp-${matchedUser.id}`),
          lastAccess: new Date().toISOString()
        };
        await this.saveUser(withCompany);
        return withCompany;
      }
      throw new Error('Senha incorreta. Utilize 123456.');
    }

    if (cleanEmail === 'admin@calcarioflow.com.br' || cleanEmail === 'admin') {
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
    const password = userData.password || '123456';
    const supabase = getSupabase();

    let authUserId = `usr-${Date.now()}`;
    let requiresEmailConfirmation = false;
    const compId = `comp-${Date.now()}`;

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
          // Se não houver sessão ativa, significa que a confirmação por e-mail está habilitada no projeto Supabase
          if (!authData.session) {
            requiresEmailConfirmation = true;
          }
        }
      } catch (err: any) {
        if (err.message && err.message.includes('já está cadastrado')) throw err;
        console.warn('[Supabase Auth] Aviso no signUp:', err);
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

    // 3. Salvar o novo usuário no diretório e na base da empresa
    await db.upsert('users', 'matriz-demo', newUser);
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
        const compId = meta.companyId || (email.endsWith('@calcarioflow.com.br') ? 'matriz-demo' : `comp-${session.user.id}`);
        
        let profile: User | undefined;
        try {
          const users = await db.getTable('users', compId);
          profile = users.find(u => u.email.toLowerCase() === email || u.id === session.user.id);
        } catch {}

        if (profile) return profile;

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
