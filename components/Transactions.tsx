import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Search, ArrowUpRight, ArrowDownLeft, DollarSign, Calendar, 
  CreditCard, Tag, Landmark, User, Sparkles, Filter, CheckCircle2, 
  Clock, AlertCircle, Trash2, Pencil, RotateCcw, CalendarRange, 
  Receipt, FileText, Zap, ShieldCheck
} from 'lucide-react';
import { 
  Transaction, 
  TransactionType, 
  TransactionStatus, 
  FinancialAccount, 
  CostCenter, 
  Category, 
  Customer, 
  Company, 
  PaymentReceipt,
  TransactionPayment 
} from '../types';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { TransactionFormDialog } from './TransactionFormDialog';
import { QuickEntryDialog } from './QuickEntryDialog';
import { ReceivePayDialog } from './ReceivePayDialog';
import { DailyFinancialReport } from './DailyFinancialReport';
import { DeletionPasswordModal } from './DeletionPasswordModal';

interface TransactionsProps {
  transactions: Transaction[];
  accounts: FinancialAccount[];
  costCenters: CostCenter[];
  categories: Category[];
  customers: Customer[];
  company: Company;
  onAddTransaction: (transaction: Omit<Transaction, 'id' | 'companyId'>) => Promise<void> | void;
  onUpdateTransaction: (transaction: Transaction) => Promise<void> | void;
  onDeleteTransaction: (id: string) => Promise<void> | void;
}

export const Transactions: React.FC<TransactionsProps> = ({
  transactions,
  accounts,
  costCenters,
  categories,
  customers,
  company,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction
}) => {
  // Modais de Controle
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [formModalType, setFormModalType] = useState<TransactionType>(TransactionType.SALE);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const [isQuickEntryOpen, setIsQuickEntryOpen] = useState(false);
  const [isReceivePayOpen, setIsReceivePayOpen] = useState(false);
  const [selectedTxForSettlement, setSelectedTxForSettlement] = useState<Transaction | null>(null);

  const [isDailyReportOpen, setIsDailyReportOpen] = useState(false);

  const [viewingReceipt, setViewingReceipt] = useState<PaymentReceipt | null>(null);

  // Modal de Exclusão Segura
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);

  // Filtros Avançados
  const [activeTab, setActiveTab] = useState<'ALL' | 'INFLOW' | 'OUTFLOW' | 'PENDING'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAccount, setFilterAccount] = useState('ALL');
  const [filterCostCenter, setFilterCostCenter] = useState('ALL');
  const [filterCustomer, setFilterCustomer] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Filtro por Data
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeDatePreset, setActiveDatePreset] = useState<'ALL' | 'TODAY' | '7DAYS' | 'THIS_MONTH' | 'CUSTOM'>('ALL');

  const formatBRL = (val?: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatDateBR = (dateStr?: string) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  // Presets de Data
  const applyDatePreset = (preset: 'ALL' | 'TODAY' | '7DAYS' | 'THIS_MONTH') => {
    setActiveDatePreset(preset);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'TODAY') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7DAYS') {
      const past7 = new Date();
      past7.setDate(today.getDate() - 7);
      setStartDate(past7.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (preset === 'THIS_MONTH') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(lastDay.toISOString().split('T')[0]);
    }
  };

  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    setActiveDatePreset('CUSTOM');
    if (type === 'start') setStartDate(value);
    if (type === 'end') setEndDate(value);
  };

  const handleResetFilters = () => {
    setActiveTab('ALL');
    setSearchQuery('');
    setFilterAccount('ALL');
    setFilterCostCenter('ALL');
    setFilterCustomer('ALL');
    setFilterStatus('ALL');
    applyDatePreset('ALL');
  };

  const hasActiveFilters = 
    activeTab !== 'ALL' || 
    searchQuery !== '' || 
    filterAccount !== 'ALL' || 
    filterCostCenter !== 'ALL' || 
    filterCustomer !== 'ALL' || 
    filterStatus !== 'ALL' || 
    startDate !== '' || 
    endDate !== '';

  // Cálculos Globais de Métricas
  const totalInflows = useMemo(() => {
    return transactions
      .filter(t => t.type === TransactionType.SALE && (t.status === TransactionStatus.CONFIRMADO || t.status === TransactionStatus.PAGO || t.status === TransactionStatus.PARCIAL))
      .reduce((acc, t) => acc + (t.paidAmount || (t.status === TransactionStatus.PAGO ? t.amount : 0)), 0);
  }, [transactions]);

  const totalOutflows = useMemo(() => {
    return transactions
      .filter(t => t.type === TransactionType.EXPENSE && (t.status === TransactionStatus.CONFIRMADO || t.status === TransactionStatus.PAGO || t.status === TransactionStatus.PARCIAL))
      .reduce((acc, t) => acc + (t.paidAmount || (t.status === TransactionStatus.PAGO ? t.amount : 0)), 0);
  }, [transactions]);

  const netBalance = totalInflows - totalOutflows;

  const totalPendingInflows = useMemo(() => {
    return transactions
      .filter(t => t.type === TransactionType.SALE && (t.status === TransactionStatus.PENDENTE || t.status === TransactionStatus.PARCIAL || t.status === TransactionStatus.ATRASADO))
      .reduce((acc, t) => acc + Math.max(0, Number(t.amount || 0) - Number(t.paidAmount || 0)), 0);
  }, [transactions]);

  // Filtragem de Transações
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (activeTab === 'INFLOW' && t.type !== TransactionType.SALE) return false;
      if (activeTab === 'OUTFLOW' && t.type !== TransactionType.EXPENSE) return false;
      if (activeTab === 'PENDING' && t.status !== TransactionStatus.PENDENTE && t.status !== TransactionStatus.PARCIAL && t.status !== TransactionStatus.ATRASADO) return false;

      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;

      if (filterCustomer !== 'ALL' && t.customerId !== filterCustomer && t.contactId !== filterCustomer) return false;
      if (filterAccount !== 'ALL' && t.accountId !== filterAccount) return false;
      if (filterCostCenter !== 'ALL' && t.costCenterId !== filterCostCenter) return false;
      if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDesc = t.description?.toLowerCase().includes(q);
        const matchCat = t.category?.toLowerCase().includes(q);
        const matchCust = customers.find(c => c.id === t.customerId || c.id === t.contactId)?.name.toLowerCase().includes(q);
        const matchContact = t.contactName?.toLowerCase().includes(q);
        const matchAccount = accounts.find(a => a.id === t.accountId)?.name.toLowerCase().includes(q);
        const matchCostCenter = costCenters.find(cc => cc.id === t.costCenterId)?.name.toLowerCase().includes(q) || t.costCenter?.toLowerCase().includes(q);
        const matchMethod = t.paymentMethod?.toLowerCase().includes(q);
        const matchReceipt = t.receiptId?.toLowerCase().includes(q);
        return matchDesc || matchCat || matchCust || matchContact || matchAccount || matchCostCenter || matchMethod || matchReceipt;
      }

      return true;
    });
  }, [transactions, activeTab, startDate, endDate, filterCustomer, filterAccount, filterCostCenter, filterStatus, searchQuery, customers, accounts, costCenters]);

  // Salvar formulário completo
  const handleSaveForm = async (txData: Transaction | Omit<Transaction, 'id' | 'companyId'>) => {
    if ('id' in txData && txData.id) {
      await onUpdateTransaction(txData as Transaction);
    } else {
      await onAddTransaction(txData);
    }
  };

  // Abrir Modal de Liquidação / Abatimento
  const handleOpenReceivePay = (t: Transaction) => {
    setSelectedTxForSettlement(t);
    setIsReceivePayOpen(true);
  };

  const handleConfirmSettlement = async (updatedTransaction: Transaction) => {
    await onUpdateTransaction(updatedTransaction);
  };

  // Abrir Recibo de Transação
  const handleOpenReceiptForTx = (tx: Transaction) => {
    const cust = customers.find(c => c.id === tx.customerId || c.id === tx.contactId);
    const receipt: PaymentReceipt = {
      id: tx.receiptId || `REC-${tx.id.replace(/\D/g, '').slice(-6) || Date.now()}`,
      orderId: tx.orderId,
      customerId: tx.customerId || tx.contactId || 'general',
      customerName: tx.contactName || cust?.name || 'Cliente Geral',
      customerDocument: cust?.document,
      amount: tx.paidAmount || tx.amount,
      date: tx.paymentDate || tx.date,
      paymentMethod: tx.paymentMethod || 'PIX',
      accountId: tx.accountId,
      accountName: accounts.find(a => a.id === tx.accountId)?.name,
      receivedBy: 'Caixa / Financeiro',
      description: tx.description,
      type: 'ENTRADA',
      notes: tx.notes
    };
    setViewingReceipt(receipt);
  };

  // Solicitar exclusão com senha
  const handleRequestDelete = (tx: Transaction) => {
    setTxToDelete(tx);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (txToDelete) {
      await onDeleteTransaction(txToDelete.id);
      setIsDeleteModalOpen(false);
      setTxToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Principal */}
      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Módulo Financeiro & Lançamentos</h2>
            <span className="bg-purple-100 text-purple-800 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full">
              Gestão Integral
            </span>
          </div>
          <p className="text-slate-500 text-xs font-medium">
            Entradas, saídas, descontos, abatimentos, conciliação diária e liquidação em tempo real
          </p>
        </div>
        
        {/* Barra de Ações Rápidas */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Lançamento Rápido Express */}
          <button 
            onClick={() => setIsQuickEntryOpen(true)} 
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-4 py-2.5 rounded-2xl font-black transition-all flex items-center gap-2 shadow-lg shadow-amber-200 text-xs active:scale-95"
            title="Lançamento instantâneo em 1 clique (Aceita R$ 0 para abatimento futuro)"
          >
            <Zap size={15} className="fill-slate-950" /> ⚡ Lançamento Rápido
          </button>

          {/* Relatório Diário de Caixa */}
          <button 
            onClick={() => setIsDailyReportOpen(true)} 
            className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-2xl font-black transition-all flex items-center gap-2 shadow-lg text-xs active:scale-95"
            title="Relatório diário baseado em liquidações reais"
          >
            <FileText size={15} className="text-amber-400" /> Relatório Diário
          </button>

          {/* Nova Entrada */}
          <button 
            onClick={() => {
              setFormModalType(TransactionType.SALE);
              setEditingTransaction(null);
              setIsFormModalOpen(true);
            }} 
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-2xl font-black transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-200 text-xs active:scale-95"
          >
            <ArrowUpRight size={15} /> 📥 Nova Entrada
          </button>

          {/* Nova Saída */}
          <button 
            onClick={() => {
              setFormModalType(TransactionType.EXPENSE);
              setEditingTransaction(null);
              setIsFormModalOpen(true);
            }} 
            className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-2xl font-black transition-all flex items-center gap-1.5 shadow-lg shadow-rose-200 text-xs active:scale-95"
          >
            <ArrowDownLeft size={15} /> 📤 Nova Saída
          </button>
        </div>
      </header>

      {/* Cards de Métricas Financeiras Globais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black shrink-0">
            <ArrowUpRight size={22} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">📥 Total de Entradas</p>
            <p className="text-xl font-black text-emerald-600">{formatBRL(totalInflows)}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-black shrink-0">
            <ArrowDownLeft size={22} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">📤 Total de Saídas</p>
            <p className="text-xl font-black text-rose-600">{formatBRL(totalOutflows)}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shrink-0 ${netBalance >= 0 ? 'bg-purple-50 text-purple-600' : 'bg-rose-50 text-rose-600'}`}>
            <DollarSign size={22} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">💰 Saldo Líquido</p>
            <p className={`text-xl font-black ${netBalance >= 0 ? 'text-purple-700' : 'text-rose-600'}`}>
              {formatBRL(netBalance)}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black shrink-0">
            <Clock size={22} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">🟡 A Receber / Pendente</p>
            <p className="text-xl font-black text-amber-600">{formatBRL(totalPendingInflows)}</p>
          </div>
        </div>
      </div>

      {/* Painel Avançado de Filtragem e Conciliação Diária */}
      <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
        
        {/* Linha Superior: Abas de Tipo, Busca e Reset */}
        <div className="flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between">
          
          {/* Abas Tipo */}
          <div className="flex p-1 bg-slate-100 rounded-2xl w-full xl:w-auto overflow-x-auto">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap ${activeTab === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Todas ({transactions.length})
            </button>
            <button
              onClick={() => setActiveTab('INFLOW')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'INFLOW' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-emerald-700'}`}
            >
              <ArrowUpRight size={14} /> 📥 Entradas
            </button>
            <button
              onClick={() => setActiveTab('OUTFLOW')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'OUTFLOW' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-500 hover:text-rose-700'}`}
            >
              <ArrowDownLeft size={14} /> 📤 Saídas
            </button>
            <button
              onClick={() => setActiveTab('PENDING')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'PENDING' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-500 hover:text-amber-700'}`}
            >
              🟡 Pendentes / Parciais
            </button>
          </div>

          {/* Campo de Busca */}
          <div className="relative flex-1 w-full xl:w-auto max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por descrição, cliente/fornecedor, centro de custo, categoria..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs focus:border-purple-500"
            />
          </div>

          {/* Botão de Limpar Filtros */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-xs transition-all flex items-center gap-1.5 shrink-0"
              title="Limpar todos os filtros"
            >
              <RotateCcw size={14} /> Limpar Filtros
            </button>
          )}

        </div>

        {/* Linha Inferior: Filtros de Data (Conciliação Diária), Cliente, Conta e Centro de Custo */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 pt-3 border-t border-slate-100">
          
          {/* Atalhos Rápidos de Data */}
          <div className="xl:col-span-4 flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Calendar size={12} className="text-purple-600" /> Período de Conciliação
            </label>
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => applyDatePreset('TODAY')}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                  activeDatePreset === 'TODAY' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:bg-white'
                }`}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('7DAYS')}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                  activeDatePreset === '7DAYS' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:bg-white'
                }`}
              >
                7 Dias
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('THIS_MONTH')}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                  activeDatePreset === 'THIS_MONTH' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:bg-white'
                }`}
              >
                Este Mês
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('ALL')}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                  activeDatePreset === 'ALL' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:bg-white'
                }`}
              >
                Tudo
              </button>
            </div>
          </div>

          {/* Seletores Manuais de Data Início / Fim */}
          <div className="xl:col-span-3 flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <CalendarRange size={12} /> Intervalo Personalizado
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={e => handleCustomDateChange('start', e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs text-slate-700"
              />
              <span className="text-xs font-bold text-slate-400">a</span>
              <input
                type="date"
                value={endDate}
                onChange={e => handleCustomDateChange('end', e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs text-slate-700"
              />
            </div>
          </div>

          {/* Filtro por Cliente */}
          <div className="xl:col-span-3 flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <User size={12} className="text-emerald-600" /> Filtrar Contato
            </label>
            <select
              value={filterCustomer}
              onChange={e => setFilterCustomer(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs text-slate-700"
            >
              <option value="ALL">Todos os Clientes / Fornecedores</option>
              {customers.map(cust => (
                <option key={cust.id} value={cust.id}>{cust.name}</option>
              ))}
            </select>
          </div>

          {/* Filtro de Conta Bancária */}
          <div className="xl:col-span-2 flex flex-col gap-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Landmark size={12} /> Conta / Caixa
            </label>
            <select
              value={filterAccount}
              onChange={e => setFilterAccount(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs text-slate-700"
            >
              <option value="ALL">Todas as Contas</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>

        </div>

      </div>

      {/* Tabela de Lançamentos */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/70 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-6 py-4">Data</th>
                <th className="px-6 py-4">Descrição / Contato</th>
                <th className="px-4 py-4">Categoria / C. Custo</th>
                <th className="px-4 py-4">Conta</th>
                <th className="px-6 py-4 text-right">Valor Líquido</th>
                <th className="px-4 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-400 text-sm font-medium italic">
                    Nenhum lançamento financeiro encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredTransactions.slice().reverse().map(t => {
                  const account = accounts.find(a => a.id === t.accountId);
                  const isSale = t.type === TransactionType.SALE;
                  const contact = t.contactName || customers.find(c => c.id === t.customerId || c.id === t.contactId)?.name;
                  const isPendingOrPartial = t.status === TransactionStatus.PENDENTE || t.status === TransactionStatus.PARCIAL || t.status === TransactionStatus.ATRASADO;

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4 text-xs font-bold text-slate-500 whitespace-nowrap">
                        {formatDateBR(t.date)}
                        {t.dueDate && t.dueDate !== t.date && (
                          <span className="block text-[10px] text-slate-400">Venc: {formatDateBR(t.dueDate)}</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-slate-800">{t.description}</p>
                          {t.paymentMethod && (
                            <span className="text-[9px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">
                              {t.paymentMethod}
                            </span>
                          )}
                        </div>
                        {contact && (
                          <p className="text-[11px] font-bold text-purple-700 pt-0.5 flex items-center gap-1">
                            <User size={11} /> {contact}
                          </p>
                        )}
                        {t.discount && t.discount > 0 ? (
                          <span className="text-[10px] text-amber-600 font-bold block">
                            🏷️ Desconto: {formatBRL(t.discount)} (Bruto: {formatBRL(t.originalAmount)})
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-tight bg-slate-100 px-2 py-1 rounded-lg inline-block mb-0.5">
                          {t.category}
                        </span>
                        <p className="text-[10px] font-bold text-slate-400">
                          {costCenters.find(cc => cc.id === t.costCenterId)?.name || t.costCenter || 'Geral'}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-xs font-bold text-slate-600">
                        {account?.name || 'Caixa'}
                      </td>
                      <td className={`px-6 py-4 text-right font-black text-sm whitespace-nowrap ${isSale ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isSale ? '+ ' : '- '} {formatBRL(t.amount)}
                        {t.paidAmount > 0 && t.paidAmount !== t.amount && (
                          <span className="block text-[10px] text-slate-400 font-normal">
                            Pago: {formatBRL(t.paidAmount)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase border ${
                          t.status === TransactionStatus.CONFIRMADO || t.status === TransactionStatus.PAGO 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : t.status === TransactionStatus.PARCIAL 
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : t.status === TransactionStatus.ATRASADO
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {t.status === TransactionStatus.PAGO && '✅ Pago'}
                          {t.status === TransactionStatus.CONFIRMADO && '✅ Confirmado'}
                          {t.status === TransactionStatus.PARCIAL && '🟡 Parcial'}
                          {t.status === TransactionStatus.PENDENTE && '🟡 Pendente'}
                          {t.status === TransactionStatus.ATRASADO && '🔴 Atrasado'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center items-center gap-1.5">
                          {/* Ação de Receber/Pagar/Abater */}
                          {isPendingOrPartial && (
                            <button
                              onClick={() => handleOpenReceivePay(t)}
                              className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm flex items-center gap-1 ${
                                isSale 
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                                  : 'bg-rose-600 hover:bg-rose-700 text-white'
                              }`}
                              title={isSale ? "Receber / Baixar / Abater Entrada" : "Pagar / Baixar / Abater Despesa"}
                            >
                              <DollarSign size={12} /> {isSale ? 'Receber' : 'Pagar'}
                            </button>
                          )}

                          {isSale && (
                            <button
                              onClick={() => handleOpenReceiptForTx(t)}
                              className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all"
                              title="Visualizar / Imprimir Recibo Oficial"
                            >
                              <Receipt size={16} />
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setEditingTransaction(t);
                              setFormModalType(t.type);
                              setIsFormModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                            title="Editar Lançamento Completo"
                          >
                            <Pencil size={16} />
                          </button>

                          <button
                            onClick={() => handleRequestDelete(t)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            title="Excluir (Protegido por Senha)"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Diálogo Completo de Transação */}
      <TransactionFormDialog
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingTransaction(null);
        }}
        initialType={formModalType}
        editingTransaction={editingTransaction}
        accounts={accounts}
        costCenters={costCenters}
        categories={categories}
        customers={customers}
        historyTransactions={transactions}
        onSave={handleSaveForm}
      />

      {/* Diálogo de Lançamento Rápido 1-Click */}
      <QuickEntryDialog
        isOpen={isQuickEntryOpen}
        onClose={() => setIsQuickEntryOpen(false)}
        accounts={accounts}
        costCenters={costCenters}
        categories={categories}
        customers={customers}
        historyTransactions={transactions}
        onSave={handleSaveForm}
      />

      {/* Diálogo de Recebimento/Pagamento Parcial & Abatimentos */}
      <ReceivePayDialog
        isOpen={isReceivePayOpen}
        onClose={() => {
          setIsReceivePayOpen(false);
          setSelectedTxForSettlement(null);
        }}
        transaction={selectedTxForSettlement}
        accounts={accounts}
        onConfirm={handleConfirmSettlement}
      />

      {/* Relatório Diário de Caixa */}
      <DailyFinancialReport
        isOpen={isDailyReportOpen}
        onClose={() => setIsDailyReportOpen(false)}
        transactions={transactions}
        accounts={accounts}
        company={company}
      />

      {/* Modal de Recibo Oficial */}
      {viewingReceipt && (
        <PaymentReceiptModal
          receipt={viewingReceipt}
          company={company}
          onClose={() => setViewingReceipt(null)}
        />
      )}

      {/* Modal de Exclusão Segura com Senha de 5 dígitos */}
      <DeletionPasswordModal
        isOpen={isDeleteModalOpen}
        title="Excluir Lançamento Financeiro"
        description="Esta ação removerá o lançamento do banco de dados e recalculará os saldos das contas vinculadas. Digite a senha de 5 dígitos para autorizar:"
        itemDescription={txToDelete ? `${txToDelete.description} (${formatBRL(txToDelete.amount)})` : undefined}
        onConfirm={handleConfirmDelete}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setTxToDelete(null);
        }}
        correctPassword="12345"
      />

    </div>
  );
};

export default Transactions;
