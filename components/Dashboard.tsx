import React, { useMemo } from 'react';
import {
  Transaction, InventoryItem, Customer, View, User,
  SaleOrder, FinancialAccount, OrderStatus, TransferShipment, RecurringBill, Employee
} from '../types';
import { ArrowRight, Package, Scale, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { OnboardingChecklist } from './OnboardingChecklist';
import { accountLedgerBalance, cashInPeriod, cashOnDate, openBooks, titleBalance } from '../services/financeMath';

interface DashboardProps {
  transactions: Transaction[];
  inventory: InventoryItem[];
  customers: Customer[];
  orders?: SaleOrder[];
  accounts?: FinancialAccount[];
  transfers?: TransferShipment[];
  recurringBills?: RecurringBill[];
  employees?: Employee[];
  user?: User | null;
  onNavigate?: (view: View) => void;
  onOpenOnboardingModal?: () => void;
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
  recurringBills = [], employees = [],
  user, onNavigate, onOpenOnboardingModal
}) => {
  const today = todayISO();
  const romaneios = useMemo(() => orders.filter((o) =>
    o.status === OrderStatus.FINALIZED && (o.withdrawalStatus === 'aguardando' || o.withdrawalStatus === 'parcial' || !o.withdrawalStatus)
  ).slice(0, 7), [orders]);
  const remessas = useMemo(() =>
    transfers.filter((t) => t.status === 'EM_TRANSITO').slice(0, 5), [transfers]);
  const moido = stockOf(inventory, ['moido', 'moído', 'moido']);
  const britado = stockOf(inventory, ['britado']);
  const pendingNfe = orders.filter((o) =>
    o.status === OrderStatus.FINALIZED && (!o.nfeStatus || o.nfeStatus === 'nao_emitida' || o.nfeStatus === 'processando')
  ).slice(0, 5);
  const rejectedNfe = orders.filter((o) => o.nfeStatus === 'rejeitada').slice(0, 4);
  const dayCash = cashOnDate(transactions, today);
  const entradas = dayCash.inflow;
  const saidas = dayCash.outflow;
  const saldoContas = accounts.reduce((s, a) => s + accountLedgerBalance(a, transactions), 0);
  const books = openBooks(transactions);
  const payrollOpen = transactions
    .filter((tx) => tx.origin === 'payroll')
    .reduce((sum, tx) => sum + titleBalance(tx), 0);
  const recurringOpen = transactions
    .filter((tx) => tx.origin === 'recurring')
    .reduce((sum, tx) => sum + titleBalance(tx), 0);
  const custName = (id?: string) => customers.find((c) => c.id === id)?.name || 'Cliente';
  const strategic = useMemo(() => {
    const start = isoDaysAgo(29);
    const finalized = orders.filter((o) => o.status === OrderStatus.FINALIZED && (o.date || '') >= start);
    const soldValue = finalized.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const soldTons = finalized.reduce((sum, order) => sum + (order.items || []).reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0), 0);
    const chart = Array.from({ length: 7 }, (_, index) => {
      const date = isoDaysAgo(6 - index);
      const daily = cashOnDate(transactions, date);
      return { day: new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), entradas: daily.inflow, saidas: daily.outflow };
    });
    return {
      soldValue,
      soldTons,
      received: cashInPeriod(transactions, start).inflow,
      openReceivable: books.receivableOpen,
      averageTicket: finalized.length ? soldValue / finalized.length : 0,
      chart
    };
  }, [orders, transactions, books.receivableOpen]);

  return (
    <div className="space-y-4">
      {user && (
        <OnboardingChecklist user={user} customers={customers} orders={orders} transactions={transactions} accounts={accounts} onNavigate={onNavigate} onOpenOnboardingModal={onOpenOnboardingModal} />
      )}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight">Escritório operacional</h2>
          <p className="text-xs text-slate-500">Fila de carga, estoque ao vivo e alerta fiscal.</p>
        </div>
        <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-md">Dados atualizados agora</span>
      </header>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button type="button" onClick={() => onNavigate?.('receivable')} className="bg-white border border-slate-200 rounded-xl p-3 text-left">
          <p className="text-[10px] uppercase font-bold text-slate-400">A receber</p>
          <p className="text-lg font-black text-emerald-700">{brl(books.receivableOpen)}</p>
          <p className="text-[11px] text-rose-600">Vencido {brl(books.receivableOverdue)}</p>
        </button>
        <button type="button" onClick={() => onNavigate?.('payable')} className="bg-white border border-slate-200 rounded-xl p-3 text-left">
          <p className="text-[10px] uppercase font-bold text-slate-400">A pagar</p>
          <p className="text-lg font-black text-rose-700">{brl(books.payableOpen)}</p>
          <p className="text-[11px] text-rose-600">Vencido {brl(books.payableOverdue)}</p>
        </button>
        <button type="button" onClick={() => onNavigate?.('payroll')} className="bg-white border border-slate-200 rounded-xl p-3 text-left">
          <p className="text-[10px] uppercase font-bold text-slate-400">Folha a depositar</p>
          <p className="text-lg font-black text-slate-800">{brl(payrollOpen)}</p>
          <p className="text-[11px] text-slate-500">{employees.filter((e) => e.status === 'Ativo').length} funcionários</p>
        </button>
        <button type="button" onClick={() => onNavigate?.('recurring')} className="bg-white border border-slate-200 rounded-xl p-3 text-left">
          <p className="text-[10px] uppercase font-bold text-slate-400">Recorrentes do mês</p>
          <p className="text-lg font-black text-slate-800">{brl(recurringOpen)}</p>
          <p className="text-[11px] text-slate-500">{recurringBills.filter((b) => b.active !== false).length} cadastros</p>
        </button>
      </section>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fila operacional</p>
            <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{romaneios.length + remessas.length}</span>
          </div>
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase mb-2">Romaneios a carregar</p>
            {romaneios.length === 0 && <p className="text-xs text-slate-400 pb-3">Nenhum romaneio na fila.</p>}
            {romaneios.map((o) => (
              <button key={o.id} type="button" onClick={() => onNavigate?.('orders')} className="w-full text-left py-2 border-b border-slate-50">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-700 truncate">{o.reference}</span>
                  <span className="text-slate-400">{(o.items || []).reduce((s, i) => s + Number(i.quantity || 0), 0).toFixed(1)} t</span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">{custName(o.customerId)}</p>
              </button>
            ))}
          </div>
          <div className="px-4 pt-3 pb-3 border-t border-slate-100">
            <p className="text-[10px] font-semibold text-slate-400 uppercase mb-2">Transferências aguardando fazenda</p>
            {remessas.length === 0 && <p className="text-xs text-slate-400">Nenhuma remessa em trânsito.</p>}
            {remessas.map((t) => (
              <button key={t.id} type="button" onClick={() => onNavigate?.('transfers')} className="w-full text-left py-2 border-b border-slate-50">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-700">{t.code}</span>
                  <span className="text-amber-700 bg-amber-50 px-1.5 rounded">Em trânsito</span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">{t.originLocation} → {t.destinationLocation}</p>
              </button>
            ))}
            <button type="button" onClick={() => onNavigate?.('yard')} className="mt-2 text-[11px] font-semibold text-blue-700 inline-flex items-center gap-1">Ver filas <ArrowRight size={12} /></button>
          </div>
        </section>
        <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Estoque ao vivo</p>
          {[moido, britado].filter(Boolean).map((item) => {
            const qty = Number(item!.quantity || 0);
            const min = Number(item!.minStock || 0) || 1;
            const cap = Math.max(qty, min * 3, 1);
            const pct = Math.min(100, Math.round((qty / cap) * 100));
            return (
              <div key={item!.id} className="border border-slate-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-600 uppercase">{item!.name}</p>
                <p className="text-2xl font-semibold text-slate-800">{tons(qty)}</p>
                <p className="text-[11px] text-slate-400 mb-2">mínimo {tons(min)}</p>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${qty <= min ? 'bg-amber-500' : 'bg-emerald-600'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          {inventory.length === 0 && <p className="text-xs text-slate-400">Sem estoque carregado.</p>}
          <button type="button" onClick={() => onNavigate?.('inventory')} className="text-[11px] font-semibold text-blue-700 inline-flex items-center gap-1">Ver estoque <ArrowRight size={12} /></button>
        </section>
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Alertas fiscais</p>
            <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">{pendingNfe.length + rejectedNfe.length}</span>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-[10px] font-semibold text-amber-700 uppercase">Pendentes de emissão</p>
            {pendingNfe.length === 0 && <p className="text-xs text-slate-400">Nada pendente.</p>}
            {pendingNfe.map((o) => (
              <button key={o.id} type="button" onClick={() => onNavigate?.('fiscal')} className="w-full text-left py-1.5 text-xs flex justify-between gap-2">
                <span className="truncate font-medium text-slate-700">{o.reference} · {custName(o.customerId)}</span>
                <span className="text-amber-700">{brl(o.total)}</span>
              </button>
            ))}
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-semibold text-rose-700 uppercase mb-1">Rejeitadas</p>
              {rejectedNfe.length === 0 && <p className="text-xs text-slate-400">Nenhuma rejeição.</p>}
              {rejectedNfe.map((o) => (
                <button key={o.id} type="button" onClick={() => onNavigate?.('fiscal')} className="w-full text-left py-1.5 text-xs flex justify-between">
                  <span className="font-medium text-slate-700">{o.reference}</span>
                  <span className="text-rose-600">Rejeitada</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => onNavigate?.('fiscal')} className="text-[11px] font-semibold text-blue-700 inline-flex items-center gap-1">Abrir notas <ArrowRight size={12} /></button>
          </div>
        </section>
      </div>
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl p-4 min-h-[280px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Liquidez dos últimos 7 dias</p>
              <p className="text-xs text-slate-400">Entradas recebidas x saídas efetivamente pagas.</p>
            </div>
            <button type="button" onClick={() => onNavigate?.('cashflow')} className="text-[11px] font-semibold text-blue-700">Abrir fluxo</button>
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
            <div><p className="text-[10px] text-slate-400">Faturado</p><p className="text-lg font-semibold text-emerald-400">{brl(strategic.soldValue)}</p></div>
            <div><p className="text-[10px] text-slate-400">A receber</p><p className="text-lg font-semibold text-amber-300">{brl(strategic.openReceivable)}</p></div>
            <div><p className="text-[10px] text-slate-400">Volume vendido</p><p className="text-lg font-semibold">{tons(strategic.soldTons)}</p></div>
            <div><p className="text-[10px] text-slate-400">Ticket médio</p><p className="text-lg font-semibold">{brl(strategic.averageTicket)}</p></div>
          </div>
          <button type="button" onClick={() => onNavigate?.('orders')} className="w-full text-left text-xs font-semibold text-blue-200 border-t border-white/10 pt-3">Conferir vendas e recebimentos <ArrowRight size={12} className="inline" /></button>
        </div>
      </section>
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2"><Wallet size={13} /> Caixa do dia</p>
          <button type="button" onClick={() => onNavigate?.('daily')} className="text-[11px] font-semibold text-blue-700">Ver fluxo</button>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-400 uppercase text-[10px]">
            <tr>
              <th className="text-left font-semibold px-4 py-2">Descrição</th>
              <th className="text-right font-semibold px-4 py-2">Entradas</th>
              <th className="text-right font-semibold px-4 py-2">Saídas</th>
              <th className="text-right font-semibold px-4 py-2">Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100">
              <td className="px-4 py-2.5 text-slate-600">Movimento de hoje (pagamentos reais)</td>
              <td className="px-4 py-2.5 text-right text-emerald-700 font-medium">{brl(entradas)}</td>
              <td className="px-4 py-2.5 text-right text-rose-600 font-medium">{brl(saidas)}</td>
              <td className="px-4 py-2.5 text-right font-semibold">{brl(entradas - saidas)}</td>
            </tr>
            <tr className="border-t border-slate-100 bg-slate-50/60">
              <td className="px-4 py-2.5 font-semibold text-slate-700"><Scale size={12} className="inline mr-1" /> Posição nas contas (saldo inicial + caixa)</td>
              <td /><td />
              <td className={`px-4 py-2.5 text-right font-semibold ${saldoContas >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{brl(saldoContas)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
};

export default Dashboard;
