import React, { useMemo } from 'react';
import {
  Transaction, InventoryItem, Customer, TransactionType, View, User,
  SaleOrder, FinancialAccount, OrderStatus, TransferShipment, TransferStatus
} from '../types';
import { ArrowRight, Package, Scale, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { isFiscalOnlyOrder, orderReceiptsPaid } from '../services/saleNfe';

interface DashboardProps {
  transactions: Transaction[];
  inventory: InventoryItem[];
  customers: Customer[];
  orders?: SaleOrder[];
  accounts?: FinancialAccount[];
  transfers?: TransferShipment[];
  user?: User | null;
  onNavigate?: (view: View) => void;
}

const brl = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const tons = (n: number) => `${(Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const isoDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

const stockOf = (inventory: InventoryItem[], keys: string[]) =>
  inventory.find((i) => keys.some((k) => (i.id || '').toLowerCase().includes(k) || (i.name || '').toLowerCase().includes(k)));

const Dashboard: React.FC<DashboardProps> = ({
  transactions, inventory, customers, orders = [], accounts = [], transfers = [],
  user, onNavigate
}) => {
  const today = todayISO();
  const commercialOrders = useMemo(
    () => orders.filter((o) => !isFiscalOnlyOrder(o)),
    [orders]
  );
  const romaneios = useMemo(() => commercialOrders.filter((o) =>
    o.status === OrderStatus.FINALIZED && (o.withdrawalStatus === 'aguardando' || o.withdrawalStatus === 'parcial' || !o.withdrawalStatus)
  ).slice(0, 7), [commercialOrders]);
  const remessas = useMemo(() =>
    transfers.filter((t) => t.status === 'EM_TRANSITO').slice(0, 5), [transfers]);
  const moido = stockOf(inventory, ['moido', 'moído', 'moido']);
  const britado = stockOf(inventory, ['britado']);
  const pendingNfe = commercialOrders.filter((o) =>
    o.status === OrderStatus.FINALIZED && (!o.nfeStatus || o.nfeStatus === 'nao_emitida' || o.nfeStatus === 'processando' || o.nfeStatus === 'rascunho')
  ).slice(0, 5);
  const rejectedNfe = commercialOrders.filter((o) => o.nfeStatus === 'rejeitada').slice(0, 4);
  const dayTx = transactions.filter((t) => (t.date || '').slice(0, 10) === today);
  const cashIn = (t: Transaction) => Number(t.paidAmount || 0);
  const cashOut = (t: Transaction) => Number(t.paidAmount || 0);
  const entradas = dayTx.filter((t) => t.type === TransactionType.SALE).reduce((s, t) => s + cashIn(t), 0);
  const saidas = dayTx.filter((t) => t.type !== TransactionType.SALE).reduce((s, t) => s + cashOut(t), 0);
  const saldoContas = accounts.reduce((s, a) => s + Number(a.initialBalance || 0), 0);
  const saldoDia = saldoContas + dayTx.reduce((s, t) => {
    const v = Number(t.paidAmount || 0);
    return t.type === TransactionType.SALE ? s + v : s - v;
  }, 0);
  const custName = (id?: string) => customers.find((c) => c.id === id)?.name || 'Cliente';
  const strategic = useMemo(() => {
    const start = isoDaysAgo(29);
    const finalized = commercialOrders.filter((o) => o.status === OrderStatus.FINALIZED && (o.date || '') >= start);
    const soldValue = finalized.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const soldTons = finalized.reduce((sum, order) => sum + (order.items || []).reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0), 0);
    const received = finalized.reduce((sum, order) => sum + orderReceiptsPaid(order), 0);
    const openReceivable = Math.max(0, soldValue - received);
    const chart = Array.from({ length: 7 }, (_, index) => {
      const date = isoDaysAgo(6 - index);
      const daily = transactions.filter((tx) => (tx.paymentDate || tx.date || '').slice(0, 10) === date);
      const receivedDay = daily.filter((tx) => tx.type === TransactionType.SALE)
        .reduce((sum, tx) => sum + Number(tx.paidAmount || 0), 0);
      const spentDay = daily.filter((tx) => tx.type !== TransactionType.SALE)
        .reduce((sum, tx) => sum + Number(tx.paidAmount || 0), 0);
      return { day: new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), entradas: receivedDay, saidas: spentDay };
    });
    return {
      soldValue,
      soldTons,
      received,
      openReceivable,
      averageTicket: finalized.length ? soldValue / finalized.length : 0,
      chart
    };
  }, [commercialOrders, transactions]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Escritório operacional</h2>
          <p className="text-sm text-slate-500 mt-0.5">Fila de carga, estoque ao vivo e alerta fiscal em tempo real.</p>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Dados atualizados agora
        </span>
      </header>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-5 items-start">
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-1 w-1.5 h-5 rounded-full bg-slate-800" />
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-slate-800">Fila operacional</p>
                <p className="text-xs text-slate-500">Controle de entrada, balança e carregamentos ativos</p>
              </div>
            </div>
            <span className="min-w-7 h-7 px-2 grid place-items-center text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100 rounded-full">{romaneios.length + remessas.length}</span>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Romaneios a carregar <span className="normal-case tracking-normal font-normal text-slate-400 ml-1">Sequência prioritária de carregamento</span></p>
              <p className="text-xs text-slate-500 whitespace-nowrap">Peso total: <span className="font-mono font-semibold text-slate-800 bg-white border border-slate-200 rounded-md px-2 py-1 ml-1">{tons(romaneios.reduce((s, o) => s + (o.items || []).reduce((x, i) => x + Number(i.quantity || 0), 0), 0))}</span></p>
            </div>
            {romaneios.length === 0 && <p className="text-sm text-slate-500 py-4">Nenhum romaneio na fila.</p>}
            {romaneios.map((o, idx) => {
              const qty = (o.items || []).reduce((s, i) => s + Number(i.quantity || 0), 0);
              const product = o.items?.[0]?.productName || '';
              const partial = o.withdrawalStatus === 'parcial';
              return (
                <button key={o.id} type="button" onClick={() => onNavigate?.('orders')} className="w-full text-left flex items-center gap-3 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/70 rounded-lg px-1">
                  <span className="w-7 h-7 shrink-0 grid place-items-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600">{idx + 1}</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-800">{o.reference}</span>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded border ${partial ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{partial ? 'Em pátio' : 'Aguardando'}</span>
                    </span>
                    <span className="block text-xs text-slate-500 uppercase truncate mt-0.5">{custName(o.customerId)}</span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block font-mono text-sm font-semibold text-slate-900">{qty.toFixed(1)} t</span>
                    {product && <span className="block text-[11px] text-slate-400 truncate max-w-[160px]">{product}</span>}
                  </span>
                </button>
              );
            })}
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-5 mb-2">Transferências aguardando fazenda</p>
            {remessas.length === 0 && (
              <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm text-slate-600">
                <span>Nenhuma remessa em trânsito no momento.</span>
                <span className="text-emerald-700 font-medium text-xs">0 pendências</span>
              </div>
            )}
            {remessas.map((t) => (
              <button key={t.id} type="button" onClick={() => onNavigate?.('transfers')} className="w-full text-left py-2.5 border-b border-slate-100 last:border-0">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="font-mono font-semibold text-slate-800">{t.code}</span>
                  <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">Em trânsito</span>
                </div>
                <p className="text-xs text-slate-500 truncate">{t.originLocation} → {t.destinationLocation}</p>
              </button>
            ))}
            <div className="flex items-center justify-between mt-4">
              <button type="button" onClick={() => onNavigate?.('yard')} className="text-sm font-semibold text-emerald-700 inline-flex items-center gap-1">Ver filas completas <ArrowRight size={14} /></button>
              <span className="text-xs text-slate-400">Atualização automática contínua</span>
            </div>
          </div>
        </section>
        <div className="space-y-5">
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <p className="flex items-center gap-2.5 text-sm font-bold uppercase tracking-wider text-slate-800"><span className="w-1.5 h-4 rounded-full bg-emerald-600" /> Estoque ao vivo</p>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">{[moido, britado].some((i) => i && Number(i.quantity || 0) <= Number(i.minStock || 0)) ? 'Atenção' : 'Silos OK'}</span>
            </div>
            <div className="p-5 space-y-4">
              {[moido, britado].filter(Boolean).map((item) => {
                const qty = Number(item!.quantity || 0);
                const min = Number(item!.minStock || 0) || 1;
                const cap = Math.max(qty, min * 3, 1);
                const pct = Math.min(100, Math.round((qty / cap) * 100));
                return (
                  <div key={item!.id} className="border border-slate-100 bg-slate-50/40 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{item!.name}</p>
                      <span className="text-[11px] text-slate-500 border border-slate-200 bg-white rounded-md px-1.5 py-0.5 whitespace-nowrap">mínimo {tons(min)}</span>
                    </div>
                    <p className="font-mono text-3xl font-semibold text-slate-900 mt-1">{qty.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}<span className="text-base text-slate-400 ml-1">t</span></p>
                    <div className="flex justify-between text-xs text-slate-500 mt-2 mb-1.5"><span>Capacidade ocupada</span><span className="font-semibold text-slate-700">{pct}%</span></div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${qty <= min ? 'bg-amber-500' : 'bg-emerald-600'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {inventory.length === 0 && <p className="text-sm text-slate-500">Sem estoque carregado.</p>}
              <button type="button" onClick={() => onNavigate?.('inventory')} className="text-sm font-semibold text-emerald-700 inline-flex items-center gap-1">Ver estoque completo <ArrowRight size={14} /></button>
            </div>
          </section>
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <p className="flex items-center gap-2.5 text-sm font-bold uppercase tracking-wider text-slate-800"><span className="w-1.5 h-4 rounded-full bg-amber-500" /> Alertas fiscais</p>
              <span className="min-w-7 h-7 px-2 grid place-items-center text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full">{pendingNfe.length + rejectedNfe.length}</span>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-orange-700 uppercase tracking-wider">Pendentes de emissão</p>
                <p className="font-mono text-[11px] text-slate-500">Total: {brl(pendingNfe.reduce((s, o) => s + Number(o.total || 0), 0))}</p>
              </div>
              {pendingNfe.length === 0 && <p className="text-sm text-slate-500 py-2">Nada pendente.</p>}
              {pendingNfe.map((o) => (
                <button key={o.id} type="button" onClick={() => onNavigate?.('fiscal')} className="w-full text-left py-2.5 border-b border-slate-100 last:border-0 flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-mono text-sm font-medium text-slate-800">{o.reference}</span>
                    <span className="block text-xs text-slate-500 uppercase truncate">{custName(o.customerId)}</span>
                  </span>
                  <span className="font-mono text-sm text-orange-700 whitespace-nowrap">{brl(o.total)}</span>
                </button>
              ))}
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-5 mb-2">Rejeitadas</p>
              {rejectedNfe.length === 0 && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">✓ Nenhuma rejeição fiscal na SEFAZ.</p>}
              {rejectedNfe.map((o) => (
                <button key={o.id} type="button" onClick={() => onNavigate?.('fiscal')} className="w-full text-left py-2 text-sm flex justify-between border-b border-slate-100 last:border-0">
                  <span className="font-mono font-medium text-slate-800">{o.reference}</span>
                  <span className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">Rejeitada</span>
                </button>
              ))}
              <button type="button" onClick={() => onNavigate?.('fiscal')} className="mt-4 text-sm font-semibold text-emerald-700 inline-flex items-center gap-1">Abrir notas fiscais <ArrowRight size={14} /></button>
            </div>
          </section>
        </div>
      </div>
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl p-4 min-h-[280px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Liquidez dos últimos 7 dias</p>
              <p className="text-xs text-slate-500">Entradas recebidas x saídas efetivamente pagas.</p>
            </div>
            <button type="button" onClick={() => onNavigate?.('cashflow')} className="text-xs font-semibold text-blue-700">Abrir fluxo</button>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={strategic.chart} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tickFormatter={(value) => `R$${Math.round(Number(value) / 1000)}k`} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <Tooltip formatter={(value: number) => brl(value)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="entradas" name="Entradas" fill="#059669" radius={[4, 4, 0, 0]} />
              <Bar dataKey="saidas" name="Saídas" fill="#e11d48" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-slate-900 rounded-xl p-4 text-white space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Radar comercial · 30 dias</p>
            <p className="text-xs text-slate-500">Indicadores para decidir compra, venda e cobrança.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-slate-400">Faturado</p><p className="text-lg font-semibold text-emerald-400">{brl(strategic.soldValue)}</p></div>
            <div><p className="text-xs text-slate-400">A receber</p><p className="text-lg font-semibold text-amber-300">{brl(strategic.openReceivable)}</p></div>
            <div><p className="text-xs text-slate-400">Volume vendido</p><p className="text-lg font-semibold">{tons(strategic.soldTons)}</p></div>
            <div><p className="text-xs text-slate-400">Ticket médio</p><p className="text-lg font-semibold">{brl(strategic.averageTicket)}</p></div>
          </div>
          <button type="button" onClick={() => onNavigate?.('orders')} className="w-full text-left text-xs font-semibold text-blue-200 border-t border-white/10 pt-3">Conferir vendas e recebimentos <ArrowRight size={12} className="inline" /></button>
        </div>
      </section>
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2"><Wallet size={13} /> Caixa do dia</p>
          <button type="button" onClick={() => onNavigate?.('daily')} className="text-xs font-semibold text-blue-700">Ver fluxo</button>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[11px]">
            <tr>
              <th className="text-left font-semibold px-4 py-2">Descrição</th>
              <th className="text-right font-semibold px-4 py-2">Entradas</th>
              <th className="text-right font-semibold px-4 py-2">Saídas</th>
              <th className="text-right font-semibold px-4 py-2">Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100">
              <td className="px-4 py-2.5 text-slate-600">Movimento de hoje ({dayTx.length} lançamentos)</td>
              <td className="px-4 py-2.5 text-right text-emerald-700 font-medium">{brl(entradas)}</td>
              <td className="px-4 py-2.5 text-right text-rose-600 font-medium">{brl(saidas)}</td>
              <td className="px-4 py-2.5 text-right font-semibold">{brl(entradas - saidas)}</td>
            </tr>
            <tr className="border-t border-slate-100 bg-slate-50/60">
              <td className="px-4 py-2.5 font-semibold text-slate-700"><Scale size={12} className="inline mr-1" /> Posição estimada nas contas</td>
              <td /><td />
              <td className={`px-4 py-2.5 text-right font-semibold ${saldoDia >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{brl(saldoDia)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
};

export default Dashboard;
