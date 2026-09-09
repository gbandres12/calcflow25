import React, { useMemo } from 'react';
import {
  Transaction, InventoryItem, Customer, TransactionType, View, User,
  SaleOrder, FinancialAccount, OrderStatus, TransferShipment, TransferStatus
} from '../types';
import { ArrowRight, Package, Scale, Wallet } from 'lucide-react';
import { OnboardingChecklist } from './OnboardingChecklist';

interface DashboardProps {
  transactions: Transaction[];
  inventory: InventoryItem[];
  customers: Customer[];
  orders?: SaleOrder[];
  accounts?: FinancialAccount[];
  transfers?: TransferShipment[];
  user?: User | null;
  onNavigate?: (view: View) => void;
  onOpenOnboardingModal?: () => void;
}

const brl = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const tons = (n: number) => `${(Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t`;
const todayISO = () => new Date().toISOString().slice(0, 10);

const stockOf = (inventory: InventoryItem[], keys: string[]) =>
  inventory.find((i) => keys.some((k) => (i.id || '').toLowerCase().includes(k) || (i.name || '').toLowerCase().includes(k)));

const Dashboard: React.FC<DashboardProps> = ({
  transactions, inventory, customers, orders = [], accounts = [], transfers = [],
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
  const dayTx = transactions.filter((t) => (t.date || '').slice(0, 10) === today);
  const entradas = dayTx.filter((t) => t.type === TransactionType.SALE).reduce((s, t) => s + Number(t.paidAmount || t.amount || 0), 0);
  const saidas = dayTx.filter((t) => t.type !== TransactionType.SALE).reduce((s, t) => s + Number(t.paidAmount || t.amount || 0), 0);
  const saldoContas = accounts.reduce((s, a) => s + Number(a.initialBalance || 0), 0);
  const saldoDia = saldoContas + dayTx.reduce((s, t) => {
    const v = Number(t.paidAmount || t.amount || 0);
    return t.type === TransactionType.SALE ? s + v : s - v;
  }, 0);
  const custName = (id?: string) => customers.find((c) => c.id === id)?.name || 'Cliente';

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
