import React, { useState, useEffect } from 'react';
import { FiscalConfig, SaleOrder, Customer, Company, View, InventoryItem, User, Transportador } from '../types';
import { fiscalService } from '../services/fiscalService';
import { listOrderNfes, overlayNfeFields, totalRemainingQuantity, commitLinkedNfeSync, findLinkedNfe } from '../services/saleNfe';
import {
  FileText, CheckCircle2, AlertCircle, RefreshCw, Send, Eye,
  Layers, BarChart3, Check, Search, Sliders, FileCheck, Clock,
  Copy, ArrowRightLeft, AlertTriangle, Plus
} from 'lucide-react';
import { DanfeModal } from './DanfeModal';
import { EmitirNfeModal } from './EmitirNfeModal';
import { EmitirNfeAvulsaModal } from './EmitirNfeAvulsaModal';
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
  onAddOrder,
  onNavigate,
  canConfigure = false
}) => {
  const [config, setConfig] = useState<FiscalConfig | null>(null);
  const [selectedDanfeOrder, setSelectedDanfeOrder] = useState<SaleOrder | null>(null);
  const [selectedDanfeLinkedNfeId, setSelectedDanfeLinkedNfeId] = useState<string | undefined>(undefined);
  const [orderToEmitNfe, setOrderToEmitNfe] = useState<SaleOrder | null>(null);
  const [isTransferenciaEmit, setIsTransferenciaEmit] = useState(false);
  const [isAvulsaEmit, setIsAvulsaEmit] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'notas_emitidas' | 'fila_emissao'>('notas_emitidas');
  const [showAvulsaModal, setShowAvulsaModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sefazStatus, setSefazStatus] = useState<{ status: string; mensagem: string; loading: boolean } | null>(null);

  const [syncingId, setSyncingId] = useState<string | null>(null);

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

  const nfeStatusLabel = (status?: string) => {
    if (status === 'autorizada') return 'Autorizada';
    if (status === 'rejeitada') return 'Rejeitada';
    if (status === 'cancelada') return 'Cancelada';
    if (status === 'processando') return 'Processando';
    return status || 'Não emitida';
  };

  const syncFromSefaz = async (order: SaleOrder, linkedNfeId?: string) => {
    if (!config) return;
    setSyncingId(order.id);
    try {
      const linked = findLinkedNfe(order, linkedNfeId);
      const view = linked ? overlayNfeFields(order, linked) : order;
      const updated = await fiscalService.sincronizarPedidoComSefaz(view, config);
      onUpdateOrder(commitLinkedNfeSync(order, updated, linkedNfeId));
    } finally {
      setSyncingId(null);
    }
  };

  const safeOrders = orders || [];
  const safeCustomers = customers || [];
  const nfeRows = safeOrders.flatMap((order) =>
    listOrderNfes(order).map((nfe) => ({
      order,
      nfe,
      overlay: overlayNfeFields(order, nfe),
    }))
  );
  const emittedOrders = nfeRows;
  const pendingEmissionOrders = safeOrders.filter(
    (o) => totalRemainingQuantity(o) > 0.0001
  );

  const filteredEmittedOrders = emittedOrders.filter((row) => {
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

  const totalNfeAutorizadas = nfeRows.filter((r) => r.nfe.nfeStatus === 'autorizada').length;
  const totalValorFaturado = nfeRows
    .filter((r) => r.nfe.nfeStatus === 'autorizada')
    .reduce((acc, r) => acc + (r.nfe.total || 0), 0);
  const totalValorPendente = pendingEmissionOrders.reduce((acc, o) => acc + (o.total || 0), 0);

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
            onClick={() => setShowAvulsaModal(true)}
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
          <p className="text-2xl font-black text-amber-600">{pendingEmissionOrders.length} Vendas</p>
          <p className="text-xs text-slate-400">{formatBRL(totalValorPendente)}</p>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Última NF-e</span>
          <p className="text-2xl font-black text-slate-800">
            {emittedOrders[0]?.nfe.nfeNumero ? `Nº ${emittedOrders[0].nfe.nfeNumero}` : '—'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('notas_emitidas')}
          className={`px-5 py-3 rounded-2xl font-black text-xs uppercase ${activeTab === 'notas_emitidas' ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border'}`}
        >
          Notas Emitidas ({emittedOrders.length})
        </button>
        <button
          onClick={() => setActiveTab('fila_emissao')}
          className={`px-5 py-3 rounded-2xl font-black text-xs uppercase ${activeTab === 'fila_emissao' ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border'}`}
        >
          Fila ({pendingEmissionOrders.length})
        </button>
      </div>

      {activeTab === 'notas_emitidas' && (
        <div className="bg-white rounded-[2.5rem] border border-slate-200/80 p-6 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Buscar por número, chave ou cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
            />
          </div>
          {filteredEmittedOrders.length === 0 ? (
            <p className="text-sm font-bold text-slate-500 py-10 text-center">Nenhuma nota encontrada.</p>
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
                        <td className="px-4 py-3">{nfeStatusLabel(row.nfe.nfeStatus)}</td>
                        <td className="px-4 py-3 text-right font-black">{formatBRL(row.nfe.total)}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => syncFromSefaz(row.order, row.nfe.id)}
                              disabled={syncingId === row.order.id}
                              className="px-2 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black disabled:opacity-50"
                            >
                              {syncingId === row.order.id ? '…' : 'SEFAZ'}
                            </button>
                            <button
                              onClick={() => {
                                setSelectedDanfeLinkedNfeId(row.nfe.id);
                                setSelectedDanfeOrder(row.order);
                              }}
                              className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-black"
                            >
                              <Eye size={12} /> DANFE
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
          {pendingEmissionOrders.length === 0 ? (
            <p className="text-sm font-bold text-slate-500 py-10 text-center">Nenhuma venda pendente de NF-e.</p>
          ) : (
            pendingEmissionOrders.map((order) => {
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
                          onClick={() => { setIsAvulsaEmit(false); setIsTransferenciaEmit(false); setOrderToEmitNfe(order); }}
                          className="px-4 py-2 bg-purple-600 text-white rounded-2xl text-xs font-black"
                        >
                          Emitir NF-e
                        </button>
                        <button
                          onClick={() => { setIsAvulsaEmit(true); setIsTransferenciaEmit(false); setOrderToEmitNfe(order); }}
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

      {/* Modal de Emissão Avulsa / Direta */}
      {showAvulsaModal && (
        <EmitirNfeAvulsaModal
          customers={safeCustomers}
          inventory={inventory}
          config={config}
          company={company}
          currentUser={currentUser}
          transportadores={transportadores}
          onAddTransportador={onAddTransportador}
          onClose={() => setShowAvulsaModal(false)}
          onSuccess={(newOrder) => {
            if (onAddOrder) {
              onAddOrder(newOrder);
            } else {
              onUpdateOrder(newOrder);
            }
            setShowAvulsaModal(false);
            setSelectedDanfeOrder(newOrder);
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
          onClose={() => { setOrderToEmitNfe(null); setIsTransferenciaEmit(false); setIsAvulsaEmit(false); }}
          onSuccess={(updatedOrder) => {
            onUpdateOrder(updatedOrder);
            setOrderToEmitNfe(null);
            setIsTransferenciaEmit(false);
            setIsAvulsaEmit(false);
            const last = listOrderNfes(updatedOrder).slice(-1)[0];
            setSelectedDanfeLinkedNfeId(last?.id);
            setSelectedDanfeOrder(updatedOrder);
          }}
        />
        </ErrorBoundary>
      )}

      {/* Modal de Visualização de DANFE */}
      {selectedDanfeOrder && (
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
