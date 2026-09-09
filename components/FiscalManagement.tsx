import React, { useState, useEffect } from 'react';
import { FiscalConfig, SaleOrder, Customer, Company, View } from '../types';
import { fiscalService } from '../services/fiscalService';
import {
  FileText, CheckCircle2, AlertCircle, RefreshCw, Send, Eye,
  Layers, BarChart3, Check, Search, Sliders, FileCheck, Clock,
  Copy, ArrowRightLeft, AlertTriangle
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
  canConfigure?: boolean;
}

export const FiscalManagement: React.FC<FiscalManagementProps> = ({
  orders,
  customers,
  company,
  companyId,
  onUpdateOrder,
  onNavigate,
  canConfigure = false
}) => {
  const [config, setConfig] = useState<FiscalConfig | null>(null);
  const [selectedDanfeOrder, setSelectedDanfeOrder] = useState<SaleOrder | null>(null);
  const [orderToEmitNfe, setOrderToEmitNfe] = useState<SaleOrder | null>(null);
  const [isTransferenciaEmit, setIsTransferenciaEmit] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'notas_emitidas' | 'fila_emissao'>('notas_emitidas');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sefazStatus, setSefazStatus] = useState<{ status: string; mensagem: string; loading: boolean } | null>(null);

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

  const safeOrders = orders || [];
  const safeCustomers = customers || [];
  const emittedOrders = safeOrders.filter((o) => o.nfeStatus && o.nfeStatus !== 'nao_emitida');
  const pendingEmissionOrders = safeOrders.filter(
    (o) => !o.nfeStatus || o.nfeStatus === 'nao_emitida' || o.nfeStatus === 'rejeitada'
  );

  const filteredEmittedOrders = emittedOrders.filter((o) => {
    const cust = safeCustomers.find((c) => c.id === o.customerId);
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (o.reference || '').toLowerCase().includes(q) ||
      (o.nfeNumero || '').includes(searchQuery) ||
      (o.nfeChave || '').includes(searchQuery) ||
      (cust?.name || '').toLowerCase().includes(q) ||
      (cust?.document || '').includes(searchQuery);
    if (filterStatus === 'all') return matchesSearch;
    return matchesSearch && o.nfeStatus === filterStatus;
  });

  const totalNfeAutorizadas = safeOrders.filter((o) => o.nfeStatus === 'autorizada').length;
  const totalValorFaturado = safeOrders
    .filter((o) => o.nfeStatus === 'autorizada')
    .reduce((acc, o) => acc + (o.total || 0), 0);
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
            {emittedOrders[0]?.nfeNumero ? `Nº ${emittedOrders[0].nfeNumero}` : '—'}
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
                  {filteredEmittedOrders.map((order) => {
                    const customer = safeCustomers.find((c) => c.id === order.customerId);
                    return (
                      <tr key={order.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-black">{order.nfeNumero ? `Nº ${order.nfeNumero}` : '—'}</td>
                        <td className="px-4 py-3">{customer?.name || 'Cliente Geral'}</td>
                        <td className="px-4 py-3">{order.nfeStatus || 'nao_emitida'}</td>
                        <td className="px-4 py-3 text-right font-black">{formatBRL(order.total)}</td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => setSelectedDanfeOrder(order)} className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-black">
                            <Eye size={12} /> DANFE
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
                    <div className="text-right">
                      <p className="text-base font-black">{formatBRL(order.total)}</p>
                      <button
                        onClick={() => { setIsTransferenciaEmit(false); setOrderToEmitNfe(order); }}
                        className="mt-2 px-4 py-2 bg-purple-600 text-white rounded-2xl text-xs font-black"
                      >
                        Emitir NF-e
                      </button>
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

      {orderToEmitNfe && (
        <EmitirNfeModal
          order={orderToEmitNfe}
          customer={safeCustomers.find((c) => c.id === orderToEmitNfe.customerId) as Customer}
          config={config}
          company={company}
          transferencia={isTransferenciaEmit}
          onClose={() => { setOrderToEmitNfe(null); setIsTransferenciaEmit(false); }}
          onSuccess={(updatedOrder) => {
            onUpdateOrder(updatedOrder);
            setOrderToEmitNfe(null);
            setIsTransferenciaEmit(false);
            setSelectedDanfeOrder(updatedOrder);
          }}
        />
      )}

      {selectedDanfeOrder && (
        <DanfeModal
          order={selectedDanfeOrder}
          customer={safeCustomers.find((c) => c.id === selectedDanfeOrder.customerId) as Customer}
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

export default FiscalManagement;
