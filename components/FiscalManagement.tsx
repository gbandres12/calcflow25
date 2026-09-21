import React, { useState, useEffect } from 'react';
import { FiscalConfig, SaleOrder, SaleOrderLinkedNfe, Customer, Company, View, InventoryItem, User, Transportador } from '../types';
import { fiscalService } from '../services/fiscalService';
import { listOrderNfes, listDraftNfes, overlayNfeFields, totalRemainingQuantity, commitLinkedNfeSync, findLinkedNfe, findDraftNfe, isDraftNfe, dedupeEmittedNfeRows } from '../services/saleNfe';
import { buildNfeDuplicateDraft, NfeDuplicateDraft } from '../services/nfeDuplicate';
import {
  FileText, CheckCircle2, AlertCircle, RefreshCw, Send, Eye,
  Layers, BarChart3, Check, Search, Sliders, FileCheck, Clock,
  Copy, ArrowRightLeft, AlertTriangle, Plus, FileEdit, X
} from 'lucide-react';
import { DanfeModal } from './DanfeModal';
import { EmitirNfeModal } from './EmitirNfeModal';
import { EmitirNfeAvulsaModal } from './EmitirNfeAvulsaModal';
import { DateFilterControl } from './ui/DateFilterControl';
import { DatePreset, getDatePresetRange, isDateInRange } from '../utils/dateFilterUtils';
import { resolveCustomerForOrder } from '../utils/customerUtils';
import ErrorBoundary from './ErrorBoundary';

interface FiscalManagementProps {
  orders: SaleOrder[];
  customers: Customer[];
  company: Company;
  companyId?: string;
  inventory?: InventoryItem[];
  currentUser?: User;
  transportadores?: Transportador[];
  onAddTransportador?: (data: Omit<Transportador, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>) => Transportador | void;
  onUpdateOrder: (order: SaleOrder) => void;
  onAddOrder?: (order: any) => void;
  onNavigate?: (view: View) => void;
  canConfigure?: boolean;
}

export const FiscalManagement: React.FC<FiscalManagementProps> = ({
  orders,
  customers,
  company,
  companyId,
  inventory = [],
  currentUser,
  transportadores = [],
  onAddTransportador,
  onUpdateOrder,
  onNavigate,
  canConfigure = false
}) => {
  const [config, setConfig] = useState<FiscalConfig | null>(null);
  const [selectedDanfeOrder, setSelectedDanfeOrder] = useState<SaleOrder | null>(null);
  const [selectedDanfeLinkedNfeId, setSelectedDanfeLinkedNfeId] = useState<string | undefined>(undefined);
  const [orderToEmitNfe, setOrderToEmitNfe] = useState<SaleOrder | null>(null);
  const [draftToResume, setDraftToResume] = useState<SaleOrderLinkedNfe | undefined>(undefined);
  const [emitInitialStep, setEmitInitialStep] = useState<'edit' | 'preview'>('edit');
  const [isTransferenciaEmit, setIsTransferenciaEmit] = useState(false);
  const [isAvulsaEmit, setIsAvulsaEmit] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'notas_emitidas' | 'fila_emissao' | 'rascunhos'>('notas_emitidas');
  const [showAvulsaModal, setShowAvulsaModal] = useState(false);
  const [duplicateDraft, setDuplicateDraft] = useState<NfeDuplicateDraft | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [activeDatePreset, setActiveDatePreset] = useState<DatePreset>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const applyDatePreset = (preset: 'ALL' | 'TODAY' | '7DAYS' | 'THIS_MONTH') => {
    setActiveDatePreset(preset);
    const range = getDatePresetRange(preset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    setActiveDatePreset('CUSTOM');
    if (type === 'start') setStartDate(value);
    if (type === 'end') setEndDate(value);
  };

  const handleResetDateFilter = () => {
    applyDatePreset('ALL');
  };

  const handleResetAllFilters = () => {
    setSearchQuery('');
    setFilterStatus('all');
    applyDatePreset('ALL');
  };

  const hasActiveFilters = 
    Boolean(searchQuery.trim()) ||
    filterStatus !== 'all' ||
    activeDatePreset !== 'ALL' ||
    Boolean(startDate) ||
    Boolean(endDate);

  const [sefazStatus, setSefazStatus] = useState<{ status: string; mensagem: string; loading: boolean } | null>(null);

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  useEffect(() => {
    fiscalService.getConfig(companyId).then((c) => {
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

  const openDuplicate = (order: SaleOrder, linkedNfeId?: string) => {
    const linked = findLinkedNfe(order, linkedNfeId) || listOrderNfes(order).slice(-1)[0];
    setDuplicateDraft(buildNfeDuplicateDraft(order, linked));
    setSelectedDanfeOrder(null);
    setSelectedDanfeLinkedNfeId(undefined);
    setShowAvulsaModal(true);
  };

  const nfeStatusLabel = (status?: string) => {
    if (status === 'autorizada') return 'Autorizada';
    if (status === 'rejeitada') return 'Rejeitada';
    if (status === 'cancelada') return 'Cancelada';
    if (status === 'processando') return 'Processando';
    if (status === 'rascunho') return 'Rascunho';
    return status || 'Não emitida';
  };

  const openEmitFromOrder = (
    order: SaleOrder,
    opts?: { avulsa?: boolean; transferencia?: boolean; draft?: SaleOrderLinkedNfe; step?: 'edit' | 'preview' }
  ) => {
    const tipo = opts?.transferencia ? 'transferencia' : opts?.avulsa ? 'avulsa' : 'pedido';
    const draft = opts?.draft || findDraftNfe(order, tipo as any);
    setIsAvulsaEmit(Boolean(opts?.avulsa));
    setIsTransferenciaEmit(Boolean(opts?.transferencia));
    setDraftToResume(draft);
    setEmitInitialStep(opts?.step || (draft ? 'preview' : 'edit'));
    setOrderToEmitNfe(order);
  };

  const closeEmitModal = () => {
    setOrderToEmitNfe(null);
    setIsTransferenciaEmit(false);
    setIsAvulsaEmit(false);
    setDraftToResume(undefined);
    setEmitInitialStep('edit');
  };

  const syncFromSefaz = async (order: SaleOrder, linkedNfeId?: string) => {
    if (!config) return;
    setSyncingId(linkedNfeId || order.id);
    try {
      const linked = findLinkedNfe(order, linkedNfeId);
      const view = linked ? overlayNfeFields(order, linked) : order;
      const updated = await fiscalService.sincronizarPedidoComSefaz(view, config);
      onUpdateOrder(commitLinkedNfeSync(order, updated, linkedNfeId));
    } finally {
      setSyncingId(null);
    }
  };

  const syncAuthorizedFromSefaz = async () => {
    if (!config || syncingAll) return;
    const targets = emittedOrders.filter((row) => row.nfe.nfeStatus === 'autorizada' && row.nfe.nfeId);
    if (targets.length === 0) return;
    setSyncingAll(true);
    try {
      for (const row of targets) {
        setSyncingId(row.nfe.id);
        const linked = findLinkedNfe(row.order, row.nfe.id);
        const view = linked ? overlayNfeFields(row.order, linked) : row.order;
        const updated = await fiscalService.sincronizarPedidoComSefaz(view, config);
        onUpdateOrder(commitLinkedNfeSync(row.order, updated, row.nfe.id));
      }
    } finally {
      setSyncingId(null);
      setSyncingAll(false);
    }
  };

  const safeOrders = orders || [];
  const safeCustomers = customers || [];
  const nfeRows = dedupeEmittedNfeRows(
    safeOrders.flatMap((order) =>
      listOrderNfes(order).map((nfe) => ({
        order,
        nfe,
        overlay: overlayNfeFields(order, nfe),
      }))
    )
  );
  const emittedOrders = nfeRows.filter((r) => !isDraftNfe(r.nfe));
  const draftRows = nfeRows.filter((r) => isDraftNfe(r.nfe));
  const pendingEmissionOrders = safeOrders.filter(
    (o) => totalRemainingQuantity(o) > 0.0001
  );

  const emittedInDateRange = emittedOrders.filter((row) => {
    const d = row.nfe.nfeEmissao || row.nfe.createdAt || row.order.date;
    return isDateInRange(d, startDate, endDate);
  });

  const pendingInDateRange = pendingEmissionOrders.filter((o) => {
    return isDateInRange(o.date, startDate, endDate);
  });

  const draftsInDateRange = draftRows.filter((r) => {
    const d = r.nfe.createdAt || r.order.date;
    return isDateInRange(d, startDate, endDate);
  });

  const filteredEmittedOrders = emittedInDateRange.filter((row) => {
    const o = row.overlay;
    const cust = safeCustomers.find((c) => c.id === o.customerId);
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (o.reference || '').toLowerCase().includes(q) ||
      (row.nfe.nfeNumero || '').includes(searchQuery) ||
      (row.nfe.nfeChave || '').includes(searchQuery) ||
      (row.nfe.reference || '').toLowerCase().includes(q) ||
      (cust?.name || '').toLowerCase().includes(q) ||
      (cust?.document || '').includes(searchQuery);
    if (filterStatus === 'all') return matchesSearch;
    return matchesSearch && row.nfe.nfeStatus === filterStatus;
  });

  const filteredPendingEmissionOrders = pendingInDateRange.filter((o) => {
    if (!searchQuery.trim()) return true;
    const cust = safeCustomers.find((c) => c.id === o.customerId);
    const q = searchQuery.toLowerCase();
    return (
      (o.reference || '').toLowerCase().includes(q) ||
      (cust?.name || '').toLowerCase().includes(q) ||
      (cust?.document || '').includes(searchQuery)
    );
  });

  const filteredDraftRows = draftsInDateRange.filter((r) => {
    if (!searchQuery.trim()) return true;
    const o = r.overlay;
    const cust = safeCustomers.find((c) => c.id === o.customerId);
    const q = searchQuery.toLowerCase();
    return (
      (o.reference || '').toLowerCase().includes(q) ||
      (r.nfe.reference || '').toLowerCase().includes(q) ||
      (cust?.name || '').toLowerCase().includes(q) ||
      (cust?.document || '').includes(searchQuery)
    );
  });

  const totalNfeAutorizadas = emittedInDateRange.filter((r) => r.nfe.nfeStatus === 'autorizada').length;
  const totalValorFaturado = emittedInDateRange
    .filter((r) => r.nfe.nfeStatus === 'autorizada')
    .reduce((acc, r) => acc + (r.nfe.total || 0), 0);
  const totalValorPendente = pendingInDateRange.reduce((acc, o) => acc + (o.total || 0), 0);

  if (!config) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-[2rem] border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
              <FileCheck className="text-purple-600" size={28} />
              Notas Fiscais Emitidas (NF-e 55)
            </h1>
          </div>
          <p className="text-xs sm:text-sm font-bold text-slate-400 mt-1">
            Histórico de notas, DANFE e fila de faturamento.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              setDuplicateDraft(null);
              setShowAvulsaModal(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-xs rounded-2xl shadow-lg shadow-purple-200 transition-all hover:scale-[1.02]"
            title="Emitir NF-e Avulsa diretamente sem necessidade de pedido de venda anterior"
          >
            <Plus size={16} />
            <span>+ Emitir NF-e Avulsa</span>
          </button>

          {onNavigate && canConfigure && (
            <button
              onClick={() => onNavigate('fiscal_config')}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-purple-50 text-slate-700 border border-slate-200 font-bold text-xs rounded-2xl"
            >
              <Sliders size={14} className="text-purple-600" />
              Configurações de Nota Fiscal
            </button>
          )}
          <button
            onClick={() => setActiveTab('fila_emissao')}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-2xl"
          >
            <Send size={13} /> Emitir Nova NF-e
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total NF-e Autorizadas</span>
          <p className="text-2xl font-black text-slate-800">{totalNfeAutorizadas} Notas</p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Faturamento Fiscal</span>
          <p className="text-2xl font-black text-purple-700">{formatBRL(totalValorFaturado)}</p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fila de Emissão</span>
          <p className="text-2xl font-black text-amber-600">{pendingInDateRange.length} Vendas</p>
          <p className="text-xs text-slate-400">{formatBRL(totalValorPendente)}</p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 space-y-1 cursor-pointer hover:border-amber-300 transition-colors" onClick={() => setActiveTab('rascunhos')}>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rascunhos</span>
          <p className="text-2xl font-black text-amber-700">{draftsInDateRange.length} Notas</p>
          <p className="text-xs text-slate-400">Salvas para revisar e emitir</p>
        </div>
      </div>

      {/* Painel de Filtro de Período e Ações */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <DateFilterControl
          activePreset={activeDatePreset}
          startDate={startDate}
          endDate={endDate}
          onSelectPreset={applyDatePreset}
          onCustomDateChange={handleCustomDateChange}
          onReset={handleResetDateFilter}
          colorTheme="purple"
        />

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetAllFilters}
            className="text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shrink-0"
          >
            <X size={13} /> Limpar Filtros
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 flex-wrap">
        <button
          onClick={() => setActiveTab('notas_emitidas')}
          className={`px-5 py-3 rounded-2xl font-black text-xs uppercase ${activeTab === 'notas_emitidas' ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border'}`}
        >
          Notas Emitidas ({emittedInDateRange.length})
        </button>
        <button
          onClick={() => setActiveTab('fila_emissao')}
          className={`px-5 py-3 rounded-2xl font-black text-xs uppercase ${activeTab === 'fila_emissao' ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border'}`}
        >
          Fila ({pendingInDateRange.length})
        </button>
        <button
          onClick={() => setActiveTab('rascunhos')}
          className={`px-5 py-3 rounded-2xl font-black text-xs uppercase ${activeTab === 'rascunhos' ? 'bg-amber-600 text-white' : 'bg-white text-slate-600 border'}`}
        >
          Rascunhos ({draftsInDateRange.length})
        </button>
      </div>

      {activeTab === 'notas_emitidas' && (
        <div className="bg-white rounded-[2.5rem] border border-slate-200/80 p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1 min-w-[220px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Buscar por número, chave ou cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
            </div>
            <button
              type="button"
              onClick={syncAuthorizedFromSefaz}
              disabled={syncingAll}
              className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-[10px] font-black disabled:opacity-50 inline-flex items-center gap-1"
              title="Consulta a SEFAZ e atualiza notas que ainda aparecem como autorizadas"
            >
              <RefreshCw size={12} className={syncingAll ? 'animate-spin' : ''} />
              {syncingAll ? 'Atualizando…' : 'Atualizar status'}
            </button>
          </div>
          {filteredEmittedOrders.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <p className="text-sm font-bold text-slate-500">
                {emittedOrders.length === 0
                  ? 'Nenhuma nota fiscal emitida até o momento.'
                  : 'Nenhuma nota encontrada para os filtros e período selecionados.'}
              </p>
              {emittedOrders.length > 0 && hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetAllFilters}
                  className="text-xs font-bold text-purple-600 hover:text-purple-700 underline inline-block"
                >
                  Limpar filtros de data e busca
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[9px]">
                  <tr>
                    <th className="px-4 py-3">Nº</th>
                    <th className="px-4 py-3">Destinatário</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmittedOrders.map((row) => {
                    const customer = safeCustomers.find((c) => c.id === row.order.customerId);
                    return (
                      <tr key={`${row.order.id}-${row.nfe.id}`} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-black">
                          <div className="flex items-center gap-1.5">
                            <span>{row.nfe.nfeNumero ? `Nº ${row.nfe.nfeNumero}` : '—'}</span>
                            {(row.nfe.tipo === 'avulsa' || row.order.isAvulsa) && (
                              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[8px] font-black rounded-full uppercase">
                                Avulsa
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] font-bold text-slate-400">{row.order.reference}</p>
                        </td>
                        <td className="px-4 py-3">{customer?.name || 'Cliente Geral'}</td>
                        <td className={`px-4 py-3 ${row.nfe.nfeStatus === 'cancelada' ? 'font-black text-rose-700' : ''}`}>{nfeStatusLabel(row.nfe.nfeStatus)}</td>
                        <td className="px-4 py-3 text-right font-black">{formatBRL(row.nfe.total)}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => syncFromSefaz(row.order, row.nfe.id)}
                              disabled={syncingId === row.nfe.id || syncingAll}
                              className="px-2 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black disabled:opacity-50"
                            >
                              {syncingId === row.nfe.id ? '…' : 'SEFAZ'}
                            </button>
                            <button
                              onClick={() => {
                                setSelectedDanfeLinkedNfeId(row.nfe.id);
                                setSelectedDanfeOrder(row.order);
                              }}
                              className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-black inline-flex items-center gap-1"
                            >
                              <Eye size={12} /> DANFE
                            </button>
                            <button
                              onClick={() => openDuplicate(row.order, row.nfe.id)}
                              className="px-3 py-1.5 bg-white border border-purple-200 text-purple-800 rounded-xl text-[10px] font-black inline-flex items-center gap-1"
                              title="Emitir uma nota nova com os mesmos dados"
                            >
                              <Copy size={12} /> Duplicar
                            </button>
                          </div>
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

      {activeTab === 'fila_emissao' && (
        <div className="bg-white rounded-[2.5rem] border border-slate-200/80 p-6 space-y-3">
          {filteredPendingEmissionOrders.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <p className="text-sm font-bold text-slate-500">
                {pendingEmissionOrders.length === 0
                  ? 'Nenhum pedido aguardando emissão.'
                  : 'Nenhum pedido aguardando emissão no período selecionado.'}
              </p>
              {pendingEmissionOrders.length > 0 && hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetAllFilters}
                  className="text-xs font-bold text-purple-600 hover:text-purple-700 underline inline-block"
                >
                  Limpar filtros de data e busca
                </button>
              )}
            </div>
          ) : (
            filteredPendingEmissionOrders.map((order) => {
              const customer = safeCustomers.find((c) => c.id === order.customerId);
              const validation = fiscalService.validarDadosFiscais(order, customer);
              return (
                <div key={order.id} className="p-5 bg-slate-50 border border-slate-200 rounded-3xl space-y-3">
                  <div className="flex justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-black text-slate-900 text-sm">Pedido {order.reference}</p>
                      <p className="text-xs font-bold text-slate-700">Cliente: {customer?.name || 'Não identificado'}</p>
                      <p className="text-[11px] text-rose-700 font-bold">{validation.valid ? '' : validation.errors[0]}</p>
                    </div>
                    <div className="text-right space-y-2">
                      <p className="text-base font-black">{formatBRL(order.total)}</p>
                      <div className="flex justify-end gap-2 flex-wrap">
                        <button
                          onClick={() => openEmitFromOrder(order)}
                          className="px-4 py-2 bg-purple-600 text-white rounded-2xl text-xs font-black"
                        >
                          Emitir NF-e
                        </button>
                        <button
                          onClick={() => openEmitFromOrder(order, { avulsa: true })}
                          className="px-4 py-2 bg-white border border-purple-300 text-purple-800 rounded-2xl text-xs font-black"
                        >
                          NF avulsa
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {(order.items || []).map((it, idx) => (
                      <span key={idx} className="bg-white px-2.5 py-1 rounded-lg border font-bold">
                        {it.productName}: {it.quantity} {it.unit || 'Ton'}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'rascunhos' && (
        <div className="bg-white rounded-[2.5rem] border border-slate-200/80 p-6 space-y-3">
          {filteredDraftRows.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <p className="text-sm font-bold text-slate-500">
                {draftRows.length === 0
                  ? 'Nenhum rascunho de NF-e. Ao emitir, use "Salvar rascunho" para guardar e revisar depois.'
                  : 'Nenhum rascunho encontrado no período selecionado.'}
              </p>
              {draftRows.length > 0 && hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetAllFilters}
                  className="text-xs font-bold text-amber-600 hover:text-amber-700 underline inline-block"
                >
                  Limpar filtros de data e busca
                </button>
              )}
            </div>
          ) : (
            filteredDraftRows.map((row) => {
              const customer = safeCustomers.find((c) => c.id === row.order.customerId);
              return (
                <div key={`${row.order.id}-${row.nfe.id}`} className="p-5 bg-amber-50/60 border border-amber-200 rounded-3xl space-y-3">
                  <div className="flex justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-slate-900 text-sm">Pedido {row.order.reference}</p>
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-900 text-[9px] font-black rounded-full uppercase border border-amber-200">
                          Rascunho · {row.nfe.tipo}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-700">Cliente: {customer?.name || 'Não identificado'}</p>
                      <p className="text-[11px] text-slate-500 font-medium mt-1">
                        {row.nfe.nfeNaturezaOperacao || 'Natureza não informada'} · {row.nfe.items?.length || 0} item(ns)
                      </p>
                    </div>
                    <div className="text-right space-y-2">
                      <p className="text-base font-black">{formatBRL(row.nfe.total)}</p>
                      <div className="flex justify-end gap-2 flex-wrap">
                        <button
                          onClick={() => {
                            setSelectedDanfeLinkedNfeId(row.nfe.id);
                            setSelectedDanfeOrder(row.order);
                          }}
                          className="px-4 py-2 bg-white border border-amber-200 text-amber-900 rounded-2xl text-xs font-black flex items-center gap-1.5"
                        >
                          <FileText size={13} /> Prévia PDF
                        </button>
                        <button
                          onClick={() => openEmitFromOrder(row.order, {
                            avulsa: row.nfe.tipo === 'avulsa',
                            transferencia: row.nfe.tipo === 'transferencia',
                            draft: row.nfe,
                            step: 'edit',
                          })}
                          className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-2xl text-xs font-black flex items-center gap-1.5"
                        >
                          <FileEdit size={13} /> Editar
                        </button>
                        <button
                          onClick={() => openEmitFromOrder(row.order, {
                            avulsa: row.nfe.tipo === 'avulsa',
                            transferencia: row.nfe.tipo === 'transferencia',
                            draft: row.nfe,
                            step: 'preview',
                          })}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-xs font-black flex items-center gap-1.5"
                        >
                          <Eye size={13} /> Revisar e emitir
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modal de Emissão Avulsa / Direta */}
      {showAvulsaModal && (
        <EmitirNfeAvulsaModal
          customers={safeCustomers}
          inventory={inventory}
          config={config}
          company={company}
          currentUser={currentUser}
          orders={orders}
          transportadores={transportadores}
          onAddTransportador={onAddTransportador}
          duplicateFrom={duplicateDraft}
          onClose={() => {
            setShowAvulsaModal(false);
            setDuplicateDraft(null);
          }}
          onSuccess={(newOrder, linkedOrderId, withdrawal) => {
            if (linkedOrderId && withdrawal) {
              const targetOrder = (orders || []).find(o => o.id === linkedOrderId);
              if (targetOrder) {
                const existing = targetOrder.withdrawals || [];
                const updatedWithdrawals = [...existing, withdrawal];
                const updatedOrder: SaleOrder = {
                  ...targetOrder,
                  withdrawals: updatedWithdrawals
                };
                onUpdateOrder(updatedOrder);
              }
            } else {
              onUpdateOrder(newOrder);
            }
            const isDraft =
              newOrder.nfeStatus === 'rascunho' ||
              listDraftNfes(newOrder).length > 0;
            setShowAvulsaModal(false);
            setDuplicateDraft(null);
            if (!isDraft) {
              setSelectedDanfeOrder(newOrder);
            } else {
              setActiveTab('rascunhos');
            }
          }}
          onDraftSaved={(draftOrder) => {
            onUpdateOrder(draftOrder);
          }}
        />
      )}

      {/* Modal de Emissão Direta de Pedido Existente */}
      {orderToEmitNfe && (
        <ErrorBoundary label="emissão NF-e">
        <EmitirNfeModal
          order={orderToEmitNfe}
          customer={resolveCustomerForOrder(safeCustomers, orderToEmitNfe.customerId)}
          config={config}
          company={company}
          transportadores={transportadores}
          onAddTransportador={onAddTransportador}
          transferencia={isTransferenciaEmit}
          modo={isAvulsaEmit ? 'avulsa' : 'pedido'}
          draftNfe={draftToResume}
          initialStep={emitInitialStep}
          onClose={closeEmitModal}
          onDraftSaved={(updatedOrder) => {
            onUpdateOrder(updatedOrder);
            setOrderToEmitNfe(updatedOrder);
            const draft = listDraftNfes(updatedOrder).find((n) =>
              draftToResume ? n.id === draftToResume.id : true
            ) || listDraftNfes(updatedOrder)[0];
            if (draft) setDraftToResume(draft);
          }}
          onSuccess={async (updatedOrder) => {
            await onUpdateOrder(updatedOrder);
            closeEmitModal();
            const last = listOrderNfes(updatedOrder).filter((n) => !isDraftNfe(n)).slice(-1)[0]
              || listOrderNfes(updatedOrder).slice(-1)[0];
            if (last && !isDraftNfe(last)) {
              setSelectedDanfeLinkedNfeId(last.id);
              setSelectedDanfeOrder(updatedOrder);
            }
          }}
        />
        </ErrorBoundary>
      )}

      {/* Modal de Visualização de DANFE */}
      {selectedDanfeOrder && config && (
        <DanfeModal
          order={selectedDanfeOrder}
          linkedNfeId={selectedDanfeLinkedNfeId}
          customer={resolveCustomerForOrder(safeCustomers, selectedDanfeOrder.customerId)}
          config={config}
          company={company}
          onClose={() => {
            setSelectedDanfeOrder(null);
            setSelectedDanfeLinkedNfeId(undefined);
          }}
          onDuplicate={() => openDuplicate(selectedDanfeOrder, selectedDanfeLinkedNfeId)}
          onOrderUpdated={(updatedOrder) => {
            onUpdateOrder(updatedOrder);
            setSelectedDanfeOrder(updatedOrder);
          }}
        />
      )}
    </div>
  );
};

export default FiscalManagement;
