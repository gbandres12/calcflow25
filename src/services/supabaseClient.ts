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

export const SUPABASE_SQL_SCHEMA = `-- ========================================================
-- SCRIPT DE BANCO DE DADOS - CALCÁRIOFLOW ERP (SUPABASE)
-- Copie e execute este script no "SQL Editor" do Supabase
-- ========================================================

-- 1. Cria a tabela unificada de registros e documentos
CREATE TABLE IF NOT EXISTS public.app_records (
  id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  company_id TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (table_name, company_id, id)
);

-- 2. Cria índices de alta velocidade para consultas por tabela e empresa
CREATE INDEX IF NOT EXISTS idx_app_records_lookup ON public.app_records(table_name, company_id);
CREATE INDEX IF NOT EXISTS idx_app_records_updated ON public.app_records(updated_at DESC);

-- 3. Habilita Row Level Security (RLS)
ALTER TABLE public.app_records ENABLE ROW LEVEL SECURITY;

-- 4. Cria política para permitir leitura e escrita pública com a chave anon
DROP POLICY IF EXISTS "Permissao publica app_records" ON public.app_records;
CREATE POLICY "Permissao publica app_records"
ON public.app_records
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);
`;

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
    // 1. Testar Gravação (Upsert)
    const { error: writeError } = await client
      .from('app_records')
      .upsert([{
        id: testId,
        table_name: '__diagnostic_probe__',
        company_id: 'probe',
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
      .eq('table_name', '__diagnostic_probe__');

    const latencyMs = Math.round(performance.now() - startTime);

    // 4. Buscar contagem de registros das áreas de negócio
    let salesOrders = 0;
    let nfeOrders = 0;
    let transactions = 0;
    let customers = 0;
    let total = 0;

    const { data: allRecords } = await client
      .from('app_records')
      .select('table_name, data');

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
