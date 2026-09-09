import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Função para limpar strings de variáveis de ambiente (remover aspas ou espaços acidentais)
const cleanEnv = (val?: string): string => {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '');
};

const getEnvVar = (key: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (import.meta.env[key]) return cleanEnv(import.meta.env[key]);
  }
  if (typeof process !== 'undefined' && process.env) {
    if (process.env[key]) return cleanEnv(process.env[key]);
  }
  if (typeof window !== 'undefined' && (window as any).__ENV__) {
    if ((window as any).__ENV__[key]) return cleanEnv((window as any).__ENV__[key]);
  }
  return '';
};

const supabaseUrl: string = 
  getEnvVar('VITE_SUPABASE_URL') || 
  getEnvVar('NEXT_PUBLIC_SUPABASE_URL') || 
  getEnvVar('SUPABASE_URL');

const supabaseAnonKey: string = 
  getEnvVar('VITE_SUPABASE_ANON_KEY') || 
  getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY') || 
  getEnvVar('VITE_SUPABASE_KEY') || 
  getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY') || 
  getEnvVar('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || 
  getEnvVar('SUPABASE_ANON_KEY') || 
  getEnvVar('SUPABASE_PUBLISHABLE_KEY') || 
  getEnvVar('SUPABASE_KEY');

let _supabase: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (!_supabase && supabaseUrl && supabaseAnonKey) {
    try {
      _supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        }
      });
    } catch (e) {
      console.warn('[Supabase] Erro ao inicializar cliente Supabase:', e);
    }
  }
  return _supabase;
};

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? getSupabase() 
  : null;

export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey);
};

export const getSupabaseConfig = () => ({
  url: supabaseUrl,
  hasKey: Boolean(supabaseAnonKey),
  keyPrefix: supabaseAnonKey ? supabaseAnonKey.slice(0, 8) + '...' : ''
});

export const SUPABASE_SQL_SCHEMA = `-- O schema do CalcárioFlow é versionado em supabase/migrations.
--
-- Não aplique políticas abertas para anon ou authenticated.
-- A migration 003_secure_multi_tenant_access.sql cria o vínculo de cada usuário
-- autenticado com a sua empresa e restringe a tabela app_records por empresa.
--
-- Para um projeto novo, aplique as migrations 001, 002 e 003 na ordem.`;

/**
 * Testa a conexão com o Supabase e verifica se a tabela app_records existe
 */
export const testSupabaseConnection = async (): Promise<{
  ok: boolean;
  tableExists: boolean;
  message: string;
  url?: string;
}> => {
  const client = getSupabase();
  if (!client) {
    return {
      ok: false,
      tableExists: false,
      message: 'Variáveis VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não configuradas.'
    };
  }

  try {
    const { data, error } = await client
      .from('app_records')
      .select('id')
      .limit(1);

    if (error) {
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        return {
          ok: true,
          tableExists: false,
          url: supabaseUrl,
          message: 'Supabase conectado, mas a tabela "app_records" ainda não foi criada no SQL Editor.'
        };
      }
      return {
        ok: false,
        tableExists: false,
        url: supabaseUrl,
        message: `Erro ao acessar Supabase: ${error.message}`
      };
    }

    return {
      ok: true,
      tableExists: true,
      url: supabaseUrl,
      message: 'Conexão com Supabase e tabela app_records ativas com sucesso!'
    };
  } catch (err: any) {
    return {
      ok: false,
      tableExists: false,
      url: supabaseUrl,
      message: `Falha de rede ou configuração no Supabase: ${err?.message || err}`
    };
  }
};

export interface SupabasePersistenceTestResult {
  ok: boolean;
  canWrite: boolean;
  canRead: boolean;
  latencyMs?: number;
  message: string;
  counts: {
    salesOrders: number;
    nfeOrders: number;
    transactions: number;
    customers: number;
    total: number;
  };
}

/**
 * Executa um ciclo completo de teste de persistência em tempo real no Supabase:
 * 1. Grava um registro de diagnóstico em app_records
 * 2. Lê de volta para certificar integridade dos dados
 * 3. Remove o registro de diagnóstico
 * 4. Obtém o total de pedidos de vendas, notas fiscais e transações já gravados
 */
export const testSupabasePersistence = async (): Promise<SupabasePersistenceTestResult> => {
  const client = getSupabase();
  if (!client) {
    return {
      ok: false,
      canWrite: false,
      canRead: false,
      message: 'Supabase não configurado (URL ou Chave ausentes nas variáveis de ambiente).',
      counts: { salesOrders: 0, nfeOrders: 0, transactions: 0, customers: 0, total: 0 }
    };
  }

  const startTime = performance.now();
  const testId = `diag-${Date.now()}`;

  try {
    const { data: sessionData } = await client.auth.getSession();
    let companyId = 'matriz-demo';
    if (sessionData.session?.user) {
      const { data: membership, error: membershipError } = await client
        .from('company_memberships')
        .select('company_id')
        .eq('user_id', sessionData.session.user.id)
        .maybeSingle();
      if (membershipError || !membership?.company_id) {
        return {
          ok: false,
          canWrite: false,
          canRead: false,
          message: 'A conta autenticada não está vinculada a uma empresa.',
          counts: { salesOrders: 0, nfeOrders: 0, transactions: 0, customers: 0, total: 0 }
        };
      }
      companyId = membership.company_id;
    }

    // 1. Testar Gravação (Upsert)
    const { error: writeError } = await client
      .from('app_records')
      .upsert([{
        id: testId,
        table_name: '__diagnostic_probe__',
        company_id: companyId,
        data: { probe: true, timestamp: new Date().toISOString() },
        updated_at: new Date().toISOString()
      }], { onConflict: 'table_name,company_id,id' });

    if (writeError) {
      return {
        ok: false,
        canWrite: false,
        canRead: false,
        message: `Falha ao gravar no Supabase: ${writeError.message}`,
        counts: { salesOrders: 0, nfeOrders: 0, transactions: 0, customers: 0, total: 0 }
      };
    }

    // 2. Testar Leitura
    const { data: readData, error: readError } = await client
      .from('app_records')
      .select('id, data')
      .eq('id', testId)
      .eq('table_name', '__diagnostic_probe__')
      .eq('company_id', companyId)
      .maybeSingle();

    if (readError || !readData) {
      return {
        ok: false,
        canWrite: true,
        canRead: false,
        message: `Registro foi gravado, mas falhou na leitura: ${readError?.message || 'Registro não encontrado'}`,
        counts: { salesOrders: 0, nfeOrders: 0, transactions: 0, customers: 0, total: 0 }
      };
    }

    // 3. Limpar registro de teste
    await client
      .from('app_records')
      .delete()
      .eq('id', testId)
      .eq('table_name', '__diagnostic_probe__')
      .eq('company_id', companyId);

    const latencyMs = Math.round(performance.now() - startTime);

    // 4. Buscar contagem de registros das áreas de negócio
    let salesOrders = 0;
    let nfeOrders = 0;
    let transactions = 0;
    let customers = 0;
    let total = 0;

    const { data: allRecords } = await client
      .from('app_records')
      .select('table_name, data')
      .eq('company_id', companyId);

    if (Array.isArray(allRecords)) {
      total = allRecords.length;
      allRecords.forEach((row: any) => {
        if (row.table_name === 'sales_orders') {
          salesOrders++;
          if (row.data?.nfeStatus === 'autorizada' || row.data?.nfeNumero) {
            nfeOrders++;
          }
        } else if (row.table_name === 'transactions') {
          transactions++;
        } else if (row.table_name === 'customers') {
          customers++;
        }
      });
    }

    return {
      ok: true,
      canWrite: true,
      canRead: true,
      latencyMs,
      message: `Ciclo completo de gravação e leitura confirmado no Supabase em ${latencyMs}ms!`,
      counts: { salesOrders, nfeOrders, transactions, customers, total }
    };
  } catch (err: any) {
    return {
      ok: false,
      canWrite: false,
      canRead: false,
      message: `Exceção durante teste de persistência: ${err?.message || err}`,
      counts: { salesOrders: 0, nfeOrders: 0, transactions: 0, customers: 0, total: 0 }
    };
  }
};

export default supabase;
