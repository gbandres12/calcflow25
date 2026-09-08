import React, { useState, useEffect } from 'react';
import { FiscalConfig, Company, View } from '../types';
import { fiscalService } from '../services/fiscalService';
import { 
  Building2, Sliders, Globe, ShieldCheck, Save, CheckCircle2, 
  AlertCircle, RefreshCw, Key, MapPin, Search, Phone, Mail, 
  Sparkles, Layers, FileText, ArrowRight, Eye, ExternalLink, Check, FileCheck,
  Database, HardDrive, ShieldAlert, Code2, Server
} from 'lucide-react';
import { CompanyFiscalSettingsModal } from './CompanyFiscalSettingsModal';
import { DatabaseStatusModal } from './DatabaseStatusModal';
import { fetchAddressByCep, formatCep, fetchIbgeByCityUf } from '../services/cepService';
import { 
  getSupabaseConfig, 
  testSupabaseConnection, 
  testSupabasePersistence,
  isSupabaseConfigured,
  SUPABASE_SQL_SCHEMA
} from '../services/supabaseClient';

interface FiscalConfigViewProps {
  company: Company;
  companyId?: string;
  onNavigate?: (view: View) => void;
}

export const FiscalConfigView: React.FC<FiscalConfigViewProps> = ({
  company,
  companyId,
  onNavigate
}) => {
  const [config, setConfig] = useState<FiscalConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Abas dentro de Configuração de Nota Fiscal: 'emitente' | 'api' | 'tributacao' | 'diagnostico'
  const [activeTab, setActiveTab] = useState<'emitente' | 'api' | 'tributacao' | 'diagnostico'>('emitente');
  
  const [sefazStatus, setSefazStatus] = useState<{ status: string; mensagem: string; loading: boolean } | null>(null);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [cepStatus, setCepStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [cepMessage, setCepMessage] = useState('');

  // Painel de Diagnóstico e Logs da API
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<Array<{ time: string; type: 'info' | 'success' | 'warning' | 'error'; message: string; data?: any }>>([]);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [showDatabaseModal, setShowDatabaseModal] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<{ ok: boolean; message: string; configured: boolean } | null>(null);

  useEffect(() => {
    fiscalService.getConfig(companyId).then(c => {
      setConfig(c);
      checkSefazStatus(c);
      checkSupabaseHealth();
    });
  }, [companyId]);

  const checkSupabaseHealth = async () => {
    const configured = isSupabaseConfigured();
    if (!configured) {
      setSupabaseStatus({
        ok: false,
        configured: false,
        message: 'Variáveis VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não detectadas (Operando em Cache Local).'
      });
      return;
    }
    try {
      const res = await testSupabaseConnection();
      setSupabaseStatus({
        ok: res.ok && res.tableExists,
        configured: true,
        message: res.message
      });
    } catch {
      setSupabaseStatus({
        ok: false,
        configured: true,
        message: 'Falha ao testar conexão com o banco Supabase.'
      });
    }
  };

  const checkSefazStatus = async (overrideCfg?: FiscalConfig) => {
    setSefazStatus({ status: 'checking', mensagem: 'Consultando status da SEFAZ...', loading: true });
    try {
      const res = await fiscalService.consultarStatusSefaz(overrideCfg || config || undefined);
      setSefazStatus({ status: res.status, mensagem: res.mensagem, loading: false });
    } catch {
      setSefazStatus({ status: 'offline', mensagem: 'Não foi possível consultar a SEFAZ.', loading: false });
    }
  };

  const handleCepLookup = async (cepToSearch: string) => {
    const cleanCep = (cepToSearch || '').replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      setCepStatus('error');
      setCepMessage('CEP deve ter 8 dígitos');
      return;
    }

    setIsLoadingCep(true);
    setCepStatus('idle');
    setCepMessage('Buscando endereço via ViaCEP...');

    try {
      const data = await fetchAddressByCep(cleanCep);
      if (data && !data.erro) {
        let ibge = data.ibge || '';
        if (!ibge && data.localidade && data.uf) {
          ibge = (await fetchIbgeByCityUf(data.localidade, data.uf)) || '';
        }

        setConfig(prev => prev ? ({
          ...prev,
          cepEmitente: formatCep(cleanCep),
          logradouroEmitente: data.logradouro || prev.logradouroEmitente,
          bairroEmitente: data.bairro || prev.bairroEmitente,
          cidadeEmitente: data.localidade || prev.cidadeEmitente,
          ufEmitente: data.uf || prev.ufEmitente,
          ibgeEmitente: ibge || prev.ibgeEmitente
        }) : prev);

        setCepStatus('success');
        setCepMessage(`Localizado: ${data.localidade}/${data.uf} (IBGE: ${ibge || 'Consulte'})`);
      } else {
        setCepStatus('error');
        setCepMessage('CEP não localizado.');
      }
    } catch {
      setCepStatus('error');
      setCepMessage('Erro ao consultar CEP.');
    } finally {
      setIsLoadingCep(false);
    }
  };

  const addLog = (type: 'info' | 'success' | 'warning' | 'error', message: string, data?: any) => {
    const time = new Date().toLocaleTimeString('pt-BR');
    setDiagnosticLogs(prev => [...prev, { time, type, message, data }]);
  };

  const handleRunDiagnostic = async () => {
    if (!config) return;
    setIsTestingApi(true);
    setDiagnosticLogs([]);
    setShowDiagnostics(true);

    addLog('info', '🚀 Iniciando Diagnóstico Completo: Supabase (Banco) + SEFAZ / NotaAs (API Fiscal)...');
    
    // 1. Diagnóstico do Supabase
    addLog('info', '📦 [1/2] Verificando integração com o banco Supabase...');
    const configured = isSupabaseConfigured();
    if (!configured) {
      addLog('warning', '⚠️ Supabase não configurado nas variáveis de ambiente. O ERP está operando com cache local e persistência no navegador.');
    } else {
      addLog('info', '🔑 Variáveis do Supabase detectadas. Testando conexão com PostgreSQL...');
      try {
        const conn = await testSupabaseConnection();
        if (conn.ok && conn.tableExists) {
          addLog('success', '✅ Supabase Conectado! Tabela "app_records" ativa e acessível.');
          const pers = await testSupabasePersistence();
          if (pers.ok) {
            addLog('success', `💾 Persistência em Nuvem OK (${pers.latencyMs}ms): ${pers.counts.salesOrders} pedidos, ${pers.counts.nfeOrders} notas autorizadas.`);
          } else {
            addLog('warning', `⚠️ Teste de persistência: ${pers.message}`);
          }
        } else if (conn.ok && !conn.tableExists) {
          addLog('warning', '⚠️ Supabase conectado, mas a tabela "app_records" ainda não foi criada. Copie o script SQL e rode no SQL Editor.');
        } else {
          addLog('error', `❌ Falha ao conectar ao Supabase: ${conn.message}`);
        }
      } catch (e: any) {
        addLog('error', `❌ Erro inesperado no teste do Supabase: ${e?.message || e}`);
      }
    }

    // 2. Diagnóstico da API Fiscal / SEFAZ
    addLog('info', '🏛️ [2/2] Verificando integração com o provedor fiscal NotaAs e SEFAZ...');
    addLog('info', `📌 Provedor: ${(config.apiProvider || 'notaas').toUpperCase()} | Modo: ${config.modoEmissao === 'api_real' ? 'API REAL (SEFAZ)' : 'SIMULAÇÃO LOCAL (SANDBOX)'}`);
    addLog('info', `🌐 Ambiente SEFAZ: ${config.environment.toUpperCase()}`);

    const apiKey = (config.apiKey || '').trim();
    if (!apiKey && config.modoEmissao === 'api_real') {
      addLog('warning', '⚠️ Project Key não informada. Para emissão real na SEFAZ, insira a chave fornecida pela NotaAs (ntaas_...).');
    } else if (apiKey) {
      addLog('info', `🔑 Chave NotaAs identificada: ${apiKey.substring(0, 8)}... (${apiKey.length} caracteres)`);
    }

    try {
      const res = await fiscalService.consultarStatusSefaz(config);
      if (res.success) {
        addLog('success', `✅ SEFAZ respondeu com sucesso: ${res.status.toUpperCase()} — ${res.mensagem}`, res);
      } else {
        addLog('error', `❌ Resposta da SEFAZ / API Fiscal: ${res.mensagem}`, res);
      }
    } catch (err: any) {
      addLog('error', `❌ Exceção ao consultar status da SEFAZ: ${err.message}`, err);
    } finally {
      setIsTestingApi(false);
      checkSupabaseHealth();
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setIsSaving(true);
    try {
      await fiscalService.saveConfig(config, companyId);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  if (!config) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="animate-spin text-purple-400" size={24} />
          <span>Carregando parâmetros de emissão fiscal...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header com Identificação e Botões Rápidos */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 rounded-xl text-purple-400">
                <Sliders size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Configuração de Nota Fiscal</h1>
                <p className="text-sm text-slate-400">
                  Gerenciamento de parâmetros de emissão de NF-e (Modelo 55), dados da empresa emitente, regras tributárias e integração com a SEFAZ.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('fiscal')}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-semibold transition-all shadow-sm"
              >
                <FileCheck size={16} className="text-emerald-400" />
                <span>Ver Notas Fiscais Emitidas</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => checkSefazStatus(config)}
              disabled={sefazStatus?.loading}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                sefazStatus?.status === 'online'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
              }`}
            >
              <RefreshCw size={14} className={sefazStatus?.loading ? 'animate-spin' : ''} />
              <span>SEFAZ: {sefazStatus?.status === 'online' ? 'Online / Operacional' : 'Simulação / Homologação'}</span>
            </button>

            <button
              onClick={handleSaveConfig}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50"
            >
              {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
              <span>{isSaving ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </div>

        {/* Mensagem de Feedback ao Salvar */}
        {saveSuccess && (
          <div className="mt-4 p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <span>Configurações fiscais salvas com sucesso! Os novos parâmetros já estão ativos para as próximas emissões.</span>
          </div>
        )}

        {/* Resumo Rápido dos Parâmetros Atuais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800">
          <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-1">
              <Building2 size={14} className="text-purple-400" />
              <span>EMPRESA EMISSORA</span>
            </div>
            <div className="text-sm font-bold text-white truncate">{config.razaoSocial || company.name}</div>
            <div className="text-xs text-slate-400">CNPJ: {config.cnpjEmitente || company.document || 'Não informado'}</div>
          </div>

          <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-1">
              <Key size={14} className="text-amber-400" />
              <span>INTEGRAÇÃO NOTAAS API</span>
            </div>
            <div className="text-sm font-bold text-white">
              {config.apiKey ? 'Chave Configurada' : 'Simulação Ativa'}
            </div>
            <div className="text-xs text-slate-400">
              Modo: {config.modoEmissao === 'api_real' ? 'Transmissão Real' : 'Simulação'} • {config.environment === 'production' ? 'Produção' : 'Homologação'}
            </div>
          </div>

          <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-1">
              <FileText size={14} className="text-emerald-400" />
              <span>NUMERAÇÃO NF-E</span>
            </div>
            <div className="text-sm font-bold text-white">Série {config.serieNFe || '1'} • Próx: Nº {config.proxNumeroNFe || 1}</div>
            <div className="text-xs text-slate-400">Modelo 55 (NF-e Eletrônica)</div>
          </div>

          <div className="p-3.5 bg-slate-800/40 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-1">
              <MapPin size={14} className="text-blue-400" />
              <span>LOCALIDADE FISCAL</span>
            </div>
            <div className="text-sm font-bold text-white truncate">
              {config.cidadeEmitente || 'Rurópolis'} - {config.ufEmitente || 'PA'}
            </div>
            <div className="text-xs text-slate-400">IBGE: {config.ibgeEmitente || '1506195'}</div>
          </div>
        </div>
      </div>

      {/* Navegação de Abas Internas */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('emitente')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === 'emitente'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Building2 size={16} />
          <span>Empresa Emitente</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('api')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === 'api'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Key size={16} />
          <span>Integração NotaAs API</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tributacao')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === 'tributacao'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <FileText size={16} />
          <span>Tributação & CFOPs</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('diagnostico')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === 'diagnostico'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Sparkles size={16} />
          <span>Diagnóstico & SEFAZ</span>
        </button>

        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setShowCompanyModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition-all"
          >
            <Building size={14} className="text-purple-400" />
            <span>Assistente de Cadastro da Empresa</span>
          </button>
        </div>
      </div>

      {/* Formulário Principal de Configuração */}
      <form onSubmit={handleSaveConfig}>
        {/* ABA 1: EMPRESA EMITENTE */}
        {activeTab === 'emitente' && (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Building2 size={18} className="text-purple-400" />
                  Identificação da Empresa Emitente
                </h3>
                <p className="text-xs text-slate-400">
                  Dados fiscais obrigatórios exigidos no Grupo C da NF-e Modelo 55 (Emitente).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCompanyModal(true)}
                className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition-all"
              >
                Editar no Assistente
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">RAZÃO SOCIAL (xNome)</label>
                <input
                  type="text"
                  value={config.razaoSocial || ''}
                  onChange={e => setConfig({ ...config, razaoSocial: e.target.value })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-medium"
                  placeholder="Ex: CBA MINERAÇÃO E COMÉRCIO DE CALCÁRIO E BRITA LTDA"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">NOME FANTASIA (xFant)</label>
                <input
                  type="text"
                  value={config.nomeFantasia || ''}
                  onChange={e => setConfig({ ...config, nomeFantasia: e.target.value })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                  placeholder="Ex: CBA Mineração"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">CNPJ DO EMITENTE</label>
                <input
                  type="text"
                  value={config.cnpjEmitente || ''}
                  onChange={e => setConfig({ ...config, cnpjEmitente: e.target.value })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                  placeholder="00.000.000/0000-00"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">INSCRIÇÃO ESTADUAL (IE)</label>
                <input
                  type="text"
                  value={config.inscricaoEstadual || ''}
                  onChange={e => setConfig({ ...config, inscricaoEstadual: e.target.value })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                  placeholder="15.000.000-0"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">REGIME TRIBUTÁRIO (CRT)</label>
                <select
                  value={config.regimeTributario}
                  onChange={e => setConfig({ ...config, regimeTributario: e.target.value as any })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="1">1 - Simples Nacional</option>
                  <option value="2">2 - Simples Nacional - Excesso de Sublimite</option>
                  <option value="3">3 - Regime Normal (Lucro Presumido / Real)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">CNAE PRINCIPAL</label>
                <input
                  type="text"
                  value={config.cnae || ''}
                  onChange={e => setConfig({ ...config, cnae: e.target.value })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                  placeholder="0810-0/04 - Extração de calcário e dolomita"
                />
              </div>
            </div>

            {/* Endereço Fiscal com Busca por CEP */}
            <div className="pt-6 border-t border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <MapPin size={16} className="text-purple-400" />
                    Endereço Fiscal do Estabelecimento (enderEmit)
                  </h4>
                  <p className="text-xs text-slate-400">
                    O código IBGE e os dados do endereço são validados pela SEFAZ de origem.
                  </p>
                </div>
              </div>

              {/* CEP Lookup Bar */}
              <div className="p-3 bg-purple-950/20 border border-purple-500/20 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 flex items-center gap-2">
                  <Search size={16} className="text-purple-400 shrink-0" />
                  <input
                    type="text"
                    value={config.cepEmitente || ''}
                    onChange={e => setConfig({ ...config, cepEmitente: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCepLookup(config.cepEmitente || '');
                      }
                    }}
                    placeholder="Digite o CEP (Ex: 68180-000) e pressione Enter ou Buscar"
                    className="w-full bg-transparent border-none text-sm text-white focus:outline-none placeholder-slate-500 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleCepLookup(config.cepEmitente || '')}
                  disabled={isLoadingCep}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all shrink-0"
                >
                  {isLoadingCep ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                  <span>Buscar CEP</span>
                </button>
              </div>

              {cepMessage && (
                <div className={`text-xs p-2 rounded-lg ${cepStatus === 'success' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                  {cepMessage}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">LOGRADOURO</label>
                  <input
                    type="text"
                    value={config.logradouroEmitente || ''}
                    onChange={e => setConfig({ ...config, logradouroEmitente: e.target.value })}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                    placeholder="Ex: Rodovia BR-230 Transamazônica, Km 45"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">NÚMERO</label>
                  <input
                    type="text"
                    value={config.numeroEmitente || ''}
                    onChange={e => setConfig({ ...config, numeroEmitente: e.target.value })}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                    placeholder="S/N ou Nº"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">BAIRRO</label>
                  <input
                    type="text"
                    value={config.bairroEmitente || ''}
                    onChange={e => setConfig({ ...config, bairroEmitente: e.target.value })}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                    placeholder="Ex: Zona Rural / Distrito Industrial"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">MUNICÍPIO (xMun)</label>
                  <input
                    type="text"
                    value={config.cidadeEmitente || ''}
                    onChange={e => setConfig({ ...config, cidadeEmitente: e.target.value })}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                    placeholder="Ex: Rurópolis"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">UF</label>
                  <input
                    type="text"
                    value={config.ufEmitente || ''}
                    onChange={e => setConfig({ ...config, ufEmitente: e.target.value.toUpperCase() })}
                    maxLength={2}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono text-center"
                    placeholder="PA"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">CÓDIGO IBGE DO MUNICÍPIO (cMun)</label>
                  <input
                    type="text"
                    value={config.ibgeEmitente || ''}
                    onChange={e => setConfig({ ...config, ibgeEmitente: e.target.value })}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                    placeholder="Ex: 1506195 (Rurópolis/PA)"
                  />
                </div>
              </div>
            </div>

            {/* Contato do Emitente */}
            <div className="pt-6 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">TELEFONE DE CONTATO</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3.5 top-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={config.telefoneEmitente || ''}
                    onChange={e => setConfig({ ...config, telefoneEmitente: e.target.value })}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                    placeholder="(93) 99123-4567"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">E-MAIL FISCAL / XML</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3.5 top-3.5 text-slate-500" />
                  <input
                    type="email"
                    value={config.emailEmitente || ''}
                    onChange={e => setConfig({ ...config, emailEmitente: e.target.value })}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                    placeholder="fiscal@cbamineracao.com.br"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: INTEGRAÇÃO NOTAAS API */}
        {activeTab === 'api' && (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Key size={18} className="text-amber-400" />
                Parâmetros da API NotaAs & Conectividade SEFAZ
              </h3>
              <p className="text-xs text-slate-400">
                Configure a chave de projeto (`ntaas_...`) para comunicação direta com a SEFAZ ou ative o modo simulação para testes.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">PROVEDOR DA API FISCAL</label>
                <select
                  value={config.apiProvider || 'notaas'}
                  onChange={e => setConfig({ ...config, apiProvider: e.target.value as any })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="notaas">NotaAs API (Recomendado - Suporte NF-e 55 & Danfe)</option>
                  <option value="focusnfe">Focus NFe</option>
                  <option value="nuvemfiscal">Nuvem Fiscal</option>
                  <option value="custom">API Personalizada / Webhook Próprio</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">MODO DE OPERAÇÃO DO SISTEMA</label>
                <select
                  value={config.modoEmissao || 'sandbox_local'}
                  onChange={e => setConfig({ ...config, modoEmissao: e.target.value as any })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="api_real">🚀 API Real (Transmissão Direta com a SEFAZ)</option>
                  <option value="sandbox_local">🧪 Modo Simulação / Sandbox Local (Geração Imediata de Chave e DANFE)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">AMBIENTE SEFAZ</label>
                <select
                  value={config.environment}
                  onChange={e => setConfig({ ...config, environment: e.target.value as any })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="production">Produção (Validade Jurídica e Fiscal Real)</option>
                  <option value="sandbox">Homologação / Testes (Ambiente de Testes da SEFAZ)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">URL BASE DA API</label>
                <input
                  type="text"
                  value={config.apiBaseUrl || 'https://platform.notaas.com.br/api/v1'}
                  onChange={e => setConfig({ ...config, apiBaseUrl: e.target.value })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                  placeholder="https://platform.notaas.com.br/api/v1"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-400 mb-1.5">
                  PROJECT API KEY (Chave de Autenticação NotaAs)
                </label>
                <div className="relative">
                  <Key size={16} className="absolute left-3.5 top-3.5 text-amber-500" />
                  <input
                    type="password"
                    value={config.apiKey || ''}
                    onChange={e => setConfig({ ...config, apiKey: e.target.value })}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                    placeholder="ntaas_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Obtenha a chave de projeto no painel oficial da NotaAs (`https://platform.notaas.com.br`).
                </p>
              </div>
            </div>

            {/* Teste de Conexão Rápido */}
            <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-white">Testar Conectividade com a SEFAZ</div>
                <div className="text-xs text-slate-400">
                  Realiza um ping de status nos servidores da SEFAZ pelo proxy do CalcárioFlow.
                </div>
              </div>
              <button
                type="button"
                onClick={() => checkSefazStatus(config)}
                disabled={sefazStatus?.loading}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0"
              >
                <RefreshCw size={14} className={sefazStatus?.loading ? 'animate-spin' : ''} />
                <span>Testar Conexão Agora</span>
              </button>
            </div>
          </div>
        )}

        {/* ABA 3: TRIBUTAÇÃO & CFOPS */}
        {activeTab === 'tributacao' && (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText size={18} className="text-emerald-400" />
                Parâmetros Tributários, Numeração & CFOPs Padrão
              </h3>
              <p className="text-xs text-slate-400">
                Regras de enquadramento fiscal para mineração, venda de calcário agrícola e transferências internas.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">SÉRIE DA NF-E</label>
                <input
                  type="text"
                  value={config.serieNFe || '1'}
                  onChange={e => setConfig({ ...config, serieNFe: e.target.value })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono text-center"
                  placeholder="1"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">PRÓXIMO NÚMERO SEQUENCIAL</label>
                <input
                  type="number"
                  value={config.proxNumeroNFe || 1}
                  onChange={e => setConfig({ ...config, proxNumeroNFe: parseInt(e.target.value) || 1 })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono font-bold"
                  placeholder="6923"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">CST ICMS PADRÃO</label>
                <input
                  type="text"
                  value={config.cstIcmsPadrao || '40'}
                  onChange={e => setConfig({ ...config, cstIcmsPadrao: e.target.value })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono text-center"
                  placeholder="40 (Isenta)"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-400 mb-1.5">NATUREZA DE OPERAÇÃO PADRÃO (natOp)</label>
                <input
                  type="text"
                  value={config.naturezaOperacaoPadrao || 'Venda de Producao do Estabelecimento'}
                  onChange={e => setConfig({ ...config, naturezaOperacaoPadrao: e.target.value })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                  placeholder="Venda de Produção do Estabelecimento"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">CFOP VENDA INTERNA (ESTADUAL - PA)</label>
                <input
                  type="text"
                  value={config.cfopPadraoEstadual || '5101'}
                  onChange={e => setConfig({ ...config, cfopPadraoEstadual: e.target.value })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono text-center"
                  placeholder="5101"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">CFOP VENDA INTERESTADUAL</label>
                <input
                  type="text"
                  value={config.cfopPadraoInterestadual || '6101'}
                  onChange={e => setConfig({ ...config, cfopPadraoInterestadual: e.target.value })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono text-center"
                  placeholder="6101"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">CFOP TRANSFERÊNCIA (SANTARÉM / MATRIZ)</label>
                <input
                  type="text"
                  value={config.cfopTransferenciaEstadual || '5152'}
                  onChange={e => setConfig({ ...config, cfopTransferenciaEstadual: e.target.value })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono text-center"
                  placeholder="5152"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">CST PIS/COFINS</label>
                <input
                  type="text"
                  value={config.cstPisCofins || '08'}
                  onChange={e => setConfig({ ...config, cstPisCofins: e.target.value })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono text-center"
                  placeholder="08 (Sem Incidência)"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">ALÍQUOTA PIS (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={config.aliquotaPis || 0}
                  onChange={e => setConfig({ ...config, aliquotaPis: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono text-center"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">ALÍQUOTA COFINS (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={config.aliquotaCofins || 0}
                  onChange={e => setConfig({ ...config, aliquotaCofins: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono text-center"
                  placeholder="0.00"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-400 mb-1.5">
                  INFORMAÇÕES COMPLEMENTARES DE INTERESSE DO CONTRIBUINTE (infCpl)
                </label>
                <textarea
                  rows={3}
                  value={config.observacoesFiscaisPadrao || ''}
                  onChange={e => setConfig({ ...config, observacoesFiscaisPadrao: e.target.value })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                  placeholder="Isenção de ICMS conforme Convênio ICMS 100/97 e Legislação Estadual do Pará para Calcário Agrícola."
                />
                <p className="text-xs text-slate-500 mt-1">
                  Este texto sairá impresso no rodapé do DANFE em todas as notas fiscais emitidas.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ABA 4: DIAGNÓSTICO & BANCO SUPABASE */}
        {activeTab === 'diagnostico' && (
          <div className="space-y-6">
            
            {/* Grid com os 2 Pilares: Banco de Dados Supabase vs Transmissão Fiscal SEFAZ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Pilar 1: Supabase (Persistência em Nuvem) */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <Database size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        Banco de Dados Supabase (PostgreSQL)
                      </h4>
                      <p className="text-xs text-slate-400">Armazenamento seguro de cadastros, pedidos e notas</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                    supabaseStatus?.ok 
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : supabaseStatus?.configured
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {supabaseStatus?.ok ? 'Supabase Ativo' : supabaseStatus?.configured ? 'Tabela Pendente' : 'Cache Local'}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {supabaseStatus?.message || 'Diagnóstico do banco em andamento...'}
                </p>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-400">
                    <span>Tabela de Registros:</span>
                    <span className="font-mono text-slate-200">public.app_records</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Sincronização Fiscal:</span>
                    <span className="text-emerald-400 font-semibold">Automática (Pedidos & CFOP)</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Webhook NotaAs:</span>
                    <span className="font-mono text-slate-200">/api/webhooks/notaas</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDatabaseModal(true)}
                    className="flex-1 py-2.5 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    <Database size={14} /> Abrir Diagnóstico Supabase
                  </button>
                </div>
              </div>

              {/* Pilar 2: Provedor Fiscal & SEFAZ */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                      <Globe size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        Transmissão Fiscal SEFAZ (API NotaAs)
                      </h4>
                      <p className="text-xs text-slate-400">Mensageria tributária e autorização de NF-e</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                    config.modoEmissao === 'api_real'
                      ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                      : 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                  }`}>
                    {config.modoEmissao === 'api_real' ? 'API Real (SEFAZ)' : 'Simulação (Sandbox)'}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {config.modoEmissao === 'api_real'
                    ? (config.apiKey ? 'Chave de API configurada. Transmitindo diretamente para a SEFAZ.' : 'Atenção: Modo API Real ativo, mas a Project Key (ntaas_...) não foi preenchida.')
                    : 'Modo Simulação Local ativo: permite emitir, testar o fluxo de vendas e gerar DANFEs de demonstração sem cobranças.'}
                </p>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-400">
                    <span>Ambiente Fiscal:</span>
                    <span className="font-bold text-slate-200">{config.environment.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Status do Serviço SEFAZ:</span>
                    <span className={sefazStatus?.status === 'online' ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                      {sefazStatus?.mensagem || 'Aguardando teste...'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Próximo Número NF-e:</span>
                    <span className="font-mono text-slate-200">Nº {config.proxNumeroNFe || 1} / Série {config.serieNFe || 1}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('api')}
                    className="flex-1 py-2.5 px-3 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    <Key size={14} /> Configurar Project Key
                  </button>
                </div>
              </div>

            </div>

            {/* Painel do Terminal de Logs e Ações */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles size={18} className="text-purple-400" />
                    Terminal Unificado de Diagnóstico Fiscal & Banco
                  </h3>
                  <p className="text-xs text-slate-400">
                    Testa a integridade da persistência PostgreSQL no Supabase e a comunicação com o endpoint da SEFAZ.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRunDiagnostic}
                  disabled={isTestingApi}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md"
                >
                  <RefreshCw size={14} className={isTestingApi ? 'animate-spin' : ''} />
                  <span>{isTestingApi ? 'Executando Teste...' : 'Executar Diagnóstico Completo'}</span>
                </button>
              </div>

              {/* Terminal de Logs */}
              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-xs space-y-2 max-h-[350px] overflow-y-auto shadow-inner">
                <div className="text-slate-500 border-b border-slate-800 pb-2 flex items-center justify-between">
                  <span>TERMINAL FISCAL & SUPABASE — CALCÁRIOFLOW ERP</span>
                  <span>STATUS: {isTestingApi ? 'TESTANDO...' : 'PRONTO'}</span>
                </div>

                {diagnosticLogs.length === 0 ? (
                  <div className="text-slate-500 py-6 text-center">
                    Clique em &quot;Executar Diagnóstico Completo&quot; para iniciar o teste de comunicação de ambos os serviços.
                  </div>
                ) : (
                  diagnosticLogs.map((log, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <span className="text-slate-500 shrink-0">[{log.time}]</span>
                      <span className={
                        log.type === 'success' ? 'text-emerald-400' :
                        log.type === 'error' ? 'text-red-400' :
                        log.type === 'warning' ? 'text-amber-400' : 'text-slate-300'
                      }>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* Rodapé de Ação com Botão Salvar */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-800/80 mt-6">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-purple-400" />
            <span>As configurações são aplicadas instantaneamente para todas as emissões da empresa.</span>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50"
          >
            {isSaving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
            <span>{isSaving ? 'Salvando Configurações...' : 'Salvar Todas as Configurações'}</span>
          </button>
        </div>
      </form>

      {/* Modal Assistente de Cadastro da Empresa */}
      <CompanyFiscalSettingsModal
        isOpen={showCompanyModal}
        onClose={() => setShowCompanyModal(false)}
        initialConfig={config}
        onSave={(updatedConfig) => {
          setConfig(updatedConfig);
          setShowCompanyModal(false);
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        }}
      />

      {/* Modal de Diagnóstico do Supabase & SQL Schema */}
      <DatabaseStatusModal
        isOpen={showDatabaseModal}
        onClose={() => {
          setShowDatabaseModal(false);
          checkSupabaseHealth();
        }}
      />
    </div>
  );
};
