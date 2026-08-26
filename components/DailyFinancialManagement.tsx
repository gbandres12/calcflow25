import React, { useState, useMemo } from 'react';
import { 
  Transaction, 
  FinancialAccount, 
  TransactionType, 
  TransactionStatus, 
  Customer, 
  SaleOrder,
  Company
} from '../types';
import { 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Printer, 
  Share2, 
  Plus, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  FileText, 
  ShieldAlert, 
  X, 
  Trash2, 
  Edit3, 
  Building2, 
  CreditCard,
  Percent,
  Check
} from 'lucide-react';
import { COMPANY_INFO, INFLOW_CATEGORIES, OUTFLOW_CATEGORIES, INITIAL_COST_CENTERS } from '../constants';

interface DailyFinancialManagementProps {
  transactions: Transaction[];
  accounts: FinancialAccount[];
  customers?: Customer[];
  orders?: SaleOrder[];
  company?: Company;
  onAddTransaction: (transaction: Omit<Transaction, 'id'>) => void;
  onUpdateTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onPrintReceipt?: (receipt: any) => void;
}

export const DailyFinancialManagement: React.FC<DailyFinancialManagementProps> = ({
  transactions,
  accounts,
  customers = [],
  orders = [],
  company = COMPANY_INFO,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onPrintReceipt
}) => {
  // Format today's date YYYY-MM-DD
  const getTodayStr = () => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  };

  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'inflows' | 'outflows' | 'deductions'>('all');
  
  // Modals
  const [isQuickEntryOpen, setIsQuickEntryOpen] = useState(false);
  const [quickEntryType, setQuickEntryType] = useState<TransactionType>(TransactionType.SALE);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [viewReceiptTx, setViewReceiptTx] = useState<Transaction | null>(null);

  // Quick Entry Form
  const [quickForm, setQuickForm] = useState({
    description: '',
    amount: '',
    category: INFLOW_CATEGORIES[0],
    accountId: accounts[0]?.id || 'acc-1',
    costCenter: INITIAL_COST_CENTERS[0]?.name || 'Geral',
    contactName: '',
    paymentMethod: 'PIX',
    status: TransactionStatus.CONFIRMADO,
    notes: ''
  });

  // Date Navigation Helpers
  const handlePrevDay = () => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleSetToday = () => {
    setSelectedDate(getTodayStr());
  };

  const handleSetYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // Mathematical balance and movement calculations
  const {
    dayTransactions,
    dayInflowTransactions,
    dayOutflowTransactions,
    initialBalance,
    totalDayInflows,
    totalDayOutflows,
    totalDayDeductions,
    netDayResult,
    finalBalance
  } = useMemo(() => {
    const targetDate = selectedDate;

    // Calculate Initial Balance:
    // Sum of initial balance of selected accounts + all movements strictly BEFORE targetDate
    let initialAccSum = 0;
    if (selectedAccountId === 'all') {
      initialAccSum = accounts.reduce((acc, a) => acc + (Number(a.initialBalance) || 0), 0);
    } else {
      const singleAcc = accounts.find(a => a.id === selectedAccountId);
      initialAccSum = singleAcc ? (Number(singleAcc.initialBalance) || 0) : 0;
    }

    let priorNetMovements = 0;
    let sumInflows = 0;
    let sumOutflows = 0;
    let sumDeductions = 0;

    const dayTxIds = new Set<string>();

    transactions.forEach(t => {
      const hasPaymentsArr = Array.isArray(t.payments) && t.payments.length > 0;

      if (hasPaymentsArr) {
        t.payments!.forEach(pmt => {
          const pmtDate = pmt.paymentDate || t.paymentDate || t.date;
          const pmtAccId = pmt.accountId || t.accountId;
          const matchesAccount = selectedAccountId === 'all' || pmtAccId === selectedAccountId;

          if (!matchesAccount || !pmtDate) return;

          const pmtAmount = Number(pmt.amount) || 0;

          if (pmtDate < targetDate) {
            if (!pmt.isDiscountOrDeduction) {
              if (t.type === TransactionType.SALE) {
                priorNetMovements += pmtAmount;
              } else if (t.type === TransactionType.EXPENSE || t.type === TransactionType.PURCHASE) {
                priorNetMovements -= pmtAmount;
              }
            }
          } else if (pmtDate === targetDate) {
            dayTxIds.add(t.id);
            if (pmt.isDiscountOrDeduction) {
              sumDeductions += pmtAmount;
            } else {
              if (t.type === TransactionType.SALE) {
                sumInflows += pmtAmount;
              } else if (t.type === TransactionType.EXPENSE || t.type === TransactionType.PURCHASE) {
                sumOutflows += pmtAmount;
              }
            }
          }
        });
      } else {
        // Fallback for transactions without a payments array (direct transactions or quick entries)
        const isPaidOrConfirmed = 
          t.status === TransactionStatus.CONFIRMADO || 
          t.status === TransactionStatus.PAGO || 
          t.status === TransactionStatus.PARCIAL;

        const matchesAccount = selectedAccountId === 'all' || t.accountId === selectedAccountId;
        const txDate = t.paymentDate || t.date;

        if (txDate === targetDate && matchesAccount) {
          dayTxIds.add(t.id);
        }

        if (!isPaidOrConfirmed || !matchesAccount || !txDate) return;

        const paidAmt = Number(
          t.paidAmount !== undefined && t.paidAmount !== null && t.paidAmount > 0
            ? t.paidAmount 
            : (t.status === TransactionStatus.CONFIRMADO || t.status === TransactionStatus.PAGO ? t.amount : 0)
        ) || 0;

        if (txDate < targetDate) {
          if (t.type === TransactionType.SALE) {
            priorNetMovements += paidAmt;
          } else if (t.type === TransactionType.EXPENSE || t.type === TransactionType.PURCHASE) {
            priorNetMovements -= paidAmt;
          }
        } else if (txDate === targetDate) {
          if (t.type === TransactionType.SALE) {
            sumInflows += paidAmt;
          } else if (t.type === TransactionType.EXPENSE || t.type === TransactionType.PURCHASE) {
            sumOutflows += paidAmt;
          }
          if (t.discount) {
            sumDeductions += Number(t.discount) || 0;
          }
        }
      }

      // Ensure any transaction whose date or paymentDate is targetDate is listed
      const baseDate = t.paymentDate || t.date;
      if (baseDate === targetDate && (selectedAccountId === 'all' || t.accountId === selectedAccountId)) {
        dayTxIds.add(t.id);
      }
    });

    const dayTxs = transactions.filter(t => dayTxIds.has(t.id));
    const dayInflows = dayTxs.filter(t => t.type === TransactionType.SALE);
    const dayOutflows = dayTxs.filter(t => t.type === TransactionType.EXPENSE || t.type === TransactionType.PURCHASE);

    const calculatedInitialBalance = initialAccSum + priorNetMovements;
    const netResult = sumInflows - sumOutflows;
    const calculatedFinalBalance = calculatedInitialBalance + netResult;

    return {
      dayTransactions: dayTxs,
      dayInflowTransactions: dayInflows,
      dayOutflowTransactions: dayOutflows,
      initialBalance: calculatedInitialBalance,
      totalDayInflows: sumInflows,
      totalDayOutflows: sumOutflows,
      totalDayDeductions: sumDeductions,
      netDayResult: netResult,
      finalBalance: calculatedFinalBalance
    };
  }, [transactions, accounts, selectedDate, selectedAccountId]);

  // Tab Filtering & Search
  const filteredList = useMemo(() => {
    let list = dayTransactions;

    if (activeTab === 'inflows') {
      list = dayInflowTransactions;
    } else if (activeTab === 'outflows') {
      list = dayOutflowTransactions;
    } else if (activeTab === 'deductions') {
      list = dayTransactions.filter(t => (Number(t.discount) || 0) > 0);
    }

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase();
    return list.filter(t => 
      t.description.toLowerCase().includes(q) ||
      (t.contactName && t.contactName.toLowerCase().includes(q)) ||
      (t.category && t.category.toLowerCase().includes(q)) ||
      (t.paymentMethod && t.paymentMethod.toLowerCase().includes(q)) ||
      (t.costCenter && t.costCenter.toLowerCase().includes(q))
    );
  }, [dayTransactions, dayInflowTransactions, dayOutflowTransactions, activeTab, searchQuery]);

  // Submit Quick Entry
  const handleQuickEntrySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(quickForm.amount);
    if (isNaN(val) || val <= 0) return;

    onAddTransaction({
      description: quickForm.description || (quickEntryType === TransactionType.SALE ? 'Recebimento Balança / Venda' : 'Despesa Operacional'),
      amount: val,
      paidAmount: quickForm.status === TransactionStatus.CONFIRMADO ? val : 0,
      type: quickEntryType,
      status: quickForm.status,
      category: quickForm.category,
      accountId: quickForm.accountId,
      date: selectedDate,
      paymentDate: quickForm.status === TransactionStatus.CONFIRMADO ? selectedDate : undefined,
      costCenter: quickForm.costCenter,
      contactName: quickForm.contactName,
      paymentMethod: quickForm.paymentMethod,
      notes: quickForm.notes
    });

    setIsQuickEntryOpen(false);
    setQuickForm({
      description: '',
      amount: '',
      category: quickEntryType === TransactionType.SALE ? INFLOW_CATEGORIES[0] : OUTFLOW_CATEGORIES[0],
      accountId: accounts[0]?.id || 'acc-1',
      costCenter: INITIAL_COST_CENTERS[0]?.name || 'Geral',
      contactName: '',
      paymentMethod: 'PIX',
      status: TransactionStatus.CONFIRMADO,
      notes: ''
    });
  };

  // Open quick entry modal for specific type
  const handleOpenQuickModal = (type: TransactionType) => {
    setQuickEntryType(type);
    setQuickForm(prev => ({
      ...prev,
      category: type === TransactionType.SALE ? INFLOW_CATEGORIES[0] : OUTFLOW_CATEGORIES[0]
    }));
    setIsQuickEntryOpen(true);
  };

  // Delete Transaction with Password 1234
  const confirmDelete = () => {
    if (deletePassword !== '1234' && deletePassword !== '12345' && deletePassword !== 'admin') {
      setDeleteError('Senha de segurança incorreta (Padrão: 1234)');
      return;
    }
    if (transactionToDelete) {
      onDeleteTransaction(transactionToDelete);
      setIsDeleteModalOpen(false);
      setTransactionToDelete(null);
      setDeletePassword('');
      setDeleteError('');
    }
  };

  // WhatsApp Share Text
  const handleShareWhatsApp = () => {
    const formattedDate = selectedDate.split('-').reverse().join('/');
    const accountLabel = selectedAccountId === 'all' 
      ? 'Todas as Contas / Caixas' 
      : (accounts.find(a => a.id === selectedAccountId)?.name || 'Conta Selecionada');

    let text = `*📊 FECHAMENTO FINANCEIRO DIÁRIO - CALCÁRIOFLOW*\n`;
    text += `🏢 *Usina:* ${company.name}\n`;
    text += `📅 *Data:* ${formattedDate}\n`;
    text += `🏦 *Conta:* ${accountLabel}\n\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💵 *Saldo Inicial:* R$ ${initialBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    text += `🟢 *Total de Entradas (${dayInflowTransactions.length}):* R$ ${totalDayInflows.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    text += `🔴 *Total de Saídas (${dayOutflowTransactions.length}):* R$ ${totalDayOutflows.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    text += `⚖️ *Resultado do Dia:* R$ ${netDayResult.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    text += `💰 *Saldo Final do Dia:* R$ ${finalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (dayInflowTransactions.length > 0) {
      text += `*📥 PRINCIPAIS ENTRADAS DO DIA:*\n`;
      dayInflowTransactions.slice(0, 5).forEach((t, i) => {
        text += `${i + 1}. ${t.description} - R$ ${t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${t.paymentMethod || 'PIX'})\n`;
      });
      text += `\n`;
    }

    if (dayOutflowTransactions.length > 0) {
      text += `*📤 PRINCIPAIS SAÍDAS DO DIA:*\n`;
      dayOutflowTransactions.slice(0, 5).forEach((t, i) => {
        text += `${i + 1}. ${t.description} - R$ ${t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${t.category})\n`;
      });
      text += `\n`;
    }

    text += `_Relatório gerado automaticamente pelo CalcárioFlow ERP_`;

    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  // Print Daily Report
  const handlePrintDailyReport = () => {
    window.print();
  };

  const getAccountName = (accId?: string) => {
    const acc = accounts.find(a => a.id === accId);
    return acc ? acc.name : 'Caixa / Não informado';
  };

  const formattedSelectedDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="space-y-6">
      {/* Header & Date Navigation */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Movimentação Diária</h2>
            <span className="bg-amber-100 text-amber-800 text-[10px] font-black uppercase px-3 py-1 rounded-full border border-amber-200">
              Fechamento & Caixa
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-500 capitalize mt-1">
            {formattedSelectedDate}
          </p>
        </div>

        {/* Date Selector & Fast Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Previous Day */}
          <button 
            onClick={handlePrevDay}
            title="Dia Anterior"
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all font-bold"
          >
            <ChevronLeft size={18} />
          </button>

          {/* Date Picker */}
          <div className="relative flex items-center bg-slate-50 border border-slate-300 rounded-xl px-3 py-2">
            <Calendar size={16} className="text-slate-500 mr-2" />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-black text-sm text-slate-800 outline-none cursor-pointer"
            />
          </div>

          {/* Next Day */}
          <button 
            onClick={handleNextDay}
            title="Próximo Dia"
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all font-bold"
          >
            <ChevronRight size={18} />
          </button>

          {/* Presets */}
          <button 
            onClick={handleSetToday}
            className={`px-3 py-2 rounded-xl text-xs font-black transition-all ${
              selectedDate === getTodayStr() 
                ? 'bg-slate-900 text-white shadow-sm' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Hoje
          </button>
          
          <button 
            onClick={handleSetYesterday}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black transition-all"
          >
            Ontem
          </button>

          {/* Account Filter */}
          <div className="relative">
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold px-3 py-2 rounded-xl outline-none"
            >
              <option value="all">Todas as Contas & Caixas</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* KPI Cards: Saldo Inicial, Entradas, Saídas, Resultado e Saldo Final */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Saldo Inicial */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Saldo Inicial</span>
            <div className="p-2 bg-slate-100 text-slate-600 rounded-xl">
              <Wallet size={16} />
            </div>
          </div>
          <p className="text-xl font-black text-slate-800 tracking-tight">
            R$ {initialBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] font-bold text-slate-400 mt-1 block">Até 00:00 da data</span>
        </div>

        {/* Entradas do Dia */}
        <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Entradas (+)</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <ArrowDownLeft size={16} />
            </div>
          </div>
          <p className="text-xl font-black text-emerald-700 tracking-tight">
            R$ {totalDayInflows.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] font-bold text-emerald-600 mt-1 block">
            {dayInflowTransactions.length} recebimento(s)
          </span>
        </div>

        {/* Saídas do Dia */}
        <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-600">Saídas (-)</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <ArrowUpRight size={16} />
            </div>
          </div>
          <p className="text-xl font-black text-rose-700 tracking-tight">
            R$ {totalDayOutflows.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] font-bold text-rose-600 mt-1 block">
            {dayOutflowTransactions.length} despesa(s)/pagamento(s)
          </span>
        </div>

        {/* Resultado Líquido do Dia */}
        <div className={`p-5 rounded-2xl border shadow-sm relative overflow-hidden ${
          netDayResult >= 0 
            ? 'bg-emerald-50/50 border-emerald-200' 
            : 'bg-rose-50/50 border-rose-200'
        }`}>
          <div className="flex justify-between items-start mb-2">
            <span className={`text-[10px] font-black uppercase tracking-wider ${
              netDayResult >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}>
              Resultado Líquido
            </span>
            <div className={`p-2 rounded-xl ${
              netDayResult >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}>
              {netDayResult >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            </div>
          </div>
          <p className={`text-xl font-black tracking-tight ${
            netDayResult >= 0 ? 'text-emerald-800' : 'text-rose-800'
          }`}>
            R$ {netDayResult.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] font-bold text-slate-500 mt-1 block">Entradas - Saídas</span>
        </div>

        {/* Saldo Final do Dia */}
        <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-md relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">Saldo Final (=)</span>
            <div className="p-2 bg-slate-800 text-amber-400 rounded-xl">
              <DollarSign size={16} />
            </div>
          </div>
          <p className="text-xl font-black text-white tracking-tight">
            R$ {finalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] font-bold text-slate-400 mt-1 block">Fechamento do Caixa</span>
        </div>
      </div>

      {/* Action Bar: Lançamento Rápido, Impressão, WhatsApp */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrar por cliente, fornecedor, descrição, categoria ou forma de pagamento..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-slate-800 transition-all"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Nova Entrada */}
          <button
            onClick={() => handleOpenQuickModal(TransactionType.SALE)}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            <Plus size={15} /> Receber / Entrada
          </button>

          {/* Nova Saída */}
          <button
            onClick={() => handleOpenQuickModal(TransactionType.EXPENSE)}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            <Plus size={15} /> Pagar / Despesa
          </button>

          {/* WhatsApp Share */}
          <button
            onClick={handleShareWhatsApp}
            title="Enviar Fechamento Diário no WhatsApp"
            className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Share2 size={15} /> WhatsApp
          </button>

          {/* Imprimir Relatório */}
          <button
            onClick={() => setIsPrintModalOpen(true)}
            title="Imprimir Fechamento Diário A4"
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Printer size={15} /> Imprimir A4
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('all')}
          className={`pb-3 px-4 text-xs font-black transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'all'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Todos os Movimentos ({dayTransactions.length})
        </button>
        <button
          onClick={() => setActiveTab('inflows')}
          className={`pb-3 px-4 text-xs font-black transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'inflows'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <ArrowDownLeft size={14} className="text-emerald-600" />
          Entradas ({dayInflowTransactions.length})
        </button>
        <button
          onClick={() => setActiveTab('outflows')}
          className={`pb-3 px-4 text-xs font-black transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'outflows'
              ? 'border-rose-600 text-rose-700'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <ArrowUpRight size={14} className="text-rose-600" />
          Saídas ({dayOutflowTransactions.length})
        </button>
        {totalDayDeductions > 0 && (
          <button
            onClick={() => setActiveTab('deductions')}
            className={`pb-3 px-4 text-xs font-black transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'deductions'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Percent size={14} className="text-amber-600" />
            Abatimentos / Descontos
          </button>
        )}
      </div>

      {/* Movements Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-wider">
                <th className="px-5 py-3.5">Tipo & Descrição</th>
                <th className="px-4 py-3.5">Cliente / Fornecedor</th>
                <th className="px-4 py-3.5">Categoria & C. Custo</th>
                <th className="px-4 py-3.5">Conta / Meio Pagto</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Valor Líquido</th>
                <th className="px-5 py-3.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400 text-xs font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Wallet size={32} className="text-slate-300" />
                      <p className="font-bold text-slate-600">Nenhuma movimentação registrada nesta data ({selectedDate})</p>
                      <p className="text-[11px] text-slate-400">Use os botões de "Receber / Entrada" ou "Pagar / Despesa" acima para lançar no dia.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredList.map(tx => {
                  const isInflow = tx.type === TransactionType.SALE;
                  const amt = Number(tx.paidAmount !== undefined ? tx.paidAmount : tx.amount) || 0;

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isInflow ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {isInflow ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-900">{tx.description}</p>
                            {tx.notes && <p className="text-[10px] text-slate-400 line-clamp-1">{tx.notes}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs font-bold text-slate-700">
                        {tx.contactName || (isInflow ? 'Cliente Balança' : 'Fornecedor Operacional')}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-[11px] font-bold text-slate-700 block">{tx.category}</span>
                        {tx.costCenter && <span className="text-[9px] font-bold text-slate-400 block">{tx.costCenter}</span>}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-[11px] font-bold text-slate-800 block">{getAccountName(tx.accountId)}</span>
                        <span className="text-[10px] font-bold text-slate-400 block">{tx.paymentMethod || 'PIX / À Vista'}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border flex items-center gap-1 w-fit ${
                          tx.status === TransactionStatus.CONFIRMADO 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {tx.status === TransactionStatus.CONFIRMADO ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                          {tx.status}
                        </span>
                      </td>
                      <td className={`px-4 py-4 text-right text-xs font-black ${
                        isInflow ? 'text-emerald-700' : 'text-rose-700'
                      }`}>
                        {isInflow ? '+ ' : '- '}
                        R$ {amt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Recibo */}
                          <button
                            onClick={() => setViewReceiptTx(tx)}
                            title="Visualizar Recibo"
                            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
                          >
                            <FileText size={15} />
                          </button>

                          {/* Excluir com Senha */}
                          <button
                            onClick={() => {
                              setTransactionToDelete(tx.id);
                              setDeletePassword('');
                              setDeleteError('');
                              setIsDeleteModalOpen(true);
                            }}
                            title="Excluir Lançamento"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          >
                            <Trash2 size={15} />
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

      {/* Modal Lançamento Rápido Diário */}
      {isQuickEntryOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-200 animate-in zoom-in-95 overflow-y-auto max-h-[92vh] custom-scrollbar">
            <div className="flex justify-between items-center pb-4 border-b border-slate-200 mb-6">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${
                  quickEntryType === TransactionType.SALE ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}>
                  {quickEntryType === TransactionType.SALE ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">
                    {quickEntryType === TransactionType.SALE ? 'Novo Recebimento / Entrada' : 'Novo Pagamento / Despesa'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Data do lançamento: {selectedDate}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsQuickEntryOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleQuickEntrySubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Valor em R$ *</label>
                <input 
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={quickForm.amount}
                  onChange={(e) => setQuickForm({ ...quickForm, amount: e.target.value })}
                  placeholder="0,00"
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl font-black text-lg text-slate-900 outline-none focus:border-slate-900 focus:bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Descrição do Movimento *</label>
                <input 
                  required
                  type="text"
                  value={quickForm.description}
                  onChange={(e) => setQuickForm({ ...quickForm, description: e.target.value })}
                  placeholder={quickEntryType === TransactionType.SALE ? 'Ex: Venda de 45T Calcário Granel' : 'Ex: Abastecimento Gerador Britagem'}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-bold text-xs text-slate-800 outline-none focus:border-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    {quickEntryType === TransactionType.SALE ? 'Cliente / Pagador' : 'Fornecedor / Favorecido'}
                  </label>
                  <input 
                    type="text"
                    value={quickForm.contactName}
                    onChange={(e) => setQuickForm({ ...quickForm, contactName: e.target.value })}
                    placeholder="Nome da fazenda ou fornecedor"
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-bold text-xs text-slate-800 outline-none focus:border-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Categoria</label>
                  <select
                    value={quickForm.category}
                    onChange={(e) => setQuickForm({ ...quickForm, category: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-bold text-xs text-slate-800 outline-none"
                  >
                    {(quickEntryType === TransactionType.SALE ? INFLOW_CATEGORIES : OUTFLOW_CATEGORIES).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Conta / Caixa de Destino</label>
                  <select
                    value={quickForm.accountId}
                    onChange={(e) => setQuickForm({ ...quickForm, accountId: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-bold text-xs text-slate-800 outline-none"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Forma de Pagamento</label>
                  <select
                    value={quickForm.paymentMethod}
                    onChange={(e) => setQuickForm({ ...quickForm, paymentMethod: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-bold text-xs text-slate-800 outline-none"
                  >
                    <option value="PIX">PIX Instantâneo</option>
                    <option value="Dinheiro">Dinheiro em Espécie</option>
                    <option value="TED/DOC">Transferência Bancária</option>
                    <option value="Boleto Bancário">Boleto Bancário</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Observações Adicionais</label>
                <textarea 
                  rows={2}
                  value={quickForm.notes}
                  onChange={(e) => setQuickForm({ ...quickForm, notes: e.target.value })}
                  placeholder="Informações de romaneio, nota fiscal ou autorização..."
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-medium text-xs text-slate-800 outline-none focus:border-slate-900"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsQuickEntryOpen(false)}
                  className="w-1/3 py-3 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`flex-1 py-3 text-white font-black text-xs rounded-xl shadow-md transition-all ${
                    quickEntryType === TransactionType.SALE ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  Confirmar Lançamento no Dia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Exclusão com Senha 12345 */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[160] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="p-2.5 bg-rose-50 rounded-xl">
                <ShieldAlert size={22} />
              </div>
              <h3 className="font-black text-slate-900">Excluir Lançamento</h3>
            </div>
            <p className="text-xs text-slate-500 font-medium mb-4">
              Para estornar e excluir esta movimentação financeira, digite a senha de segurança de auditoria (Padrão: <strong className="text-slate-800">1234</strong>):
            </p>

            <input 
              type="password"
              value={deletePassword}
              onChange={(e) => {
                setDeletePassword(e.target.value);
                setDeleteError('');
              }}
              placeholder="Digite 1234"
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl font-bold text-sm text-center outline-none focus:border-rose-600 mb-2"
            />

            {deleteError && (
              <p className="text-[11px] font-bold text-rose-600 mb-3">{deleteError}</p>
            )}

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setTransactionToDelete(null);
                  setDeletePassword('');
                }}
                className="w-1/2 py-2.5 border border-slate-300 font-bold text-xs rounded-xl text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Visualização de Recibo */}
      {viewReceiptTx && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[160] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-slate-800" />
                <h3 className="text-sm font-black text-slate-900 uppercase">Comprovante de Lançamento</h3>
              </div>
              <button 
                onClick={() => setViewReceiptTx(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Usina:</span>
                <span className="font-black text-slate-800">{company.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">CNPJ:</span>
                <span className="font-mono text-slate-700">{company.document}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Data / Hora:</span>
                <span className="font-bold text-slate-800">{viewReceiptTx.paymentDate || viewReceiptTx.date}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Tipo:</span>
                <span className={`font-black uppercase ${
                  viewReceiptTx.type === TransactionType.SALE ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  {viewReceiptTx.type === TransactionType.SALE ? 'Entrada / Recebimento' : 'Saída / Pagamento'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Favorecido / Contato:</span>
                <span className="font-bold text-slate-800">{viewReceiptTx.contactName || 'Geral'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Conta / Meio:</span>
                <span className="font-bold text-slate-800">{getAccountName(viewReceiptTx.accountId)} ({viewReceiptTx.paymentMethod || 'PIX'})</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm">
                <span className="font-black text-slate-800">Valor Final:</span>
                <span className={`font-black text-base ${
                  viewReceiptTx.type === TransactionType.SALE ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  R$ {Number(viewReceiptTx.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-1/2 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
              >
                <Printer size={15} /> Imprimir Recibo
              </button>
              <button
                type="button"
                onClick={() => setViewReceiptTx(null)}
                className="w-1/2 py-2.5 border border-slate-300 font-bold text-xs rounded-xl text-slate-700 hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Impressão Completa do Fechamento Diário A4 */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[170] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-8 shadow-2xl border border-slate-200 animate-in zoom-in-95 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center pb-4 border-b border-slate-200 mb-6">
              <div>
                <h3 className="text-lg font-black text-slate-900">Relatório de Fechamento Diário de Caixa</h3>
                <p className="text-xs text-slate-500">Pronto para impressão em folha A4 e assinatura</p>
              </div>
              <button onClick={() => setIsPrintModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            {/* Folha A4 Formatada */}
            <div className="p-6 bg-white border border-slate-300 rounded-2xl space-y-6 text-xs text-slate-800 font-medium">
              <div className="flex justify-between items-start border-b pb-4 border-slate-200">
                <div>
                  <h4 className="text-base font-black text-slate-900">{company.name}</h4>
                  <p className="text-xs text-slate-500 font-mono">CNPJ: {company.document} | IE: {company.phone}</p>
                  <p className="text-[11px] text-slate-500">{company.address}, {company.city} - {company.state}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black uppercase bg-slate-900 text-white px-3 py-1 rounded-md">Extrato Diário</span>
                  <p className="text-xs font-bold text-slate-700 mt-2">Data: {selectedDate.split('-').reverse().join('/')}</p>
                </div>
              </div>

              {/* Quadro Resumo Financeiro */}
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Saldo Inicial</span>
                  <p className="font-black text-sm text-slate-800">
                    R$ {initialBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-600 block">Total Entradas</span>
                  <p className="font-black text-sm text-emerald-700">
                    R$ {totalDayInflows.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-rose-600 block">Total Saídas</span>
                  <p className="font-black text-sm text-rose-700">
                    R$ {totalDayOutflows.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="col-span-3 pt-3 border-t border-slate-200 flex justify-between items-center">
                  <span className="font-black text-xs uppercase text-slate-900">Saldo Final em Caixa:</span>
                  <span className="font-black text-base text-slate-900">
                    R$ {finalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Itens do Dia */}
              <div>
                <h5 className="font-black text-xs uppercase text-slate-800 mb-2">Detalhamento dos Lançamentos ({dayTransactions.length})</h5>
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 uppercase font-black text-[9px]">
                      <th className="py-1.5">Descrição</th>
                      <th className="py-1.5">Favorecido / Cliente</th>
                      <th className="py-1.5">Conta / Meio</th>
                      <th className="py-1.5 text-right">Valor Líquido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dayTransactions.map(t => (
                      <tr key={t.id}>
                        <td className="py-2 font-bold text-slate-800">{t.description}</td>
                        <td className="py-2 text-slate-600">{t.contactName || '-'}</td>
                        <td className="py-2 text-slate-500">{t.paymentMethod || 'PIX'}</td>
                        <td className={`py-2 text-right font-black ${
                          t.type === TransactionType.SALE ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {t.type === TransactionType.SALE ? '+' : '-'} R$ {Number(t.paidAmount !== undefined ? t.paidAmount : t.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Assinaturas */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200">
                <div className="text-center">
                  <div className="border-b border-slate-400 w-full mb-1"></div>
                  <p className="text-[10px] font-bold text-slate-700">Operador de Caixa / Balança</p>
                </div>
                <div className="text-center">
                  <div className="border-b border-slate-400 w-full mb-1"></div>
                  <p className="text-[10px] font-bold text-slate-700">Gerência / Diretoria Financeira</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2"
              >
                <Printer size={16} /> Imprimir Agora (A4 / PDF)
              </button>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="px-6 py-3 border border-slate-300 font-bold text-xs rounded-xl text-slate-700 hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
