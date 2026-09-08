import React, { useState, useEffect } from 'react';
import { FiscalConfig, SaleOrder, Customer, Company, OrderStatus } from '../types';
import { fiscalService } from '../services/fiscalService';
import { 
  FileText, ShieldCheck, Key, Settings, Globe, CheckCircle2, 
  AlertCircle, RefreshCw, Send, Printer, Download, Eye, ExternalLink,
  Layers, BarChart3, Database, Save, Check, X,
  Building2, MapPin, Search, Building, Phone, Mail, Sparkles,
  Sliders, FileCheck, Clock, Copy, ArrowRightLeft, Undo2, ChevronRight, AlertTriangle
} from 'lucide-react';
import { DanfeModal } from './DanfeModal';
import { CompanyFiscalSettingsModal } from './CompanyFiscalSettingsModal';
import { EmitirNfeModal } from './EmitirNfeModal';
import { fetchAddressByCep, formatCep, fetchIbgeByCityUf } from '../services/cepService';

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
  const [orderToEmitNfe, setOrderToEmitNfe] = useState<SaleOrder | null>(null);
  const [isTransferenciaEmit, setIsTransferenciaEmit] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  // Abas Principais: 'gestao_emissao' (Parâmetros Fiscais) | 'notas_emitidas' (Histórico) | 'fila_emissao' (Pendentes de emissão)
  const [mainTab, setMainTab] = useState<'gestao_emissao' | 'notas_emitidas' | 'fila_emissao'>('gestao_emissao');
  
  // Sub-abas dentro de Gestão das Informações de Emissão
  const [activeConfigTab, setActiveConfigTab] = useState<'emitente' | 'api' | 'tributacao'>('emitente');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sefazStatus, setSefazStatus] = useState<{ status: string; mensagem: string; loading: boolean } | null>(null);

  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [cepStatus, setCepStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [cepMessage, setCepMessage] = useState('');

  // Painel de Diagnóstico e Logs da API
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<Array<{ time: string; type: 'info' | 'success' | 'warning' | 'error'; message: string; data?: any }>>([]);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [mappedPayload, setMappedPayload] = useState<any | null>(null);

  // Consulta automática de CEP para o emitente
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

    const apiKey = (config.apiKey || '').trim();
    if (!apiKey && config.modoEmissao === 'api_real') {
      addLog('warning', '⚠️ Chave de API não informada nas configurações. A transmissão externa exigirá a Project Key (ntaas_...).');
    } else if (apiKey) {
      addLog('info', `🔑 Chave de API identificada: ${apiKey.substring(0, 8)}... (Comprimento: ${apiKey.length} caracteres)`);
    }

    const sampleOrder: SaleOrder = orders.find(o => o.status === OrderStatus.FINALIZED) || orders[0] || {
      id: 'diag-001',
      reference: 'DIAG-2026',
      customerId: customers[0]?.id || 'cust-1',
      date: new Date().toISOString().split('T')[0],
      status: OrderStatus.FINALIZED,
      total: 3500,
      subtotal: 3500,
      discount: 0,
      shipping: 0,
      paymentMethod: 'PIX',
      items: [
        {
          productId: 'p1',
          productName: 'Calcário Agrícola Filler Granel',
          productCode: 'CALC-001',
          quantity: 35,
          unitPrice: 100,
          total: 3500,
          unit: 'TON',
          ncm: '2517.10.00',
          cfop: config.cfopPadraoEstadual || '5101'
        }
      ]
    };

    const sampleCustomer: Customer = customers.find(c => c.id === sampleOrder.customerId) || customers[0] || {
      id: 'cust-1',
      name: 'Agropecuária Vale do Tapajós Ltda',
      document: '04.123.456/0001-89',
      ie: '15.123.456-7',
      street: 'Rodovia Curuá-Una, Km 18',
      number: 'SN',
      neighborhood: 'Zona Rural',
      city: 'Santarém',
      state: 'PA',
      zipCode: '68000-000',
      ibgeCode: '1506807',
      totalSpent: 3500
    };

    addLog('info', '📋 Validando dados prévios do pedido de teste...');
    const validation = fiscalService.validarDadosFiscais(sampleOrder, sampleCustomer);
    if (!validation.valid) {
      addLog('error', `❌ Falha na validação prévia: ${validation.errors.join(' | ')}`);
    } else {
      addLog('success', '✅ Etapa 1: Validação prévia dos dados aprovada!');
    }

    const payload = fiscalService.montarPayloadNotaAs(sampleOrder, sampleCustomer, config);
    setMappedPayload(payload);

    addLog('info', '📋 Checando destinatário (dest):', payload.dest);
    addLog('info', `📋 Checando itens (${payload.items?.length || 0} item(ns)):`, payload.items);
    addLog('info', '📋 Checando pagamentos:', payload.pagamentos);
    addLog('success', '✅ Etapa 2: Mapeamento do Schema JSON concluído com sucesso!');

    addLog('info', '🔍 Etapa 3: Consultando status da SEFAZ via API/Proxy...');
    try {
      const res = await fiscalService.consultarStatusSefaz(config);
      if (res.success) {
        addLog('success', `SEFAZ respondeu: ${res.status.toUpperCase()} — ${res.mensagem}`, res);
      } else {
        addLog('error', `Falha no teste: ${res.mensagem}`, res);
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

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Separação de Listas:
  // 1. Notas Efetivamente Emitidas (Autorizadas, Canceladas, Em Processamento, Rejeitadas)
  const emittedOrders = orders.filter(o => o.nfeStatus && o.nfeStatus !== 'nao_emitida');
  
  // 2. Fila de Emissão: Vendas que ainda NÃO possuem nota autorizada/emitida
  const pendingEmissionOrders = orders.filter(o => !o.nfeStatus || o.nfeStatus === 'nao_emitida' || o.nfeStatus === 'rejeitada');

  // Filtragem da lista de notas emitidas
  const filteredEmittedOrders = emittedOrders.filter(o => {
    const cust = customers.find(c => c.id === o.customerId);
    const matchesSearch = 
      (o.reference?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (o.nfeNumero?.includes(searchQuery)) ||
      (o.nfeChave?.includes(searchQuery)) ||
      (cust?.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (cust?.document?.includes(searchQuery));

    if (filterStatus === 'all') return matchesSearch;
    if (filterStatus === 'autorizada') return matchesSearch && o.nfeStatus === 'autorizada';
    if (filterStatus === 'cancelada') return matchesSearch && o.nfeStatus === 'cancelada';
    if (filterStatus === 'processando') return matchesSearch && o.nfeStatus === 'processando';
    if (filterStatus === 'rejeitada') return matchesSearch && o.nfeStatus === 'rejeitada';
    return matchesSearch;
  });

  const totalNfeAutorizadas = orders.filter(o => o.nfeStatus === 'autorizada').length;
  const totalValorFaturado = orders.filter(o => o.nfeStatus === 'autorizada').reduce((acc, o) => acc + o.total, 0);
  const totalValorPendente = pendingEmissionOrders.reduce((acc, o) => acc + o.total, 0);

  if (!config) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Cabeçalho Principal do Módulo Fiscal */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-[2rem] border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
              <FileCheck className="text-purple-600" size={28} />
              Gestão Fiscal & NF-e 55
            </h1>
            <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${
              config.environment === 'production' 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {config.environment === 'production' ? 'Produção SEFAZ' : 'Homologação'}
            </span>
            <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${
              config.modoEmissao === 'sandbox_local'
                ? 'bg-sky-50 text-sky-700 border-sky-200'
                : 'bg-purple-50 text-purple-700 border-purple-200'
            }`}>
              {config.modoEmissao === 'sandbox_local' ? 'Modo Simulação' : `API Real (${(config.apiProvider || 'notaas').toUpperCase()})`}
            </span>
          </div>
          <p className="text-xs sm:text-sm font-bold text-slate-400 mt-1">
            Controle de parâmetros de emissão, histórico de notas fiscais autorizadas e fila de vendas para faturamento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleRunDiagnostic}
            disabled={isTestingApi}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-2xl shadow-sm transition-all disabled:opacity-50 active:scale-95"
            title="Executa teste de comunicação com a SEFAZ e validação do schema JSON"
          >
            <Send size={13} className={isTestingApi ? 'animate-spin' : ''} />
            <span>{isTestingApi ? 'Testando API...' : 'Testar Conexão API'}</span>
          </button>

          {sefazStatus && (
            <button
              onClick={() => checkSefazStatus()}
              disabled={sefazStatus.loading}
              title={sefazStatus.mensagem}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 hover:border-purple-300 text-slate-700 font-bold text-xs rounded-2xl transition-all"
            >
              <div className={`w-2 h-2 rounded-full ${sefazStatus.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>SEFAZ: <strong className="text-slate-900">{sefazStatus.loading ? 'Verificando...' : 'Online'}</strong></span>
              <RefreshCw size={11} className={sefazStatus.loading ? 'animate-spin text-purple-600' : 'text-slate-400'} />
            </button>
          )}
        </div>
      </header>

      {/* Navegação Primária em Abas (Separação Limpa de Responsabilidades) */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setMainTab('gestao_emissao')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shrink-0 ${
            mainTab === 'gestao_emissao'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
          }`}
        >
          <Sliders size={16} />
          <span>Gestão das Informações de Emissão</span>
        </button>

        <button
          onClick={() => setMainTab('notas_emitidas')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shrink-0 ${
            mainTab === 'notas_emitidas'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
          }`}
        >
          <FileText size={16} />
          <span>Notas Fiscais Emitidas ({emittedOrders.length})</span>
        </button>

        <button
          onClick={() => setMainTab('fila_emissao')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shrink-0 ${
            mainTab === 'fila_emissao'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
          }`}
        >
          <Clock size={16} />
          <span>Fila de Emissão / Vendas ({pendingEmissionOrders.length})</span>
          {pendingEmissionOrders.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              mainTab === 'fila_emissao' ? 'bg-white text-purple-700' : 'bg-amber-100 text-amber-800'
            }`}>
              {pendingEmissionOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: GESTÃO DAS INFORMAÇÕES DE EMISSÃO DE NOTA FISCAL (CONFIGURAÇÕES) */}
      {/* ========================================================================= */}
      {mainTab === 'gestao_emissao' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Métricas Rápidas das Configurações */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Building size={14} className="text-purple-600" /> Empresa Emissora
              </span>
              <p className="font-black text-slate-800 text-sm truncate">{config.razaoSocial || company.name}</p>
              <p className="text-[11px] text-slate-500 font-mono">CNPJ: {config.cnpjEmitente || company.cnpj}</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Key size={14} className="text-amber-600" /> Integração Notaas API
              </span>
              <p className="font-black text-slate-800 text-sm">
                {config.apiKey ? 'Chave Configurada' : 'Chave Pendente'}
              </p>
              <p className="text-[11px] text-slate-500">
                {config.modoEmissao === 'sandbox_local' ? 'Modo Simulação Ativo' : 'API Real Conectada'}
              </p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <FileCheck size={14} className="text-emerald-600" /> Numeração NF-e
              </span>
              <p className="font-black text-slate-800 text-sm">Série {config.serieNFe || 1} • Próx: Nº {config.proxNumeroNFe || 1042}</p>
              <p className="text-[11px] text-slate-500">Modelo 55 (NF-e Eletrônica)</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <MapPin size={14} className="text-blue-600" /> Localidade Fiscal
              </span>
              <p className="font-black text-slate-800 text-sm">{config.cidadeEmitente || 'Santarém'} - {config.ufEmitente || 'PA'}</p>
              <p className="text-[11px] text-slate-500 font-mono">IBGE: {config.ibgeEmitente || '1506807'}</p>
            </div>
          </div>

          {/* Formulário de Gestão das Informações de Emissão */}
          <form onSubmit={handleSaveConfig} className="bg-white rounded-[2.5rem] border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
            
            {/* Sub-abas de Configuração */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveConfigTab('emitente')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                    activeConfigTab === 'emitente'
                      ? 'bg-purple-50 text-purple-800 border border-purple-200'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <Building2 size={14} /> Empresa Emitente
                </button>
                <button
                  type="button"
                  onClick={() => setActiveConfigTab('api')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                    activeConfigTab === 'api'
                      ? 'bg-purple-50 text-purple-800 border border-purple-200'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <Key size={14} /> Integração NotaAs API
                </button>
                <button
                  type="button"
                  onClick={() => setActiveConfigTab('tributacao')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                    activeConfigTab === 'tributacao'
                      ? 'bg-purple-50 text-purple-800 border border-purple-200'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <FileText size={14} /> Tributação & CFOPs
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCompanyModal(true)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
                >
                  <Building2 size={13} /> Assistente de Cadastro da Empresa
                </button>
              </div>
            </div>

            {/* CONTEÚDO DA SUB-ABA 1: DADOS DA EMPRESA EMITENTE */}
            {activeConfigTab === 'emitente' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-2xl text-xs text-purple-900 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="font-black uppercase tracking-wider text-[10px]">Identificação Oficial da Empresa Emissora</p>
                    <p className="text-slate-600">Os dados cadastrais e o endereço fiscal abaixo são utilizados para validação das NF-e Modelo 55.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCompanyModal(true)}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl text-[11px] shrink-0"
                  >
                    Editar no Assistente
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Razão Social (xNome)</label>
                    <input
                      type="text"
                      value={config.razaoSocial || ''}
                      onChange={(e) => setConfig({ ...config, razaoSocial: e.target.value })}
                      placeholder="Ex: CALCÁRIO TAPAJÓS INDÚSTRIA E COMÉRCIO LTDA"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Nome Fantasia (xFant)</label>
                    <input
                      type="text"
                      value={config.nomeFantasia || ''}
                      onChange={(e) => setConfig({ ...config, nomeFantasia: e.target.value })}
                      placeholder="Ex: Calcário Tapajós Mineração"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CNPJ do Emitente</label>
                    <input
                      type="text"
                      value={config.cnpjEmitente || ''}
                      onChange={(e) => setConfig({ ...config, cnpjEmitente: e.target.value })}
                      placeholder="00.000.000/0001-00"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Inscrição Estadual (IE)</label>
                    <input
                      type="text"
                      value={config.inscricaoEstadual || ''}
                      onChange={(e) => setConfig({ ...config, inscricaoEstadual: e.target.value })}
                      placeholder="15.000.000-0"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Regime Tributário (CRT)</label>
                    <select
                      value={config.regimeTributario || '1'}
                      onChange={(e) => setConfig({ ...config, regimeTributario: e.target.value as any })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                    >
                      <option value="1">1 - Simples Nacional</option>
                      <option value="2">2 - Simples Nacional (Excesso Sublimite)</option>
                      <option value="3">3 - Regime Normal (Lucro Presumido / Real)</option>
                    </select>
                  </div>
                </div>

                {/* Endereço Fiscal do Emitente */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
                      <MapPin size={12} /> Endereço Fiscal da Empresa
                    </span>
                    {cepStatus !== 'idle' && (
                      <span className={`text-[10px] font-bold ${cepStatus === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {cepMessage}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400">CEP</label>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={config.cepEmitente || ''}
                          onChange={(e) => {
                            const formatted = formatCep(e.target.value);
                            setConfig({ ...config, cepEmitente: formatted });
                            if (formatted.replace(/\D/g, '').length === 8) handleCepLookup(formatted);
                          }}
                          placeholder="68000-000"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => handleCepLookup(config.cepEmitente || '')}
                          disabled={isLoadingCep}
                          className="p-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl border border-purple-200"
                          title="Buscar endereço por CEP"
                        >
                          <Search size={13} className={isLoadingCep ? 'animate-spin' : ''} />
                        </button>
                      </div>
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400">Logradouro / Rodovia</label>
                      <input
                        type="text"
                        value={config.logradouroEmitente || ''}
                        onChange={(e) => setConfig({ ...config, logradouroEmitente: e.target.value })}
                        placeholder="Rodovia BR-163 / Rua"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400">Número</label>
                      <input
                        type="text"
                        value={config.numeroEmitente || ''}
                        onChange={(e) => setConfig({ ...config, numeroEmitente: e.target.value })}
                        placeholder="Km 42 / S/N"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400">Bairro</label>
                      <input
                        type="text"
                        value={config.bairroEmitente || ''}
                        onChange={(e) => setConfig({ ...config, bairroEmitente: e.target.value })}
                        placeholder="Zona Industrial / Rural"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400">Município</label>
                      <input
                        type="text"
                        value={config.cidadeEmitente || ''}
                        onChange={(e) => setConfig({ ...config, cidadeEmitente: e.target.value })}
                        placeholder="Santarém"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400">UF</label>
                      <input
                        type="text"
                        maxLength={2}
                        value={config.ufEmitente || ''}
                        onChange={(e) => setConfig({ ...config, ufEmitente: e.target.value.toUpperCase() })}
                        placeholder="PA"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-center"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400">Código IBGE Município</label>
                      <input
                        type="text"
                        maxLength={7}
                        value={config.ibgeEmitente || ''}
                        onChange={(e) => setConfig({ ...config, ibgeEmitente: e.target.value })}
                        placeholder="1506807"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CONTEÚDO DA SUB-ABA 2: INTEGRAÇÃO NOTAAS API */}
            {activeConfigTab === 'api' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Modo de Operação</label>
                    <select
                      value={config.modoEmissao || 'api_real'}
                      onChange={(e) => setConfig({ ...config, modoEmissao: e.target.value as any })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                    >
                      <option value="api_real">API Real (Transmissão Direta via NotaAs)</option>
                      <option value="sandbox_local">Simulação Local / Treinamento (Sem envio à SEFAZ)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Ambiente SEFAZ</label>
                    <select
                      value={config.environment || 'production'}
                      onChange={(e) => setConfig({ ...config, environment: e.target.value as any })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                    >
                      <option value="production">Produção Oficial SEFAZ (Validade Jurídica)</option>
                      <option value="homologation">Homologação / Sandbox (Testes SEFAZ)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Chave da API Fiscal (Project Key)</label>
                    <span className="text-[10px] text-slate-400">Header oficial: <code>x-api-key</code></span>
                  </div>
                  <input
                    type="password"
                    value={config.apiKey || ''}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    placeholder="ntaas_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:border-purple-500"
                  />
                  <p className="text-[11px] text-slate-400">
                    Insira a Project Key gerada no painel da NotaAs (iniciada com <strong>ntaas_</strong>). O Certificado Digital A1 é configurado diretamente no projeto NotaAs.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Provedor de Emissão</label>
                    <select
                      value={config.apiProvider || 'notaas'}
                      onChange={(e) => setConfig({ ...config, apiProvider: e.target.value as any })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                    >
                      <option value="notaas">NotaAs API (Recomendado)</option>
                      <option value="focusnfe">Focus NFe</option>
                      <option value="nuvemfiscal">Nuvem Fiscal</option>
                      <option value="custom">API Customizada / Servidor Próprio</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">URL Base da API</label>
                    <input
                      type="text"
                      value={config.apiBaseUrl || 'https://platform.notaas.com.br/api/v1'}
                      onChange={(e) => setConfig({ ...config, apiBaseUrl: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* CONTEÚDO DA SUB-ABA 3: TRIBUTAÇÃO & CFOPS */}
            {activeConfigTab === 'tributacao' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Série da NF-e</label>
                    <input
                      type="number"
                      value={config.serieNFe || 1}
                      onChange={(e) => setConfig({ ...config, serieNFe: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Próximo Número NF-e</label>
                    <input
                      type="number"
                      value={config.proxNumeroNFe || 1042}
                      onChange={(e) => setConfig({ ...config, proxNumeroNFe: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CFOP Venda Estadual</label>
                    <input
                      type="text"
                      value={config.cfopPadraoEstadual || '5101'}
                      onChange={(e) => setConfig({ ...config, cfopPadraoEstadual: e.target.value })}
                      placeholder="5101"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CFOP Venda Interestadual</label>
                    <input
                      type="text"
                      value={config.cfopPadraoInterestadual || '6101'}
                      onChange={(e) => setConfig({ ...config, cfopPadraoInterestadual: e.target.value })}
                      placeholder="6101"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CFOP Transferência (PA)</label>
                    <input
                      type="text"
                      value={config.cfopTransferenciaEstadual || '5152'}
                      onChange={(e) => setConfig({ ...config, cfopTransferenciaEstadual: e.target.value })}
                      placeholder="5152"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CFOP Transferência (Fora PA)</label>
                    <input
                      type="text"
                      value={config.cfopTransferenciaInterestadual || '6152'}
                      onChange={(e) => setConfig({ ...config, cfopTransferenciaInterestadual: e.target.value })}
                      placeholder="6152"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CST ICMS Padrão</label>
                    <input
                      type="text"
                      value={config.cstIcmsPadrao || '40'}
                      onChange={(e) => setConfig({ ...config, cstIcmsPadrao: e.target.value })}
                      placeholder="40 (Isento)"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">NCM Padrão Calcário</label>
                    <input
                      type="text"
                      value={config.ncmPadrao || '2517.10.00'}
                      onChange={(e) => setConfig({ ...config, ncmPadrao: e.target.value })}
                      placeholder="2517.10.00"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Observações Fiscais Padrão (InfCpl)</label>
                  <textarea
                    rows={2}
                    value={config.observacoesFiscaisPadrao || ''}
                    onChange={(e) => setConfig({ ...config, observacoesFiscaisPadrao: e.target.value })}
                    placeholder="Ex: Calcário agrícola para uso exclusivo na agricultura. Isenção de ICMS conforme Convênio ICMS 100/97."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            )}

            {/* Botão de Salvar Alterações */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <span className="text-xs text-slate-400">
                As configurações fiscais são aplicadas instantaneamente em todas as novas emissões.
              </span>

              <div className="flex items-center gap-3">
                {saveSuccess && (
                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 animate-in fade-in">
                    <CheckCircle2 size={14} /> Configurações salvas com sucesso!
                  </span>
                )}

                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-purple-100 transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-95"
                >
                  {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  <span>{isSaving ? 'Salvando...' : 'Salvar Informações Fiscais'}</span>
                </button>
              </div>
            </div>

          </form>

          {/* Painel de Diagnóstico & Teste da API */}
          {showDiagnostics && (
            <div className="bg-slate-900 text-white rounded-[2.5rem] p-6 sm:p-8 space-y-4 border border-slate-800 shadow-2xl animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-500/20 text-purple-400 rounded-xl">
                    <Send size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black tracking-tight text-white">Log de Diagnóstico & Teste de Conexão da API</h3>
                    <p className="text-[11px] text-slate-400">Inspeção de schema JSON e comunicação em tempo real</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDiagnostics(false)}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl font-mono text-xs max-h-60 overflow-y-auto space-y-1.5 border border-slate-800">
                {diagnosticLogs.map((log, idx) => (
                  <div key={idx} className={`flex items-start gap-2 ${
                    log.type === 'error' ? 'text-rose-400' :
                    log.type === 'warning' ? 'text-amber-300' :
                    log.type === 'success' ? 'text-emerald-400 font-bold' : 'text-slate-300'
                  }`}>
                    <span className="text-slate-500 text-[10px]">[{log.time}]</span>
                    <span>{log.message}</span>
                  </div>
                ))}
              </div>

              {mappedPayload && (
                <details className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs">
                  <summary className="font-bold text-slate-300 cursor-pointer hover:text-purple-300">
                    Ver Schema JSON Completo Montado para a NotaAs
                  </summary>
                  <pre className="mt-2 text-[11px] text-emerald-400 font-mono overflow-x-auto p-2 bg-black/40 rounded-xl">
                    {JSON.stringify(mappedPayload, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: NOTAS FISCAIS EMITIDAS (HISTÓRICO & DOCUMENTOS FISCAIS) */}
      {/* ========================================================================= */}
      {mainTab === 'notas_emitidas' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Métricas Exclusivas de Notas Emitidas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <FileCheck size={14} className="text-emerald-600" /> Total NF-e Autorizadas
              </span>
              <p className="text-2xl font-black text-slate-800">{totalNfeAutorizadas} Notas</p>
              <p className="text-xs text-slate-400">Documentos emitidos com sucesso na SEFAZ</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <BarChart3 size={14} className="text-purple-600" /> Faturamento Fiscal Total
              </span>
              <p className="text-2xl font-black text-purple-700">{formatBRL(totalValorFaturado)}</p>
              <p className="text-xs text-slate-400">Valor acumulado faturado em NF-e</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Layers size={14} className="text-blue-600" /> Última NF-e Emitida
              </span>
              <p className="text-2xl font-black text-slate-800">
                {emittedOrders[0]?.nfeNumero ? `Nº ${emittedOrders[0].nfeNumero}` : 'Nenhuma'}
              </p>
              <p className="text-xs text-slate-400">
                {emittedOrders[0]?.nfeEmissao ? `Emissão: ${emittedOrders[0].nfeEmissao.split('T')[0]}` : 'Pronto para emitir'}
              </p>
            </div>
          </div>

          {/* Tabela de Notas Fiscais Emitidas */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Histórico de Notas Fiscais Emitidas</h3>
                <p className="text-xs text-slate-400">Relação de NF-e autorizadas, canceladas e em processamento</p>
              </div>

              {/* Filtros e Busca */}
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Buscar por Nº, Chave ou Cliente..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                  />
                </div>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                >
                  <option value="all">Todos os Status</option>
                  <option value="autorizada">Autorizadas</option>
                  <option value="cancelada">Canceladas</option>
                  <option value="processando">Em Processamento</option>
                  <option value="rejeitada">Rejeitadas</option>
                </select>
              </div>
            </div>

            {/* Listagem */}
            {filteredEmittedOrders.length === 0 ? (
              <div className="text-center py-16 bg-slate-50 rounded-3xl border border-dashed border-slate-200 space-y-3">
                <FileText className="mx-auto text-slate-300" size={40} />
                <p className="text-sm font-bold text-slate-500">Nenhuma nota fiscal emitida encontrada com os filtros atuais.</p>
                <button
                  onClick={() => setMainTab('fila_emissao')}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition-all"
                >
                  Ver Fila de Vendas a Emitir
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[9px] tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3.5">Nº / Série</th>
                      <th className="px-4 py-3.5">Destinatário</th>
                      <th className="px-4 py-3.5">Chave de Acesso</th>
                      <th className="px-4 py-3.5">Emissão</th>
                      <th className="px-4 py-3.5 text-center">Status SEFAZ</th>
                      <th className="px-5 py-3.5 text-right">Valor Total</th>
                      <th className="px-5 py-3.5 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredEmittedOrders.map(order => {
                      const customer = customers.find(c => c.id === order.customerId);
                      return (
                        <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-5 py-4">
                            <div className="font-black text-slate-800 text-sm">
                              {order.nfeNumero ? `Nº ${order.nfeNumero}` : '—'}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Série {order.nfeSerie || 1} • Ref: {order.reference}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <p className="font-bold text-slate-800">{customer?.name || 'Cliente Geral'}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{customer?.document || 'Doc não informado'}</p>
                          </td>

                          <td className="px-4 py-4">
                            {order.nfeChave ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-2 py-1 rounded-md max-w-[130px] truncate" title={order.nfeChave}>
                                  {order.nfeChave.substring(0, 8)}...{order.nfeChave.substring(order.nfeChave.length - 6)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(order.nfeChave || '', order.id)}
                                  className="p-1 hover:bg-slate-200 text-slate-400 hover:text-purple-600 rounded-md transition-colors"
                                  title="Copiar Chave de Acesso"
                                >
                                  {copiedKey === order.id ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Sem chave</span>
                            )}
                          </td>

                          <td className="px-4 py-4 text-slate-500">
                            {order.nfeEmissao ? order.nfeEmissao.split('T')[0] : order.date}
                          </td>

                          <td className="px-4 py-4 text-center">
                            <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2.5 py-1 rounded-full ${
                              order.nfeStatus === 'autorizada' ? 'bg-emerald-100 text-emerald-800' :
                              order.nfeStatus === 'cancelada' ? 'bg-rose-100 text-rose-800' :
                              order.nfeStatus === 'processando' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                              order.nfeStatus === 'rejeitada' ? 'bg-rose-100 text-rose-800' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {order.nfeStatus === 'autorizada' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                              {order.nfeStatus?.toUpperCase()}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-right font-black text-slate-800 text-sm">
                            {formatBRL(order.total)}
                          </td>

                          <td className="px-5 py-4 text-center">
                            <button
                              onClick={() => setSelectedDanfeOrder(order)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-purple-600 text-white rounded-xl text-[10px] font-black transition-all shadow-xs"
                            >
                              <Eye size={12} /> Ver DANFE
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: FILA DE EMISSÃO (VENDAS PRONTAS PARA EMITIR NF-E) */}
      {/* ========================================================================= */}
      {mainTab === 'fila_emissao' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Métricas da Fila de Vendas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Clock size={14} className="text-amber-600" /> Vendas Aguardando NF-e
              </span>
              <p className="text-2xl font-black text-amber-600">{pendingEmissionOrders.length} Pedidos</p>
              <p className="text-xs text-slate-400">Vendas finalizadas aguardando transmissão fiscal</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <BarChart3 size={14} className="text-purple-600" /> Valor a Faturar
              </span>
              <p className="text-2xl font-black text-purple-700">{formatBRL(totalValorPendente)}</p>
              <p className="text-xs text-slate-400">Total a ser formalizado em NF-e</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-600" /> Próximo Número
              </span>
              <p className="text-2xl font-black text-slate-800">NF-e Nº {config.proxNumeroNFe || 1042}</p>
              <p className="text-xs text-slate-400">Série {config.serieNFe || 1} • Modelo 55</p>
            </div>
          </div>

          {/* Lista de Vendas Pendentes de Emissão */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Vendas Prontas para Faturamento Fiscal</h3>
                <p className="text-xs text-slate-400">Clique em "Emitir NF-e" para revisar os dados cadastrais e transmitir à SEFAZ</p>
              </div>
            </div>

            {pendingEmissionOrders.length === 0 ? (
              <div className="text-center py-16 bg-slate-50 rounded-3xl border border-dashed border-slate-200 space-y-3">
                <CheckCircle2 className="mx-auto text-emerald-500" size={44} />
                <p className="text-base font-black text-slate-800">Todas as vendas estão com NF-e emitida!</p>
                <p className="text-xs text-slate-500">Nenhum pedido pendente de emissão fiscal no momento.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingEmissionOrders.map(order => {
                  const customer = customers.find(c => c.id === order.customerId);
                  const validation = fiscalService.validarDadosFiscais(order, customer);
                  
                  return (
                    <div 
                      key={order.id} 
                      className="p-5 bg-slate-50 hover:bg-white border border-slate-200/80 hover:border-purple-300 rounded-3xl transition-all shadow-xs space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-slate-900 text-sm">Pedido {order.reference}</span>
                            <span className="text-[10px] text-slate-400 font-bold">• Data: {order.date}</span>
                            
                            {validation.valid ? (
                              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                                <CheckCircle2 size={10} /> Cadastro Completo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-rose-100 text-rose-800">
                                <AlertTriangle size={10} /> Pendência Cadastral
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-700 font-bold mt-0.5">
                            Cliente: {customer?.name || 'Não identificado'} • Doc: {customer?.document || '—'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {customer?.street || 'Zona Rural'}, {customer?.city || 'Santarém'}/{customer?.state || 'PA'}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                          <div className="text-right">
                            <span className="text-[9px] font-black uppercase text-slate-400">Total da Venda</span>
                            <p className="text-base font-black text-slate-900">{formatBRL(order.total)}</p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setIsTransferenciaEmit(false);
                                setOrderToEmitNfe(order);
                              }}
                              className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-xs font-black shadow-md shadow-purple-100 transition-all hover:scale-105 active:scale-95"
                            >
                              <Send size={13} /> Emitir NF-e
                            </button>

                            <button
                              onClick={() => {
                                setIsTransferenciaEmit(true);
                                setOrderToEmitNfe(order);
                              }}
                              className="px-3 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-2xl text-xs font-black transition-all"
                              title="Emitir como Transferência de Estoque (CFOP 5152/6152)"
                            >
                              <ArrowRightLeft size={13} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Resumo de Produtos */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 text-[11px] text-slate-600">
                        {order.items.map((it, idx) => (
                          <span key={idx} className="bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 font-bold">
                            {it.productName}: {it.quantity} {it.unit || 'Ton'} (@ {formatBRL(it.unitPrice)}) = {formatBRL(it.total)}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* Modal de Emissão de NF-e */}
      {orderToEmitNfe && (
        <EmitirNfeModal
          order={orderToEmitNfe}
          customer={customers.find(c => c.id === orderToEmitNfe.customerId) || customers[0]}
          config={config}
          company={company}
          transferencia={isTransferenciaEmit}
          onClose={() => {
            setOrderToEmitNfe(null);
            setIsTransferenciaEmit(false);
          }}
          onSuccess={(updatedOrder) => {
            onUpdateOrder(updatedOrder);
            setOrderToEmitNfe(null);
            setIsTransferenciaEmit(false);
            setSelectedDanfeOrder(updatedOrder);
          }}
        />
      )}

      {/* Modal de Visualização e Impressão de DANFE */}
      {selectedDanfeOrder && (
        <DanfeModal
          order={selectedDanfeOrder}
          customer={customers.find(c => c.id === selectedDanfeOrder.customerId) || customers[0]}
          config={config}
          company={company}
          onClose={() => setSelectedDanfeOrder(null)}
          onOrderUpdated={(updatedOrder) => {
            onUpdateOrder(updatedOrder);
            setSelectedDanfeOrder(updatedOrder);
          }}
        />
      )}

      {/* Modal de Cadastro da Empresa Emitente */}
      <CompanyFiscalSettingsModal
        isOpen={showCompanyModal}
        onClose={() => setShowCompanyModal(false)}
        config={config}
        companyId={companyId}
        onSaveSuccess={(updated) => {
          setConfig(updated);
        }}
      />

    </div>
  );
};
