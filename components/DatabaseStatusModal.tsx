import React, { useState, useEffect } from 'react';
import { 
  Database, CheckCircle2, AlertTriangle, Copy, Check, 
  ExternalLink, RefreshCw, Sparkles, X, ShieldAlert, Code2 
} from 'lucide-react';
import { 
  getSupabaseConfig, 
  testSupabaseConnection, 
  SUPABASE_SQL_SCHEMA,
  isSupabaseConfigured 
} from '../services/supabaseClient';

interface DatabaseStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DatabaseStatusModal: React.FC<DatabaseStatusModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{
    ok: boolean;
    tableExists: boolean;
    message: string;
    url?: string;
  } | null>(null);

  const config = getSupabaseConfig();

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await testSupabaseConnection();
      setStatus(res);
    } catch (e: any) {
      setStatus({
        ok: false,
        tableExists: false,
        message: `Falha ao testar conexão: ${e?.message || e}`
      });
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runTest();
    }
  }, [isOpen]);

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl text-slate-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Conexão Supabase & Banco de Dados
              </h2>
              <p className="text-xs text-slate-400">
                Diagnóstico de persistência em nuvem e sincronização
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* Status Card */}
          <div className={`p-4 rounded-2xl border ${
            status?.ok && status?.tableExists 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : status?.ok && !status?.tableExists
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}>
            <div className="flex items-start gap-3">
              {testing ? (
                <RefreshCw size={20} className="animate-spin text-slate-400 shrink-0 mt-0.5" />
              ) : status?.ok && status?.tableExists ? (
                <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm">
                  {testing 
                    ? 'Testando conexão com o Supabase...' 
                    : status?.ok && status?.tableExists
                    ? 'Supabase Conectado e Operando!'
                    : status?.ok && !status?.tableExists
                    ? 'Supabase Conectado • Tabela precisa ser criada'
                    : 'Atenção com as variáveis do Supabase'}
                </div>
                <p className="text-xs opacity-90 leading-relaxed">
                  {status?.message || 'Aguardando diagnóstico...'}
                </p>
              </div>
              <button
                onClick={runTest}
                disabled={testing}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg text-white flex items-center gap-1.5 transition shrink-0"
              >
                <RefreshCw size={12} className={testing ? 'animate-spin' : ''} />
                Testar Novamente
              </button>
            </div>
          </div>

          {/* Configuration details */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Variáveis Detectadas no Ambiente
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800/80">
                <span className="text-slate-400 font-mono">VITE_SUPABASE_URL</span>
                <span className="font-mono text-slate-200 truncate max-w-[280px]">
                  {config.url ? config.url : <span className="text-red-400">Não encontrada</span>}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800/80">
                <span className="text-slate-400 font-mono">VITE_SUPABASE_ANON_KEY</span>
                <span className="font-mono text-slate-200">
                  {config.hasKey ? (
                    <span className="text-emerald-400">Configurada ({config.keyPrefix})</span>
                  ) : (
                    <span className="text-red-400">Não configurada</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* SQL Editor Step by Step */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Code2 size={16} className="text-purple-400" />
                  Script SQL para criar as tabelas no Supabase
                </h3>
                <p className="text-xs text-slate-400">
                  Se a tabela ainda não existe no Supabase, execute este script no <strong>SQL Editor</strong> do Supabase:
                </p>
              </div>
              <button
                onClick={handleCopySql}
                className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-purple-600/20"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copiado!' : 'Copiar SQL'}
              </button>
            </div>

            <pre className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-[11px] font-mono text-purple-200/90 overflow-x-auto max-h-44 scrollbar-thin">
              {SUPABASE_SQL_SCHEMA}
            </pre>
          </div>

          {/* Guia rápido */}
          <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/20 space-y-2">
            <h4 className="text-xs font-bold text-purple-300">Como executar no Supabase:</h4>
            <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>Acesse o painel do seu projeto no <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-purple-400 underline inline-flex items-center gap-0.5">Supabase <ExternalLink size={10} /></a>.</li>
              <li>No menu lateral esquerdo, clique no ícone <strong>SQL Editor</strong>.</li>
              <li>Clique em <strong>+ New Query</strong>, cole o código acima e clique em <strong>Run</strong> (ou aperte Ctrl+Enter).</li>
              <li>Pronto! Todas as empresas, usuários e dados do ERP passarão a salvar na nuvem instantaneamente.</li>
            </ol>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};

export default DatabaseStatusModal;
