import React, { useEffect, useMemo, useState } from 'react';
import { Customer, Company, FiscalConfig, SaleOrder } from '../types';
import { fiscalService } from '../services/fiscalService';
import { explicarBloqueioEmissao, rotuloStatusNfe } from '../services/nfeGate';
import { DanfeModal } from './DanfeModal';
import { EmitirNfeModal } from './EmitirNfeModal';
import {
  FileText, BarChart3, Eye, Send, Search, AlertCircle, CheckCircle2, RefreshCw
} from 'lucide-react';

interface FiscalNotesPageProps {
  orders: SaleOrder[];
  customers: Customer[];
  company: Company;
  companyId?: string;
  onUpdateOrder: (order: SaleOrder) => void;
}

export const FiscalNotesPage: React.FC<FiscalNotesPageProps> = ({
  orders,
  customers,
  company,
  companyId,
  onUpdateOrder
}) => {
  const [config, setConfig] = useState<FiscalConfig | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedDanfeOrder, setSelectedDanfeOrder] = useState<SaleOrder | null>(null);
  const [orderToEmit, setOrderToEmit] = useState<SaleOrder | null>(null);

  useEffect(() => {
    fiscalService.getConfig(companyId).then(setConfig);
  }, [companyId]);

  const formatBRL = (val: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const gatedOrders = useMemo(() => {
    return orders.map((order) => {
      const customer = customers.find((c) => c.id === order.customerId);
      const gate = explicarBloqueioEmissao(order, customer, config);
      return { order, customer, gate };
    });
  }, [orders, customers, config]);

  const visible = gatedOrders.filter(({ order, customer }) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (order.reference || '').toLowerCase().includes(q) ||
      (order.nfeNumero || '').includes(searchQuery) ||
      (order.nfeChave || '').includes(searchQuery) ||
      (customer?.name || '').toLowerCase().includes(q) ||
      (order.nfeErro || '').toLowerCase().includes(q);

    if (!matchesSearch) return false;
    if (filterStatus === 'all') return true;
    if (filterStatus === 'nao_emitida') return !order.nfeStatus || order.nfeStatus === 'nao_emitida';
    if (filterStatus === 'bloqueada') {
      const pending = !order.nfeStatus || order.nfeStatus === 'nao_emitida';
      return pending && !explicarBloqueioEmissao(order, customer, config).valid;
    }
    return order.nfeStatus === filterStatus;
  });

  const totalAutorizadas = orders.filter((o) => o.nfeStatus === 'autorizada').length;
  const totalValor = orders.filter((o) => o.nfeStatus === 'autorizada').reduce((acc, o) => acc + (o.total || 0), 0);
  const pendentes = orders.filter((o) => !o.nfeStatus || o.nfeStatus === 'nao_emitida' || o.nfeStatus === 'rejeitada').length;

  const statusClass = (status?: string) => {
    if (status === 'autorizada') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'cancelada' || status === 'rejeitada') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (status === 'processando') return 'bg-amber-50 text-amber-800 border-amber-200';
    if (status === 'simulada') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="animate-spin text-purple-600" size={22} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Notas Fiscais (NF-e)</h1>
          <p className="text-sm font-bold text-slate-400 mt-1">
            Notas emitidas, situação na SEFAZ e nova emissão. A configuração fiscal fica em Configurações.
          </p>
        </div>
        <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${
          config.environment === 'production'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          {config.environment === 'production' ? 'Produção SEFAZ' : 'Sandbox / Homologação'}
        </span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-[1.75rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><FileText size={20} /></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Autorizadas</p>
            <h3 className="text-xl font-black text-slate-800">{totalAutorizadas}</h3>
          </div>
        </div>
        <div className="bg-white p-5 rounded-[1.75rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl"><BarChart3 size={20} /></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Faturado em NF-e</p>
            <h3 className="text-xl font-black text-slate-800">{formatBRL(totalValor)}</h3>
          </div>
        </div>
        <div className="bg-white p-5 rounded-[1.75rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><AlertCircle size={20} /></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pendentes / rejeitadas</p>
            <h3 className="text-xl font-black text-slate-800">{pendentes}</h3>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-5 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-slate-50/40">
          <div>
            <h2 className="text-base font-black text-slate-800">Livro de notas</h2>
            <p className="text-xs text-slate-400 font-medium">Se estiver bloqueada, o motivo aparece na linha.</p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Nº, chave, cliente ou motivo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
            >
              <option value="all">Todos</option>
              <option value="autorizada">Autorizadas</option>
              <option value="processando">Processando</option>
              <option value="rejeitada">Rejeitadas</option>
              <option value="nao_emitida">Não emitidas</option>
              <option value="bloqueada">Bloqueadas (com motivo)</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                <th className="px-5 py-3">Documento</th>
                <th className="px-5 py-3">Destinatário</th>
                <th className="px-5 py-3">Situação</th>
                <th className="px-5 py-3">Motivo / observação</th>
                <th className="px-5 py-3 text-right">Valor</th>
                <th className="px-5 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-14 text-slate-400 font-medium">
                    Nenhuma nota neste filtro.
                  </td>
                </tr>
              ) : (
                visible.map(({ order, customer, gate }) => (
                  <tr key={order.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-800">
                        {order.nfeNumero ? `NF-e ${order.nfeNumero}` : order.reference}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">{order.date}</p>
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-800">{customer?.name || 'Cliente não encontrado'}</td>
                    <td className="px-5 py-4">
                      <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase border ${statusClass(order.nfeStatus)}`}>
                        {rotuloStatusNfe(order.nfeStatus)}
                      </span>
                    </td>
                    <td className="px-5 py-4 max-w-sm">
                      {order.nfeErro ? (
                        <p className="text-[11px] font-bold text-rose-700 flex items-start gap-1.5">
                          <AlertCircle size={13} className="shrink-0 mt-0.5" /> {order.nfeErro}
                        </p>
                      ) : !gate.valid && (!order.nfeStatus || order.nfeStatus === 'nao_emitida') ? (
                        <p className="text-[11px] font-bold text-amber-800 flex items-start gap-1.5">
                          <AlertCircle size={13} className="shrink-0 mt-0.5" /> {gate.summary}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-400 font-medium flex items-start gap-1.5">
                          <CheckCircle2 size={13} className="shrink-0 mt-0.5 text-emerald-500" />
                          {order.nfeChave ? `Chave …${order.nfeChave.slice(-8)}` : 'Sem pendência cadastral'}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right font-black text-slate-800">{formatBRL(order.total)}</td>
                    <td className="px-5 py-4 text-center">
                      {order.nfeStatus === 'autorizada' || order.nfeStatus === 'cancelada' || order.nfeStatus === 'simulada' ? (
                        <button
                          onClick={() => setSelectedDanfeOrder(order)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-bold"
                        >
                          <Eye size={12} /> DANFE
                        </button>
                      ) : (
                        <button
                          onClick={() => setOrderToEmit(order)}
                          title={gate.valid ? 'Emitir NF-e' : gate.summary}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-bold"
                        >
                          <Send size={12} /> Emitir
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedDanfeOrder && (
        <DanfeModal
          order={selectedDanfeOrder}
          customer={customers.find((c) => c.id === selectedDanfeOrder.customerId) || customers[0]}
          config={config}
          company={company}
          onClose={() => setSelectedDanfeOrder(null)}
          onOrderUpdated={(updated) => {
            onUpdateOrder(updated);
            setSelectedDanfeOrder(updated);
          }}
        />
      )}

      {orderToEmit && (
        <EmitirNfeModal
          order={orderToEmit}
          customer={customers.find((c) => c.id === orderToEmit.customerId) || customers[0]}
          config={config}
          company={company}
          onClose={() => setOrderToEmit(null)}
          onSuccess={(updated) => {
            onUpdateOrder(updated);
            setOrderToEmit(null);
          }}
        />
      )}
    </div>
  );
};

export default FiscalNotesPage;
