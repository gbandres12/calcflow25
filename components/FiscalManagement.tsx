import React, { useState, useEffect } from 'react';
import { FiscalConfig, SaleOrder, Customer, Company, OrderStatus, View } from '../types';
import { fiscalService } from '../services/fiscalService';
import { 
  FileText, ShieldCheck, Key, Settings, Globe, CheckCircle2, 
  AlertCircle, RefreshCw, Send, Printer, Download, Eye, ExternalLink,
  Layers, BarChart3, Database, Save, Check, X,
  Building2, MapPin, Search, Building, Phone, Mail, Sparkles,
  Sliders, FileCheck, Clock, Copy, ArrowRightLeft, Undo2, ChevronRight, AlertTriangle
} from 'lucide-react';
import { DanfeModal } from './DanfeModal';
import { EmitirNfeModal } from './EmitirNfeModal';

interface FiscalManagementProps {
  orders: SaleOrder[];
  customers: Customer[];
  company: Company;
  companyId?: string;
  onUpdateOrder: (order: SaleOrder) => void;
  onNavigate?: (view: View) => void;
}

export const FiscalManagement: React.FC<FiscalManagementProps> = ({
  orders,
  customers,
  company,
  companyId,
  onUpdateOrder,
  onNavigate
}) => {
  const [config, setConfig] = useState<FiscalConfig | null>(null);
  const [selectedDanfeOrder, setSelectedDanfeOrder] = useState<SaleOrder | null>(null);
  const [orderToEmitNfe, setOrderToEmitNfe] = useState<SaleOrder | null>(null);
  const [isTransferenciaEmit, setIsTransferenciaEmit] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  // Abas Principais: 'notas_emitidas' (Histórico) | 'fila_emissao' (Pendentes de emissão)
  const [activeTab, setActiveTab] = useState<'notas_emitidas' | 'fila_emissao'>('notas_emitidas');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sefazStatus, setSefazStatus] = useState<{ status: string; mensagem: string; loading: boolean } | null>(null);

  useEffect(() => {
    fiscalService.getConfig(companyId).then(c => {
      setConfig(c);
      checkSefazStatus(c);
    });
  }, [companyId]);

  const checkSefazStatus = async (overrideCfg?: FiscalConfig) => {
    setSefazStatus({ status: 'checking', mensagem: 'Consultando SEFAZ...', loading: true });
    try {
      const res = await fiscalService.consultarStatusSefaz(overrideCfg || config || undefined);
      setSefazStatus({ status: res.status, mensagem: res.mensagem, loading: false });
    } catch {
      setSefazStatus({ status: 'offline', mensagem: 'Não foi possível consultar a SEFAZ.', loading: false });
    }
  };

  const formatBRL = (val: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
      
      {/* Cabeçalho Principal do Módulo de Notas Fiscais Emitidas */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-[2rem] border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
              <FileCheck className="text-purple-600" size={28} />
              Notas Fiscais Emitidas (NF-e 55)
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
            Histórico completo de notas fiscais autorizadas, canceladas, emissão de DANFE e fila de faturamento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onNavigate && (
            <button
              onClick={() => onNavigate('fiscal_config')}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-200 hover:border-purple-200 font-bold text-xs rounded-2xl transition-all shadow-xs"
              title="Acessar página de Configuração da Nota Fiscal no menu lateral"
            >
              <Sliders size={14} className="text-purple-600" />
              <span>Configurações de Nota Fiscal</span>
            </button>
          )}

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

          <button
            onClick={() => setActiveTab('fila_emissao')}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-2xl shadow-sm transition-all active:scale-95"
          >
            <Send size={13} />
            <span>Emitir Nova NF-e</span>
          </button>
        </div>
      </header>

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
            <FileCheck size={14} className="text-emerald-600" /> Total NF-e Autorizadas
          </span>
          <p className="text-2xl font-black text-slate-800">{totalNfeAutorizadas} Notas</p>
          <p className="text-xs text-slate-400">Documentos fiscais válidos na SEFAZ</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
            <BarChart3 size={14} className="text-purple-600" /> Faturamento Fiscal
          </span>
          <p className="text-2xl font-black text-purple-700">{formatBRL(totalValorFaturado)}</p>
          <p className="text-xs text-slate-400">Total faturado formalizado em NF-e</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
            <Clock size={14} className="text-amber-600" /> Fila de Emissão
          </span>
          <p className="text-2xl font-black text-amber-600">{pendingEmissionOrders.length} Vendas</p>
          <p className="text-xs text-slate-400">Aguardando emissão fiscal ({formatBRL(totalValorPendente)})</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
            <Layers size={14} className="text-blue-600" /> Última NF-e
          </span>
          <p className="text-2xl font-black text-slate-800">
            {emittedOrders[0]?.nfeNumero ? `Nº ${emittedOrders[0].nfeNumero}` : 'Nº 6922'}
          </p>
          <p className="text-xs text-slate-400">
            Próxima da fila: Nº {config.proxNumeroNFe || 6923} (Série {config.serieNFe || 1})
          </p>
        </div>
      </div>

      {/* Navegação de Abas: Notas Emitidas vs Fila de Vendas */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('notas_emitidas')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shrink-0 ${
            activeTab === 'notas_emitidas'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
          }`}
        >
          <FileText size={16} />
          <span>Notas Fiscais Emitidas ({emittedOrders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('fila_emissao')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shrink-0 ${
            activeTab === 'fila_emissao'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
          }`}
        >
          <Clock size={16} />
          <span>Fila de Faturamento / Vendas ({pendingEmissionOrders.length})</span>
          {pendingEmissionOrders.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'fila_emissao' ? 'bg-white text-purple-700' : 'bg-amber-100 text-amber-800'
            }`}>
              {pendingEmissionOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: NOTAS FISCAIS EMITIDAS (HISTÓRICO & DANFE) */}
      {/* ========================================================================= */}
      {activeTab === 'notas_emitidas' && (
        <div className="bg-white rounded-[2.5rem] border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-lg font-black text-slate-800 tracking-tight">Relação de Notas Fiscais Emitidas</h3>
              <p className="text-xs text-slate-400">Consulta de chaves de acesso, visualização de DANFE e status SEFAZ</p>
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
                onClick={() => setActiveTab('fila_emissao')}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition-all shadow-sm"
              >
                Ver Fila de Vendas a Faturar
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
      )}

      {/* ========================================================================= */}
      {/* ABA 2: FILA DE FATURAMENTO / VENDAS PRONTAS */}
      {/* ========================================================================= */}
      {activeTab === 'fila_emissao' && (
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

    </div>
  );
};
