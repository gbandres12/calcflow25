import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  DollarSign,
  FileCheck2,
  FileText,
  FileUp,
  Filter,
  Landmark,
  Pencil,
  Plus,
  Receipt,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  Category,
  Company,
  CostCenter,
  Customer,
  FinancialAccount,
  PaymentReceipt,
  SaleOrder,
  StoreItem,
  Transaction,
  TransactionStatus,
  TransactionType,
  TransferShipment,
  User
} from '../types';
import {
  addDaysISO,
  buildCashProjection,
  findUnprojectedOrders,
  getEffectiveDueDate,
  getTransactionOpenBalance,
  isPayableTransaction,
  isReceivableTransaction
} from '../services/domain/payablesReceivables';
import { buildOrderReceipt, ReceiptInput, settleReceivable } from '../services/receiptLink';
import { NfPayableImportModal } from './NfPayableImportModal';
import { TransactionFormDialog, ReceiptLink } from './TransactionFormDialog';
import { ReceivePayDialog } from './ReceivePayDialog';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { DeletionPasswordModal } from './DeletionPasswordModal';
import { dateISOBR } from '../utils/dateFilterUtils';

export type HorizonPreset = 'TODAY' | '7D' | '15D' | '30D' | '60D' | '90D' | 'THIS_MONTH' | 'ALL';

interface AccountsPayableReceivableProps {
  transactions: Transaction[];
  accounts: FinancialAccount[];
  costCenters: CostCenter[];
  categories: Category[];
  customers: Customer[];
  orders: SaleOrder[];
  storeItems?: StoreItem[];
  transfers?: TransferShipment[];
  currentUser?: User;
  company: Company;
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'companyId'>) => Promise<void> | void;
  onUpdateTransaction: (tx: Transaction) => Promise<void> | void;
  onDeleteTransaction: (id: string) => Promise<void> | void;
  onAddCustomer?: (customer: Customer) => Promise<Customer | void> | Customer | void;
  onUpsertStoreItem?: (item: StoreItem) => Promise<void> | void;
  onAddTransfer?: (shipment: Omit<TransferShipment, 'id'>) => Promise<void> | void;
  onPostOrderFinance?: (order: SaleOrder) => Promise<void> | void;
  onReceiptForOrder?: (receipt: PaymentReceipt, updatedOrder: SaleOrder) => void;
  onVerifyDeletionPassword?: (password: string) => boolean | Promise<boolean>;
}

const formatBRL = (val?: number) =>
  (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDateBR = (dateStr?: string) => {
  if (!dateStr) return '—';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
};

const diffDaysISO = (fromIso: string, toIso: string): number => {
  const [y1, m1, d1] = fromIso.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = toIso.slice(0, 10).split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
};

export const AccountsPayableReceivable: React.FC<AccountsPayableReceivableProps> = ({
  transactions,
  accounts,
  costCenters,
  categories,
  customers,
  orders,
  storeItems = [],
  transfers = [],
  currentUser,
  company,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onAddCustomer,
  onUpsertStoreItem,
  onAddTransfer,
  onPostOrderFinance,
  onReceiptForOrder,
  onVerifyDeletionPassword
}) => {
  const todayStr = dateISOBR();

  // Horizonte de projeção
  const [horizon, setHorizon] = useState<HorizonPreset>('30D');
  const [includeOverdue, setIncludeOverdue] = useState(true);

  // Abas e Filtros da Tabela
  const [activeTab, setActiveTab] = useState<'TIMELINE' | 'PAYABLES' | 'RECEIVABLES' | 'SETTLED'>('TIMELINE');
  const [urgencyFilter, setUrgencyFilter] = useState<'ALL' | 'OVERDUE' | 'TODAY' | 'NEXT_7D' | 'WITH_NFE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCostCenter, setSelectedCostCenter] = useState('ALL');

  // Modais
  const [isNfModalOpen, setIsNfModalOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [formInitialType, setFormInitialType] = useState<TransactionType>(TransactionType.EXPENSE);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [txToSettle, setTxToSettle] = useState<Transaction | null>(null);

  const [viewingReceipt, setViewingReceipt] = useState<PaymentReceipt | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);

  const horizonEndStr = useMemo(() => {
    if (horizon === 'TODAY') return todayStr;
    if (horizon === '7D') return addDaysISO(todayStr, 7);
    if (horizon === '15D') return addDaysISO(todayStr, 15);
    if (horizon === '30D') return addDaysISO(todayStr, 30);
    if (horizon === '60D') return addDaysISO(todayStr, 60);
    if (horizon === '90D') return addDaysISO(todayStr, 90);
    if (horizon === 'THIS_MONTH') {
      const [y, m] = todayStr.split('-').map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
    return ''; // ALL
  }, [horizon, todayStr]);

  // Cálculo da Projeção
  const projection = useMemo(
    () => buildCashProjection(accounts, transactions, todayStr, horizonEndStr, includeOverdue),
    [accounts, transactions, todayStr, horizonEndStr, includeOverdue]
  );

  // Pedidos confirmados ainda sem lançamento financeiro no Contas a Receber
  const unprojectedOrders = useMemo(
    () => findUnprojectedOrders(orders, transactions),
    [orders, transactions]
  );

  const unprojectedTotal = useMemo(
    () => unprojectedOrders.reduce((s, o) => s + Number(o.total || 0), 0),
    [unprojectedOrders]
  );

  // Contadores rápidos para as abas
  const counts = useMemo(() => {
    let openPayables = 0;
    let openReceivables = 0;
    let overdueCount = 0;
    let dueTodayCount = 0;

    transactions.forEach((tx) => {
      const open = getTransactionOpenBalance(tx);
      if (open <= 0.009) return;
      const due = getEffectiveDueDate(tx) || todayStr;
      if (isPayableTransaction(tx)) openPayables++;
      if (isReceivableTransaction(tx)) openReceivables++;
      if (due < todayStr) overdueCount++;
      if (due === todayStr) dueTodayCount++;
    });

    return { openPayables, openReceivables, overdueCount, dueTodayCount };
  }, [transactions, todayStr]);

  // Lista filtrada e ordenada por vencimento
  const filteredTransactions = useMemo(() => {
    const next7Str = addDaysISO(todayStr, 7);

    return transactions
      .filter((tx) => {
        const open = getTransactionOpenBalance(tx);
        const isSettled = open <= 0.009;
        const due = getEffectiveDueDate(tx) || todayStr;

        if (activeTab === 'SETTLED') {
          if (!isSettled) return false;
        } else {
          if (isSettled) return false;
          if (activeTab === 'PAYABLES' && !isPayableTransaction(tx)) return false;
          if (activeTab === 'RECEIVABLES' && !isReceivableTransaction(tx)) return false;

          // Respeita o horizonte selecionado (ou inclui atrasados se marcado)
          if (horizonEndStr) {
            if (due > horizonEndStr) return false;
            if (!includeOverdue && due < todayStr) return false;
          }
        }

        if (urgencyFilter === 'OVERDUE' && (isSettled || due >= todayStr)) return false;
        if (urgencyFilter === 'TODAY' && (isSettled || due !== todayStr)) return false;
        if (urgencyFilter === 'NEXT_7D' && (isSettled || due < todayStr || due > next7Str)) return false;
        if (urgencyFilter === 'WITH_NFE' && !tx.nfeChave && !tx.nfeNumero && !tx.orderId) return false;

        if (selectedCostCenter !== 'ALL' && tx.costCenterId !== selectedCostCenter) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const custName =
            customers.find((c) => c.id === tx.customerId || c.id === tx.contactId)?.name ||
            tx.contactName ||
            '';
          const matches =
            tx.description?.toLowerCase().includes(q) ||
            tx.category?.toLowerCase().includes(q) ||
            custName.toLowerCase().includes(q) ||
            tx.nfeNumero?.toLowerCase().includes(q) ||
            tx.nfeChave?.toLowerCase().includes(q) ||
            tx.documentNumber?.toLowerCase().includes(q) ||
            tx.notes?.toLowerCase().includes(q);
          if (!matches) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const dueA = getEffectiveDueDate(a);
        const dueB = getEffectiveDueDate(b);
        if (activeTab === 'SETTLED') return dueB.localeCompare(dueA);
        return dueA.localeCompare(dueB);
      });
  }, [
    transactions,
    activeTab,
    urgencyFilter,
    selectedCostCenter,
    searchQuery,
    horizonEndStr,
    includeOverdue,
    todayStr,
    customers
  ]);

  const resolvePartyName = (tx: Transaction): string => {
    if (tx.contactName) return tx.contactName;
    const found = customers.find((c) => c.id === tx.customerId || c.id === tx.contactId);
    if (found) return found.name;
    if (tx.orderId) {
      const ord = orders.find((o) => o.id === tx.orderId);
      if (ord?.customerName) return ord.customerName;
    }
    return isReceivableTransaction(tx) ? 'Cliente' : 'Fornecedor / Despesa';
  };

  const handleSaveForm = async (txData: Transaction | Omit<Transaction, 'id' | 'companyId'>) => {
    if ('id' in txData && txData.id) {
      await onUpdateTransaction(txData as Transaction);
    } else {
      await onAddTransaction(txData);
    }
  };

  const handleLinkedReceipt = async (link: ReceiptLink, input: ReceiptInput) => {
    if (link.kind === 'order') {
      const order = orders.find((o) => o.id === link.id);
      if (!order || !onReceiptForOrder) throw new Error('Venda não encontrada.');
      const receipt = buildOrderReceipt(order, customers.find((c) => c.id === order.customerId), input);
      onReceiptForOrder(receipt, { ...order, receipts: [...(order.receipts || []), receipt] });
      setViewingReceipt(receipt);
      return;
    }
    const tx = transactions.find((t) => t.id === link.id);
    if (!tx) throw new Error('Conta a receber não encontrada.');
    await onUpdateTransaction(settleReceivable(tx, input));
  };

  const handleOpenReceipt = (tx: Transaction) => {
    const cust = customers.find((c) => c.id === tx.customerId || c.id === tx.contactId);
    const receipt: PaymentReceipt = {
      id: tx.receiptId || `REC-${tx.id.replace(/\D/g, '').slice(-6) || Date.now()}`,
      orderId: tx.orderId,
      customerId: tx.customerId || tx.contactId || 'general',
      customerName: resolvePartyName(tx),
      customerDocument: cust?.document || tx.supplierCnpj,
      amount: tx.paidAmount || tx.amount,
      date: tx.paymentDate || tx.date,
      paymentMethod: tx.paymentMethod || 'PIX',
      accountId: tx.accountId,
      accountName: accounts.find((a) => a.id === tx.accountId)?.name,
      description: tx.description,
      type: 'PARCELA',
      notes: tx.notes
    };
    setViewingReceipt(receipt);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho Principal */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E5EEE5] text-[#0F5948] text-[11px] font-extrabold uppercase tracking-wider mb-2">
            <CalendarClock size={14} /> Gestão de Vencimentos & Previsibilidade
          </div>
          <h2 className="text-2xl font-black text-[#163C35] tracking-tight">
            Contas a Pagar, a Receber & Projeção de Caixa
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Dê entrada em Notas Fiscais (XML ou PDF) para gerar duplicatas a pagar e acompanhe o saldo projetado com as vendas a receber.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsNfModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#0F5948] hover:bg-[#163C35] text-white text-xs font-extrabold shadow-md transition-all"
          >
            <FileUp size={16} />
            Importar NF (XML / PDF) → Contas a Pagar
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingTx(null);
              setFormInitialType(TransactionType.EXPENSE);
              setIsFormModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-extrabold transition-all"
          >
            <Plus size={15} /> Nova Conta a Pagar
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingTx(null);
              setFormInitialType(TransactionType.SALE);
              setIsFormModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-extrabold transition-all"
          >
            <Plus size={15} /> Nova Conta a Receber
          </button>
        </div>
      </header>

      {/* Seletor de Horizonte de Tempo */}
      <div className="bg-white px-5 py-3.5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-extrabold text-slate-500 mr-2 flex items-center gap-1.5">
            <Calendar size={15} className="text-[#0F5948]" /> Horizonte de Projeção:
          </span>
          {(
            [
              { id: 'TODAY', label: 'Hoje' },
              { id: '7D', label: 'Próx. 7 dias' },
              { id: '15D', label: 'Próx. 15 dias' },
              { id: '30D', label: 'Próx. 30 dias' },
              { id: '60D', label: 'Próx. 60 dias' },
              { id: '90D', label: 'Próx. 90 dias' },
              { id: 'THIS_MONTH', label: 'Este Mês' },
              { id: 'ALL', label: 'Todo o Horizonte' }
            ] as { id: HorizonPreset; label: string }[]
          ).map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setHorizon(h.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                horizon === h.id
                  ? 'bg-[#0F5948] text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={includeOverdue}
            onChange={(e) => setIncludeOverdue(e.target.checked)}
            className="rounded border-slate-300 text-[#0F5948]"
          />
          Somar títulos em atraso no cálculo projetado
        </label>
      </div>

      {/* 4 Cards da Equação de Projeção Financeira */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Saldo Atual em Caixa */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              1. Saldo Atual Disponível
            </span>
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Wallet size={18} />
            </div>
          </div>
          <div className="my-3">
            <p className="text-2xl font-black text-slate-900">
              {formatBRL(projection.availableBalance)}
            </p>
          </div>
          <p className="text-[11px] text-slate-500 font-medium">
            Soma líquida real das {accounts.length} conta(s) bancárias e caixas hoje
          </p>
        </div>

        {/* Card 2: (+) Certamente a Receber */}
        <div className="bg-white p-5 rounded-3xl border border-emerald-200/80 border-l-4 border-l-emerald-500 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800">
              2. (+) Certamente a Receber
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="my-3">
            <p className="text-2xl font-black text-emerald-700">
              + {formatBRL(projection.totalReceivablesInHorizon)}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold">
            <span className="text-slate-600">
              Hoje: <strong className="text-emerald-700">{formatBRL(projection.dueTodayReceivables)}</strong>
            </span>
            {projection.overdueReceivables > 0 && (
              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                Atrasado: {formatBRL(projection.overdueReceivables)}
              </span>
            )}
          </div>
        </div>

        {/* Card 3: (-) Certamente a Pagar */}
        <div className="bg-white p-5 rounded-3xl border border-rose-200/80 border-l-4 border-l-rose-500 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-rose-800">
              3. (−) Certamente a Pagar
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <TrendingDown size={18} />
            </div>
          </div>
          <div className="my-3">
            <p className="text-2xl font-black text-rose-700">
              − {formatBRL(projection.totalPayablesInHorizon)}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold">
            <span className="text-slate-600">
              Hoje: <strong className="text-rose-700">{formatBRL(projection.dueTodayPayables)}</strong>
            </span>
            {projection.overduePayables > 0 && (
              <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                Vencido: {formatBRL(projection.overduePayables)}
              </span>
            )}
          </div>
        </div>

        {/* Card 4: (=) Saldo Projetado */}
        <div
          className={`p-5 rounded-3xl border shadow-md flex flex-col justify-between ${
            projection.projectedFinalBalance >= 0
              ? 'bg-[#163C35] text-white border-[#0F5948]'
              : 'bg-rose-950 text-white border-rose-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-200">
              4. (=) Saldo Projetado no Período
            </span>
            <div className="w-9 h-9 rounded-xl bg-white/10 text-emerald-300 flex items-center justify-center">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="my-3">
            <p
              className={`text-2xl font-black ${
                projection.projectedFinalBalance >= 0 ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {formatBRL(projection.projectedFinalBalance)}
            </p>
          </div>
          {projection.lowestProjectedBalance < 0 && projection.lowestBalanceDate ? (
            <p className="text-[11px] text-amber-300 font-bold flex items-center gap-1">
              <AlertTriangle size={13} className="shrink-0" />
              Atenção: Caixa fica negativo em {formatDateBR(projection.lowestBalanceDate)} ({formatBRL(projection.lowestProjectedBalance)})
            </p>
          ) : (
            <p className="text-[11px] text-emerald-100/80 font-medium">
              Liquidez positiva mantida durante todo o período projetado
            </p>
          )}
        </div>
      </div>

      {/* Radar de Vendas Faturadas / NF-es sem Projeção Financeira */}
      {unprojectedOrders.length > 0 && onPostOrderFinance && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Sparkles size={20} />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-900">
                {unprojectedOrders.length} Venda(s) Confirmada(s) ainda fora da Projeção de Contas a Receber ({formatBRL(unprojectedTotal)})
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                Estes pedidos foram finalizados com a opção &ldquo;sem financeiro&rdquo; marcada. Clique para projetar suas parcelas no Contas a Receber:
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {unprojectedOrders.slice(0, 4).map((ord) => (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => onPostOrderFinance(ord)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white hover:bg-emerald-50 text-slate-800 border border-amber-300 text-xs font-bold shadow-sm transition-all"
                  >
                    <Plus size={13} className="text-emerald-600" />
                    Projetar #{ord.reference} · {ord.customerName || 'Cliente'} ({formatBRL(ord.total)})
                  </button>
                ))}
              </div>
            </div>
          </div>
          {unprojectedOrders.length > 1 && (
            <button
              type="button"
              onClick={() => {
                unprojectedOrders.forEach((ord) => onPostOrderFinance(ord));
              }}
              className="px-4 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-extrabold shrink-0 self-start sm:self-center"
            >
              Projetar Todas ({unprojectedOrders.length})
            </button>
          )}
        </div>
      )}

      {/* Gráfico de Evolução do Saldo Projetado + Entradas vs Saídas */}
      {projection.timeline.length > 0 && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                Curva de Projeção de Caixa & Vencimentos Diários
              </h3>
              <p className="text-xs text-slate-500">
                Barras verdes (A Receber) vs. Barras vermelhas (A Pagar) e Linha do Saldo Projetado Acumulado
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-emerald-700">
                <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> A Receber
              </span>
              <span className="flex items-center gap-1.5 text-rose-700">
                <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" /> A Pagar
              </span>
              <span className="flex items-center gap-1.5 text-[#0F5948]">
                <span className="w-3 h-1 bg-[#0F5948] inline-block" /> Saldo Projetado
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={projection.timeline} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 700 }} />
                <YAxis
                  tickFormatter={(v) =>
                    `R$ ${Number(v).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}`
                  }
                  tick={{ fontSize: 11, fill: '#64748B', fontWeight: 700 }}
                />
                <Tooltip
                  formatter={(value: any, name: string) => [
                    formatBRL(Number(value)),
                    name === 'receivables'
                      ? 'Certamente a Receber'
                      : name === 'payables'
                      ? 'Certamente a Pagar'
                      : 'Saldo Projetado'
                  ]}
                  labelFormatter={(label) => `Vencimento: ${label}`}
                  contentStyle={{ borderRadius: '14px', borderColor: '#CBD5E1', fontSize: '12px', fontWeight: 700 }}
                />
                <Legend
                  formatter={(val) =>
                    val === 'receivables'
                      ? 'A Receber'
                      : val === 'payables'
                      ? 'A Pagar'
                      : 'Saldo Projetado'
                  }
                />
                <Bar dataKey="receivables" fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Bar dataKey="payables" fill="#F43F5E" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Line
                  type="monotone"
                  dataKey="projectedBalance"
                  stroke="#0F5948"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#0F5948' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Abas + Filtros + Tabela de Títulos */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Abas Principais */}
        <div className="px-6 pt-4 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 pb-3">
            <button
              type="button"
              onClick={() => setActiveTab('TIMELINE')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 ${
                activeTab === 'TIMELINE'
                  ? 'bg-[#0F5948] text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <CalendarClock size={15} />
              Cronograma Unificado ({counts.openPayables + counts.openReceivables})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('PAYABLES')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 ${
                activeTab === 'PAYABLES'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
              }`}
            >
              <ArrowDownLeft size={15} />
              Contas a Pagar ({counts.openPayables})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('RECEIVABLES')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 ${
                activeTab === 'RECEIVABLES'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              <ArrowUpRight size={15} />
              Contas a Receber ({counts.openReceivables})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('SETTLED')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 ${
                activeTab === 'SETTLED'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <CheckCircle2 size={15} />
              Liquidados / Histórico
            </button>
          </div>

          {/* Filtros de Urgência */}
          {activeTab !== 'SETTLED' && (
            <div className="flex flex-wrap items-center gap-1.5 pb-3">
              {(
                [
                  { id: 'ALL', label: 'Todos' },
                  { id: 'OVERDUE', label: `🔴 Vencidos (${counts.overdueCount})` },
                  { id: 'TODAY', label: `🟠 Vence Hoje (${counts.dueTodayCount})` },
                  { id: 'NEXT_7D', label: '🔵 Próx. 7 dias' },
                  { id: 'WITH_NFE', label: '📄 Com NF-e / Pedido' }
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setUrgencyFilter(f.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                    urgencyFilter === f.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Barra de Busca e Filtro por Centro de Custo */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por fornecedor, cliente, Nº da NF-e, duplicata, descrição ou categoria..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:border-[#0F5948]"
            />
          </div>

          <select
            value={selectedCostCenter}
            onChange={(e) => setSelectedCostCenter(e.target.value)}
            className="w-full sm:w-56 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
          >
            <option value="ALL">Todos os Centros de Custo</option>
            {costCenters.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Tabela de Títulos */}
        {filteredTransactions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <FileText size={24} />
            </div>
            <p className="text-sm font-extrabold text-slate-700">
              Nenhum título encontrado para os filtros selecionados
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Você pode importar uma Nota Fiscal (XML ou PDF) para lançar duplicatas no Contas a Pagar ou cadastrar um novo título manualmente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 text-left font-extrabold">Vencimento</th>
                  <th className="py-3 px-4 text-left font-extrabold">Natureza</th>
                  <th className="py-3 px-4 text-left font-extrabold">Fornecedor / Cliente & Título</th>
                  <th className="py-3 px-4 text-left font-extrabold">NF / Documento</th>
                  <th className="py-3 px-4 text-left font-extrabold">Categoria / C. Custo</th>
                  <th className="py-3 px-4 text-right font-extrabold">Valor Total</th>
                  <th className="py-3 px-4 text-right font-extrabold">Saldo Aberto</th>
                  <th className="py-3 px-4 text-right font-extrabold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map((tx) => {
                  const due = getEffectiveDueDate(tx) || todayStr;
                  const open = getTransactionOpenBalance(tx);
                  const isSettled = open <= 0.009;
                  const isPayable = isPayableTransaction(tx);
                  const daysDiff = diffDaysISO(todayStr, due);
                  const isOverdue = !isSettled && daysDiff < 0;
                  const isDueToday = !isSettled && daysDiff === 0;
                  const partyName = resolvePartyName(tx);
                  const ccName =
                    costCenters.find((c) => c.id === tx.costCenterId)?.name || tx.costCenter || '—';

                  return (
                    <tr
                      key={tx.id}
                      className={`hover:bg-slate-50/90 transition-colors ${
                        isOverdue ? 'bg-rose-50/30' : isDueToday ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      {/* Vencimento + Badge de Prazo */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-black text-slate-800">{formatDateBR(due)}</div>
                        {isSettled ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md mt-0.5">
                            <CheckCircle2 size={11} /> Liquidado
                          </span>
                        ) : isOverdue ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md mt-0.5">
                            <AlertCircle size={11} /> Atrasado há {Math.abs(daysDiff)}d
                          </span>
                        ) : isDueToday ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md mt-0.5">
                            <Clock size={11} /> Vence Hoje!
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md mt-0.5">
                            Em {daysDiff} dia(s)
                          </span>
                        )}
                      </td>

                      {/* Natureza (A Pagar vs A Receber) */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isPayable ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-extrabold text-[11px]">
                            <ArrowDownLeft size={13} /> A PAGAR
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-extrabold text-[11px]">
                            <ArrowUpRight size={13} /> A RECEBER
                          </span>
                        )}
                      </td>

                      {/* Fornecedor / Cliente & Descrição */}
                      <td className="py-3.5 px-4">
                        <p className="font-extrabold text-slate-900">{partyName}</p>
                        <p className="text-xs text-slate-600 truncate max-w-xs" title={tx.description}>
                          {tx.description}
                        </p>
                      </td>

                      {/* NF / Parcela / Forma de Pagamento */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {tx.nfeNumero || tx.documentNumber ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md border border-slate-200">
                              <FileCheck2 size={12} className="text-[#0F5948]" />
                              {tx.documentNumber || `NF ${tx.nfeNumero}`}
                            </span>
                            {tx.installmentTotal && tx.installmentTotal > 1 && (
                              <div className="text-[10px] font-bold text-slate-500">
                                Parcela {tx.installmentNumber}/{tx.installmentTotal}
                              </div>
                            )}
                          </div>
                        ) : tx.orderId ? (
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-200">
                            Pedido Vinculado
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Avulso</span>
                        )}
                        {tx.paymentMethod && (
                          <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                            {tx.paymentMethod}
                          </div>
                        )}
                      </td>

                      {/* Categoria & Centro de Custo */}
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-slate-700">{tx.category}</p>
                        <p className="text-[11px] text-slate-500">{ccName}</p>
                      </td>

                      {/* Valor Total */}
                      <td className="py-3.5 px-4 text-right font-bold text-slate-700 whitespace-nowrap">
                        {formatBRL(tx.amount)}
                        {tx.paidAmount > 0 && !isSettled && (
                          <div className="text-[10px] text-emerald-600 font-semibold">
                            Já baixado: {formatBRL(tx.paidAmount)}
                          </div>
                        )}
                      </td>

                      {/* Saldo em Aberto */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span
                          className={`text-sm font-black ${
                            isSettled
                              ? 'text-slate-400 line-through'
                              : isPayable
                              ? 'text-rose-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {formatBRL(isSettled ? tx.amount : open)}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {!isSettled && (
                            <button
                              type="button"
                              onClick={() => {
                                setTxToSettle(tx);
                                setIsSettleOpen(true);
                              }}
                              className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold text-white shadow-sm transition-all ${
                                isPayable
                                  ? 'bg-rose-600 hover:bg-rose-700'
                                  : 'bg-emerald-600 hover:bg-emerald-700'
                              }`}
                            >
                              {isPayable ? 'Dar Baixa / Pagar' : 'Receber'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setEditingTx(tx);
                              setFormInitialType(tx.type);
                              setIsFormModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                            title="Editar título"
                          >
                            <Pencil size={14} />
                          </button>

                          {(isSettled || tx.paidAmount > 0) && (
                            <button
                              type="button"
                              onClick={() => handleOpenReceipt(tx)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-[#0F5948] hover:bg-slate-100"
                              title="Ver comprovante / recibo"
                            >
                              <Receipt size={14} />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setTxToDelete(tx);
                              setIsDeleteOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Excluir título"
                          >
                            <Trash2 size={14} />
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

      {/* Modal de Importação de NF-e (XML / PDF) -> Contas a Pagar */}
      <NfPayableImportModal
        isOpen={isNfModalOpen}
        onClose={() => setIsNfModalOpen(false)}
        transactions={transactions}
        accounts={accounts}
        costCenters={costCenters}
        categories={categories}
        customers={customers}
        storeItems={storeItems}
        transfers={transfers}
        currentUser={currentUser}
        company={company}
        onAddTransaction={onAddTransaction}
        onAddCustomer={onAddCustomer}
        onUpsertStoreItem={onUpsertStoreItem}
        onAddTransfer={onAddTransfer}
      />

      {/* Modal de Criação / Edição Manual */}
      <TransactionFormDialog
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingTx(null);
        }}
        initialType={formInitialType}
        editingTransaction={editingTx}
        accounts={accounts}
        costCenters={costCenters}
        categories={categories}
        customers={customers}
        historyTransactions={transactions}
        companyName={company.name}
        orders={orders}
        onLinkedReceipt={handleLinkedReceipt}
        onSave={handleSaveForm}
      />

      {/* Modal de Baixa / Liquidação Parcial ou Total */}
      <ReceivePayDialog
        isOpen={isSettleOpen}
        onClose={() => {
          setIsSettleOpen(false);
          setTxToSettle(null);
        }}
        transaction={txToSettle}
        accounts={accounts}
        onConfirm={async (updatedTx) => {
          await onUpdateTransaction(updatedTx);
        }}
      />

      {/* Modal de Recibo */}
      {viewingReceipt && (
        <PaymentReceiptModal
          receipt={viewingReceipt}
          company={company}
          onClose={() => setViewingReceipt(null)}
        />
      )}

      {/* Modal de Exclusão Segura */}
      <DeletionPasswordModal
        isOpen={isDeleteOpen}
        title="Excluir Título Financeiro"
        description="Esta ação removerá o título de Contas a Pagar/Receber e recalculará a projeção financeira. Digite sua senha para autorizar:"
        itemDescription={txToDelete ? `${txToDelete.description} (${formatBRL(txToDelete.amount)})` : undefined}
        onClose={() => {
          setIsDeleteOpen(false);
          setTxToDelete(null);
        }}
        onConfirm={async () => {
          if (txToDelete) {
            await onDeleteTransaction(txToDelete.id);
            setTxToDelete(null);
            setIsDeleteOpen(false);
          }
        }}
        onVerifyPassword={onVerifyDeletionPassword}
      />
    </div>
  );
};

export default AccountsPayableReceivable;
