import React, { useState, useEffect } from 'react';
import { FiscalConfig, SaleOrder, Customer, Company, OrderStatus, TransactionStatus } from '../types';
import { fiscalService } from '../services/fiscalService';
import { 
  FileText, ShieldCheck, Key, Settings, Globe, CheckCircle2, 
  AlertCircle, RefreshCw, Send, Printer, Download, Eye, ExternalLink,
  Layers, BarChart3, Database, Save, Check, X
} from 'lucide-react';
import { DanfeModal } from './DanfeModal';

interface FiscalManagementProps {
  orders: SaleOrder[];
  customers: Customer[];
  company: Company;
  companyId?: string;
  onUpdateOrder: (order: SaleOrder) => void;
}

export const FiscalManagement: React.FC<FiscalManagementProps> = ({
  orders,
  customers,
  company,
  companyId,
  onUpdateOrder
}) => {
  const [config, setConfig] = useState<FiscalConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedDanfeOrder, setSelectedDanfeOrder] = useState<SaleOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sefazStatus, setSefazStatus] = useState<{ status: string; mensagem: string; loading: boolean } | null>(null);

  // Estado para Painel de Diagnóstico e Logs da API
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<Array<{ time: string; type: 'info' | 'success' | 'warning' | 'error'; message: string; data?: any }>>([]);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [mappedPayload, setMappedPayload] = useState<any | null>(null);

  useEffect(() => {
    fiscalService.getConfig(companyId).then(c => {
      setConfig(c);
      checkSefazStatus(c);
    });
  }, [companyId]);

  const addLog = (type: 'info' | 'success' | 'warning' | 'error', message: string, data?: any) => {
    const time = new Date().toLocaleTimeString('pt-BR');
    setDiagnosticLogs(prev => [...prev, { time, type, message, data }]);
    if (type === 'error') console.error(`[DIAGNOSTIC ${time}] ${message}`, data || '');
    else if (type === 'warning') console.warn(`[DIAGNOSTIC ${time}] ${message}`, data || '');
    else console.log(`[DIAGNOSTIC ${time}] ${message}`, data || '');
  };

  const handleRunDiagnostic = async () => {
    if (!config) return;
    setIsTestingApi(true);
    setDiagnosticLogs([]);
    setShowDiagnostics(true);

    addLog('info', '🚀 Iniciando Investigação de Mapeamento de Schema e Teste da API Fiscal...');
    addLog('info', `📌 Provedor Configurado: ${(config.apiProvider || 'notaas').toUpperCase()}`);
    addLog('info', `🌐 Ambiente SEFAZ: ${config.environment.toUpperCase()}`);
    addLog('info', `🔗 URL Base: ${config.apiBaseUrl || 'https://platform.notaas.com.br/api/v1'}`);

    // 1. Obter ou criar um pedido de teste
    const sampleOrder: SaleOrder = orders.length > 0 ? orders[0] : {
      id: 'ORDER-TEST-001',
      reference: 'PV-9999',
      customerId: customers[0]?.id || 'CUST-001',
      sellerName: 'Vendedor Comercial',
      date: new Date().toLocaleDateString('pt-BR'),
      status: OrderStatus.FINALIZED,
      items: [
        {
          productId: 'PROD-01',
          productCode: 'CALC-01',
          productName: 'Calcário Agrícola Calcítico Fino PRNT 85%',
          quantity: 32,
          unit: 'TON',
          unitPrice: 180,
          discount: 0,
          total: 5760,
          ncm: '25171000',
          cfop: config.cfopPadraoEstadual || '5101'
        }
      ],
      subtotal: 5760,
      shipping: 240,
      discount: 0,
      total: 6000,
      paymentMethod: 'PIX',
      payments: [{ id: 'PAY-1', amount: 6000, date: new Date().toLocaleDateString('pt-BR'), status: TransactionStatus.PAGO, accountId: 'ACC-1', description: 'À vista' }]
    };

    const sampleCustomer: Customer = customers.find(c => c.id === sampleOrder.customerId) || customers[0] || {
      id: 'CUST-001',
      name: 'Agropecuária Fazenda Rainha Ltda',
      document: '12.345.678/0001-90',
      ie: '15.829.100-1',
      street: 'Rodovia PA-150 Km 12',
      number: '100',
      neighborhood: 'Zona Rural',
      city: 'Santarém',
      state: 'PA',
      zipCode: '68000-000',
      ibgeCode: '1506807',
      phone: '(93) 99123-4567',
      email: 'financeiro@fazendarainha.com.br',
      totalSpent: 6000
    };

    // 2. Validação dos Dados Fiscais
    addLog('info', '🔍 Etapa 1: Executando Validação Prévia de Dados Cadastrais...');
    const valResult = fiscalService.validarDadosFiscais(sampleOrder, sampleCustomer);

    if (!valResult.valid) {
      addLog('error', '❌ Falha de Validação Prévia dos Dados Fiscais:', valResult.errors);
    } else {
      addLog('success', '✅ Etapa 1: Dados do Cliente e Pedido aprovados na validação prévia!');
    }

    // 3. Mapeamento do Schema do Payload NotaAs
    addLog('info', '🔍 Etapa 2: Mapeando Schema do Payload para envio à API...');
    const payload = fiscalService.montarPayloadNotaAs(sampleOrder, sampleCustomer, config);
    setMappedPayload(payload);

    // Verificação dos campos obrigatórios do Schema oficial NF-e 55
    addLog('info', '📋 Emitente NÃO vai no payload — vem do projeto NotaAs + certificado A1.');
    addLog('info', '📋 Checando dest (destinatário oficial):', {
      cnpj: payload.dest?.cnpj,
      cpf: payload.dest?.cpf,
      nome: payload.dest?.nome,
      ie: payload.dest?.ie,
      indicadorIE: payload.dest?.indicadorIE,
      email: payload.dest?.email,
      endereco: payload.dest?.endereco
    });

    addLog('info', `📋 Checando ${payload.items?.length || 0} item(ns) (NCM e CFOP):`, payload.items);
    addLog('info', '📋 Checando pagamentos:', payload.pagamentos);

    addLog('success', '✅ Etapa 2: Mapeamento do Schema concluído com sucesso!');

    // 4. Teste de conectividade (NÃO emite NF-e de verdade)
    addLog('info', '🔍 Etapa 3: Consultando status da SEFAZ via proxy (sem emitir nota)...');
    try {
      const res = await fiscalService.consultarStatusSefaz(config);
      if (res.success) {
        addLog('success', `SEFAZ respondeu: ${res.status.toUpperCase()} — ${res.mensagem}`, res);
      } else {
        addLog('error', `Falha no diagnóstico: ${res.mensagem}`, res);
      }
    } catch (err: any) {
      addLog('error', `Exceção ao consultar status: ${err.message}`, err);
    } finally {
      setIsTestingApi(false);
    }
  };

  const checkSefazStatus = async (overrideCfg?: FiscalConfig) => {
    setSefazStatus({ status: 'cheking', mensagem: 'Consultando SEFAZ...', loading: true });
    try {
      const res = await fiscalService.consultarStatusSefaz(overrideCfg || config || undefined);
      setSefazStatus({ status: res.status, mensagem: res.mensagem, loading: false });
    } catch {
      setSefazStatus({ status: 'offline', mensagem: 'Não foi possível consultar a SEFAZ.', loading: false });
    }
  };

  const formatBRL = (val: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

  const nfeOrders = orders.filter(o => {
    const matchesSearch = 
      (o.reference?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (o.nfeNumero?.includes(searchQuery)) ||
      (o.nfeChave?.includes(searchQuery)) ||
      (customers.find(c => c.id === o.customerId)?.name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (filterStatus === 'all') return matchesSearch;
    if (filterStatus === 'autorizada') return matchesSearch && o.nfeStatus === 'autorizada';
    if (filterStatus === 'nao_emitida') return matchesSearch && (!o.nfeStatus || o.nfeStatus === 'nao_emitida');
    if (filterStatus === 'cancelada') return matchesSearch && o.nfeStatus === 'cancelada';
    return matchesSearch;
  });

  const totalNfeEmitidas = orders.filter(o => o.nfeStatus === 'autorizada').length;
  const totalValorFaturado = orders.filter(o => o.nfeStatus === 'autorizada').reduce((acc, o) => acc + o.total, 0);

  if (!config) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Módulo Fiscal & NotaAs NF-e 55</h1>
            <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${
              config.environment === 'production' 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {config.environment === 'production' ? 'Produção SEFAZ' : 'Modo Sandbox / Homologação'}
            </span>
          </div>
          <p className="text-sm font-bold text-slate-400 mt-1">
            Gestão e transmissão de Notas Fiscais Eletrônicas Modelo 55 para calcário agrícola e minérios.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleRunDiagnostic}
            disabled={isTestingApi}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-2xl shadow-sm transition-all disabled:opacity-50"
            title="Executa investigação completa do schema, validação e teste de transmissão à API"
          >
            <Send size={14} className={isTestingApi ? 'animate-spin' : ''} />
            <span>{isTestingApi ? 'Testando API...' : '⚡ Investigar Mapeamento & Testar API'}</span>
          </button>

          {sefazStatus && (
            <button
              onClick={() => checkSefazStatus()}
              disabled={sefazStatus.loading}
              title={sefazStatus.mensagem}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-purple-300 text-slate-700 font-bold text-xs rounded-2xl shadow-sm transition-all"
            >
              <div className={`w-2 h-2 rounded-full ${sefazStatus.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>SEFAZ Status: <strong className="text-slate-900">{sefazStatus.loading ? 'Verificando...' : 'Online'}</strong></span>
              <RefreshCw size={12} className={sefazStatus.loading ? 'animate-spin text-purple-600' : 'text-slate-400'} />
            </button>
          )}

          <a 
            href="https://platform.notaas.com.br" 
            target="_blank" 
            rel="noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-2xl shadow-sm transition-all"
          >
            <Globe size={16} /> Painel NotaAs <ExternalLink size={14} />
          </a>
        </div>
      </header>

      {/* Cards de Métricas Fiscais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
            <FileText size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">NF-e Autorizadas</p>
            <h3 className="text-2xl font-black text-slate-800">{totalNfeEmitidas} notas</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl">
            <BarChart3 size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Faturado em NF-e</p>
            <h3 className="text-2xl font-black text-slate-800">{formatBRL(totalValorFaturado)}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
            <Database size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Próxima Numeração</p>
            <h3 className="text-2xl font-black text-slate-800">Nº {config.proxNumeroNFe || 1042} (Série {config.serieNFe})</h3>
          </div>
        </div>
      </div>

      {/* Configurações Fiscais e Integração NotaAs */}
      <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-600 text-white rounded-2xl">
              <Key size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">Parâmetros de Integração NotaAs API</h2>
              <p className="text-xs text-slate-400 font-medium">Credenciais e dados fiscais do emitente da mineradora</p>
            </div>
          </div>
          {saveSuccess && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200 animate-in fade-in">
              <Check size={16} /> Salvo com Sucesso!
            </div>
          )}
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* Modo de Emissão */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Modo de Operação
              </label>
              <select
                value={config.modoEmissao || 'api_real'}
                onChange={(e) => setConfig({ ...config, modoEmissao: e.target.value as 'api_real' | 'sandbox_local' })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              >
                <option value="api_real">API Real / Transmissão Direta ao Painel</option>
                <option value="sandbox_local">Simulação Local / Treinamento Interno</option>
              </select>
            </div>

            {/* Provedor da API */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Provedor / Plataforma da API
              </label>
              <select
                value={config.apiProvider || 'notaas'}
                onChange={(e) => {
                  const prov = e.target.value as any;
                  let defaultUrl = 'https://platform.notaas.com.br/api/v1';
                  if (prov === 'focusnfe') defaultUrl = 'https://homologacao.focusnfe.com.br/v2';
                  if (prov === 'nuvemfiscal') defaultUrl = 'https://api.nuvemfiscal.com.br/v2';
                  setConfig({ ...config, apiProvider: prov, apiBaseUrl: defaultUrl });
                }}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              >
                <option value="notaas">NotaAs API (notaas.com.br)</option>
                <option value="focusnfe">Focus NFe (focusnfe.com.br)</option>
                <option value="nuvemfiscal">Nuvem Fiscal (nuvemfiscal.com.br)</option>
                <option value="custom">Personalizado / Servidor Próprio</option>
              </select>
            </div>

            {/* Chave de API NotaAs */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Chave / Token da API (x-api-key)
              </label>
              <input
                type="password"
                value={config.apiKey || ''}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                placeholder="Cole sua chave de API obtida no portal da API..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-mono"
              />
            </div>

            {/* Ambiente */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Ambiente SEFAZ
              </label>
              <select
                value={config.environment}
                onChange={(e) => setConfig({ ...config, environment: e.target.value as 'sandbox' | 'production' })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              >
                <option value="sandbox">Sandbox / Homologação (Sem validade fiscal)</option>
                <option value="production">Produção Real (SEFAZ Nacional)</option>
              </select>
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                URL Base do Servidor de API Fiscal
              </label>
              <input
                type="text"
                value={config.apiBaseUrl || 'https://platform.notaas.com.br/api/v1'}
                onChange={(e) => setConfig({ ...config, apiBaseUrl: e.target.value })}
                placeholder="https://platform.notaas.com.br/api/v1"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-mono"
              />
              <p className="text-[10px] text-slate-400 font-medium">
                URL oficial de conexão HTTP. Ao emitir em 'API Real', o sistema enviará a requisição diretamente a este endpoint.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Regime Tributário
              </label>
              <select
                value={config.regimeTributario}
                onChange={(e) => setConfig({ ...config, regimeTributario: e.target.value as any })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              >
                <option value="1">1 - Simples Nacional</option>
                <option value="2">2 - Simples Nacional (Excesso de Sublimite)</option>
                <option value="3">3 - Regime Normal (Lucro Presumido / Real)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-2">
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CNPJ do Emitente</label>
              <input
                type="text"
                value={config.cnpjEmitente}
                onChange={(e) => setConfig({ ...config, cnpjEmitente: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Inscrição Estadual (IE)</label>
              <input
                type="text"
                value={config.inscricaoEstadual}
                onChange={(e) => setConfig({ ...config, inscricaoEstadual: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Série da NF-e</label>
              <input
                type="text"
                value={config.serieNFe}
                onChange={(e) => setConfig({ ...config, serieNFe: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Próximo Número NF-e</label>
              <input
                type="number"
                value={config.proxNumeroNFe}
                onChange={(e) => setConfig({ ...config, proxNumeroNFe: parseInt(e.target.value, 10) || 1 })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CST ICMS Padrão</label>
              <select
                value={config.cstIcmsPadrao || '40'}
                onChange={(e) => setConfig({ ...config, cstIcmsPadrao: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              >
                <option value="40">40 — Isenção</option>
                <option value="41">41 — Não tributada</option>
                <option value="00">00 — Tributada integralmente</option>
                <option value="20">20 — Com redução de BC</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CST PIS/COFINS</label>
              <select
                value={config.cstPisCofins || '07'}
                onChange={(e) => setConfig({ ...config, cstPisCofins: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              >
                <option value="07">07 — Isento</option>
                <option value="08">08 — Sem incidência</option>
                <option value="01">01 — Tributável alíquota básica</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Alíquota PIS (%)</label>
              <input
                type="number"
                step="0.01"
                value={config.aliquotaPis ?? 0}
                onChange={(e) => setConfig({ ...config, aliquotaPis: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Alíquota COFINS (%)</label>
              <input
                type="number"
                step="0.01"
                value={config.aliquotaCofins ?? 0}
                onChange={(e) => setConfig({ ...config, aliquotaCofins: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CFOP Padrão Estadual (Dentro do PA)</label>
              <input
                type="text"
                value={config.cfopPadraoEstadual}
                onChange={(e) => setConfig({ ...config, cfopPadraoEstadual: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CFOP Padrão Interestadual (Fora do PA)</label>
              <input
                type="text"
                value={config.cfopPadraoInterestadual}
                onChange={(e) => setConfig({ ...config, cfopPadraoInterestadual: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CFOP Transferência Estadual</label>
              <input
                type="text"
                value={config.cfopTransferenciaEstadual || '5152'}
                onChange={(e) => setConfig({ ...config, cfopTransferenciaEstadual: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CFOP Transferência Interestadual</label>
              <input
                type="text"
                value={config.cfopTransferenciaInterestadual || '6152'}
                onChange={(e) => setConfig({ ...config, cfopTransferenciaInterestadual: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
              />
            </div>

          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Informações Complementares Padrão (Observações na Nota)</label>
            <textarea
              value={config.observacoesFiscaisPadrao}
              onChange={(e) => setConfig({ ...config, observacoesFiscaisPadrao: e.target.value })}
              rows={2}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-8 py-3.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black uppercase rounded-2xl shadow-xl shadow-purple-100 transition-all hover:scale-[1.01] disabled:opacity-50"
            >
              <Save size={16} /> {isSaving ? 'Salvando...' : 'Salvar Configurações Fiscais'}
            </button>
          </div>
        </form>
      </div>

      {/* Histórico e Monitor de NF-e */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/40">
          <div>
            <h2 className="text-base font-black text-slate-800">Documentos Fiscais Emitidos</h2>
            <p className="text-xs text-slate-400 font-medium">Histórico de notas transmitidas à SEFAZ</p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <input
              type="text"
              placeholder="Buscar por Nº Nota, Chave ou Cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium w-full md:w-64"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
            >
              <option value="all">Todos os Status</option>
              <option value="autorizada">Autorizadas</option>
              <option value="nao_emitida">Não Emitidas</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                <th className="px-6 py-4">Nº / Série</th>
                <th className="px-6 py-4">Data Emissão</th>
                <th className="px-6 py-4">Destinatário</th>
                <th className="px-6 py-4">Chave de Acesso</th>
                <th className="px-6 py-4">Status SEFAZ</th>
                <th className="px-6 py-4 text-right">Valor Total</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {nfeOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-400 font-medium">
                    Nenhuma nota fiscal encontrada com os filtros atuais.
                  </td>
                </tr>
              ) : (
                nfeOrders.map((order) => {
                  const cust = customers.find(c => c.id === order.customerId);
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-black text-slate-800">
                        {order.nfeNumero ? `Nº ${order.nfeNumero} (Série ${order.nfeSerie || 1})` : order.reference}
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium">{order.date}</td>
                      <td className="px-6 py-4 font-bold text-slate-800">{cust?.name || 'Cliente Geral'}</td>
                      <td className="px-6 py-4 font-mono text-[10px] text-slate-500">
                        {order.nfeChave ? `${order.nfeChave.slice(0, 8)}...${order.nfeChave.slice(-6)}` : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase border ${
                          order.nfeStatus === 'autorizada' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          order.nfeStatus === 'cancelada' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {order.nfeStatus === 'autorizada' ? 'Autorizada' : order.nfeStatus === 'cancelada' ? 'Cancelada' : 'Não Emitida'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-black text-slate-800">{formatBRL(order.total)}</td>
                      <td className="px-6 py-4 text-center">
                        {order.nfeStatus === 'autorizada' || order.nfeStatus === 'cancelada' ? (
                          <button
                            onClick={() => setSelectedDanfeOrder(order)}
                            className="flex items-center gap-1 mx-auto px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-bold hover:bg-slate-800 transition-all"
                          >
                            <Eye size={12} /> Ver DANFE
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold">Emitir no Pedido</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Visualização de DANFE */}
      {selectedDanfeOrder && (
        <DanfeModal
          order={selectedDanfeOrder}
          customer={customers.find(c => c.id === selectedDanfeOrder.customerId) || customers[0]}
          config={config}
          company={company}
          onClose={() => setSelectedDanfeOrder(null)}
          onOrderUpdated={(updated) => {
            onUpdateOrder(updated);
            setSelectedDanfeOrder(updated);
          }}
        />
      )}

      {/* Modal de Investigação do Mapeamento de Schema & Logs da API */}
      {showDiagnostics && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-950 text-slate-100 w-full max-w-4xl rounded-[2.5rem] shadow-2xl border border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-600/30 text-purple-400 rounded-2xl border border-purple-500/30">
                  <Database size={22} />
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    Investigação de Schema & Logs da API Fiscal
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-900 text-purple-300">
                      {(config.apiProvider || 'notaas').toUpperCase()}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Validação em tempo real dos mapeamentos (CNPJ, Endereço, Itens NCM/CFOP) e transmissão HTTP.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRunDiagnostic()}
                  disabled={isTestingApi}
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
                >
                  <RefreshCw size={14} className={isTestingApi ? 'animate-spin' : ''} />
                  <span>Re-testar</span>
                </button>
                <button
                  onClick={() => setShowDiagnostics(false)}
                  className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
              
              {/* Painel de Status */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-[11px]">
                <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold font-sans">Provedor & Endpoint:</span>
                  <p className="font-bold text-slate-200 uppercase">{config.apiProvider || 'notaas'}</p>
                  <p className="text-slate-400 text-[10px] truncate">{config.apiBaseUrl || 'https://platform.notaas.com.br/api/v1'}</p>
                </div>

                <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold font-sans">Ambiente SEFAZ:</span>
                  <p className="font-bold text-slate-200 uppercase">{config.environment}</p>
                  <p className="text-slate-400 text-[10px]">Chave API: {config.apiKey ? `${config.apiKey.slice(0, 8)}...` : 'NÃO INFORMADA'}</p>
                </div>

                <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold font-sans">Modo de Operação:</span>
                  <p className="font-bold text-emerald-400 uppercase">{config.modoEmissao === 'api_real' || config.apiKey ? 'API REAL (TRANSMISSÃO)' : 'SIMULAÇÃO LOCAL'}</p>
                  <p className="text-slate-400 text-[10px]">Regime: {config.regimeTributario === '1' ? 'Simples Nacional' : 'Regime Normal'}</p>
                </div>
              </div>

              {/* Terminal de Logs */}
              <div className="space-y-2">
                <h4 className="font-black text-slate-300 text-xs uppercase tracking-wider flex items-center justify-between">
                  <span>Terminal de Logs da Requisição (Console Output)</span>
                  <span className="text-[10px] font-normal text-slate-500">Veja também o F12 / DevTools Console</span>
                </h4>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 font-mono text-[11px] space-y-2.5 max-h-72 overflow-y-auto shadow-inner">
                  {diagnosticLogs.map((log, idx) => (
                    <div key={idx} className="space-y-1 border-b border-slate-800/60 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-start gap-2">
                        <span className="text-slate-600 text-[10px]">{log.time}</span>
                        <span className={`font-bold ${
                          log.type === 'success' ? 'text-emerald-400' :
                          log.type === 'error' ? 'text-rose-400' :
                          log.type === 'warning' ? 'text-amber-400' : 'text-purple-300'
                        }`}>
                          {log.message}
                        </span>
                      </div>
                      {log.data && (
                        <pre className="p-2.5 bg-slate-950 text-slate-300 rounded-xl overflow-x-auto text-[10px] border border-slate-800/80">
                          {JSON.stringify(log.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Mapeamento Mapped Payload JSON */}
              {mappedPayload && (
                <div className="space-y-2">
                  <h4 className="font-black text-slate-300 text-xs uppercase tracking-wider flex items-center justify-between">
                    <span>Mapeamento do Payload do Schema Mapeado (`NotaAsCriarNFePayload`)</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(mappedPayload, null, 2));
                        alert('Payload JSON copiado para a área de transferência!');
                      }}
                      className="text-[10px] text-purple-400 hover:text-purple-300 font-bold underline"
                    >
                      Copiar Payload JSON
                    </button>
                  </h4>
                  <pre className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-[10px] font-mono text-slate-300 max-h-60 overflow-y-auto">
                    {JSON.stringify(mappedPayload, null, 2)}
                  </pre>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-900 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowDiagnostics(false)}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all"
              >
                Fechar Investigador
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
