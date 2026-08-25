import React, { useState, useEffect } from 'react';
import { 
  Transaction, 
  TransactionType, 
  TransactionStatus, 
  FinancialAccount, 
  CostCenter, 
  Category, 
  PaymentReceipt,
  Company,
  Customer
} from '../types';
import { 
  Plus, Search, TrendingUp, TrendingDown, Calendar, CreditCard, Tag, 
  X, CheckCircle2, Clock, AlertCircle, Pencil, Trash2, DollarSign,
  FileText, Printer, Filter, Landmark, ArrowUpRight, ArrowDownLeft, Receipt
} from 'lucide-react';
import { PaymentReceiptModal } from './PaymentReceiptModal';

interface TransactionsProps {
  transactions: Transaction[];
  accounts: FinancialAccount[];
  costCenters: CostCenter[];
  categories: Category[];
  company: Company;
  customers: Customer[];
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'companyId'>) => void;
  onUpdateTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}

const Transactions: React.FC<TransactionsProps> = ({ 
  transactions, 
  accounts, 
  costCenters, 
  categories,
  company,
  customers,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'INFLOW' | 'OUTFLOW'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAccount, setFilterAccount] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<PaymentReceipt | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    paidAmount: '',
    date: new Date().toISOString().split('T')[0],
    type: TransactionType.EXPENSE,
    accountId: accounts[0]?.id || '',
    costCenterId: costCenters[0]?.id || '',
    category: 'Outros',
    status: TransactionStatus.CONFIRMADO,
    customerId: '',
    paymentMethod: 'PIX',
    notes: '',
    generateReceipt: false
  });

  const formatBRL = (val: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  useEffect(() => {
    const total = parseFloat(formData.amount) || 0;
    if (formData.status === TransactionStatus.CONFIRMADO || formData.status === TransactionStatus.PAGO) {
      setFormData(prev => ({ ...prev, paidAmount: total.toString() }));
    } else if (formData.status === TransactionStatus.PENDENTE || formData.status === TransactionStatus.ATRASADO) {
      setFormData(prev => ({ ...prev, paidAmount: '0' }));
    }
  }, [formData.status, formData.amount]);

  useEffect(() => {
    if (editingTransaction) {
      setFormData({
        description: editingTransaction.description,
        amount: editingTransaction.amount.toString(),
        paidAmount: editingTransaction.paidAmount.toString(),
        date: editingTransaction.date,
        type: editingTransaction.type,
        accountId: editingTransaction.accountId,
        costCenterId: editingTransaction.costCenterId || '',
        category: editingTransaction.category,
        status: editingTransaction.status,
        customerId: editingTransaction.customerId || '',
        paymentMethod: editingTransaction.paymentMethod || 'PIX',
        notes: editingTransaction.notes || '',
        generateReceipt: false
      });
      setIsModalOpen(true);
    }
  }, [editingTransaction]);

  const openNewModal = (type: TransactionType) => {
    setEditingTransaction(null);
    const firstCat = categories.find(c => c.type === (type === TransactionType.SALE ? 'INFLOW' : 'OUTFLOW'))?.name || 'Outros';
    setFormData({
      description: '',
      amount: '',
      paidAmount: '',
      date: new Date().toISOString().split('T')[0],
      type,
      accountId: accounts[0]?.id || '',
      costCenterId: costCenters[0]?.id || '',
      category: firstCat,
      status: TransactionStatus.CONFIRMADO,
      customerId: '',
      paymentMethod: 'PIX',
      notes: '',
      generateReceipt: type === TransactionType.SALE
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(formData.amount);
    const paidAmountNum = parseFloat(formData.paidAmount) || 0;
    
    if (paidAmountNum > amountNum) {
      alert('Erro: O valor pago não pode ser superior ao valor total.');
      return;
    }

    const receiptId = formData.generateReceipt ? `REC-${Date.now()}` : undefined;

    if (editingTransaction) {
      onUpdateTransaction({ 
        ...editingTransaction, 
        ...formData, 
        amount: amountNum, 
        paidAmount: paidAmountNum,
        receiptId: editingTransaction.receiptId || receiptId
      });
    } else {
      onAddTransaction({ 
        ...formData, 
        amount: amountNum, 
        paidAmount: paidAmountNum,
        receiptId
      });

      // Se marcou para gerar recibo, abre o modal de recibo
      if (formData.generateReceipt && formData.type === TransactionType.SALE) {
        const cust = customers.find(c => c.id === formData.customerId);
        const receipt: PaymentReceipt = {
          id: receiptId || `REC-${Date.now()}`,
          customerId: formData.customerId || 'general',
          customerName: cust?.name || 'Cliente Geral',
          customerDocument: cust?.document,
          amount: paidAmountNum > 0 ? paidAmountNum : amountNum,
          date: formData.date,
          paymentMethod: formData.paymentMethod,
          accountId: formData.accountId,
          accountName: accounts.find(a => a.id === formData.accountId)?.name,
          receivedBy: 'Caixa / Financeiro',
          description: formData.description,
          type: 'ENTRADA',
          notes: formData.notes
        };
        setViewingReceipt(receipt);
      }
    }
    handleCloseModal();
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTransaction(null);
  };

  // Cálculos dos Cards Financeiros
  const totalInflows = transactions
    .filter(t => t.type === TransactionType.SALE && (t.status === TransactionStatus.CONFIRMADO || t.status === TransactionStatus.PAGO))
    .reduce((acc, t) => acc + (t.paidAmount || t.amount || 0), 0);

  const totalOutflows = transactions
    .filter(t => t.type === TransactionType.EXPENSE && (t.status === TransactionStatus.CONFIRMADO || t.status === TransactionStatus.PAGO))
    .reduce((acc, t) => acc + (t.paidAmount || t.amount || 0), 0);

  const netBalance = totalInflows - totalOutflows;

  const totalPendingInflows = transactions
    .filter(t => t.type === TransactionType.SALE && (t.status === TransactionStatus.PENDENTE || t.status === TransactionStatus.PARCIAL))
    .reduce((acc, t) => acc + (t.amount - (t.paidAmount || 0)), 0);

  // Filtragem de Transações
  const filteredTransactions = transactions.filter(t => {
    // Filtro de Tipo
    if (activeTab === 'INFLOW' && t.type !== TransactionType.SALE) return false;
    if (activeTab === 'OUTFLOW' && t.type !== TransactionType.EXPENSE) return false;

    // Filtro de Conta
    if (filterAccount !== 'ALL' && t.accountId !== filterAccount) return false;

    // Filtro de Status
    if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;

    // Filtro de Busca
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDesc = t.description?.toLowerCase().includes(q);
      const matchCat = t.category?.toLowerCase().includes(q);
      const matchCust = customers.find(c => c.id === t.customerId)?.name.toLowerCase().includes(q);
      const matchAccount = accounts.find(a => a.id === t.accountId)?.name.toLowerCase().includes(q);
      return matchDesc || matchCat || matchCust || matchAccount;
    }

    return true;
  });

  const handleOpenReceiptForTx = (tx: Transaction) => {
    const cust = customers.find(c => c.id === tx.customerId);
    const receipt: PaymentReceipt = {
      id: tx.receiptId || `REC-${tx.id.replace(/\D/g, '').slice(-6) || Date.now()}`,
      orderId: tx.orderId,
      customerId: tx.customerId || 'general',
      customerName: cust?.name || 'Cliente Geral',
      customerDocument: cust?.document,
      amount: tx.paidAmount || tx.amount,
      date: tx.date,
      paymentMethod: tx.paymentMethod || 'Dinheiro / PIX',
      accountId: tx.accountId,
      accountName: accounts.find(a => a.id === tx.accountId)?.name,
      receivedBy: 'Caixa / Financeiro',
      description: tx.description,
      type: 'ENTRADA',
      notes: tx.notes
    };
    setViewingReceipt(receipt);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Principal */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Gestão de Entradas e Saídas</h2>
          <p className="text-slate-500 text-sm font-medium">Controle financeiro, conciliação e emissão de recibos</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => openNewModal(TransactionType.SALE)} 
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-2xl font-black transition-all flex items-center gap-2 shadow-lg shadow-emerald-200 text-xs"
          >
            <ArrowUpRight size={16} /> Nova Entrada (Receita)
          </button>
          <button 
            onClick={() => openNewModal(TransactionType.EXPENSE)} 
            className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-2xl font-black transition-all flex items-center gap-2 shadow-lg shadow-rose-200 text-xs"
          >
            <ArrowDownLeft size={16} /> Nova Saída (Despesa)
          </button>
        </div>
      </header>

      {/* Cards de Métricas Financeiras */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
            <ArrowUpRight size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total de Entradas</p>
            <p className="text-xl font-black text-emerald-600">{formatBRL(totalInflows)}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-black">
            <ArrowDownLeft size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total de Saídas</p>
            <p className="text-xl font-black text-rose-600">{formatBRL(totalOutflows)}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black ${netBalance >= 0 ? 'bg-purple-50 text-purple-600' : 'bg-rose-50 text-rose-600'}`}>
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Líquido</p>
            <p className={`text-xl font-black ${netBalance >= 0 ? 'text-purple-700' : 'text-rose-600'}`}>{formatBRL(netBalance)}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">A Receber (Pendentes)</p>
            <p className="text-xl font-black text-amber-600">{formatBRL(totalPendingInflows)}</p>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* Abas Tipo */}
        <div className="flex p-1 bg-slate-100 rounded-2xl w-full md:w-auto">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-5 py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Todas ({transactions.length})
          </button>
          <button
            onClick={() => setActiveTab('INFLOW')}
            className={`px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${activeTab === 'INFLOW' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-emerald-700'}`}
          >
            <ArrowUpRight size={14} /> Entradas
          </button>
          <button
            onClick={() => setActiveTab('OUTFLOW')}
            className={`px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${activeTab === 'OUTFLOW' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-500 hover:text-rose-700'}`}
          >
            <ArrowDownLeft size={14} /> Saídas
          </button>
        </div>

        {/* Busca e Filtro de Contas */}
        <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Buscar descrição, cliente ou categoria..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs focus:border-purple-500"
            />
          </div>

          <select
            value={filterAccount}
            onChange={e => setFilterAccount(e.target.value)}
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs text-slate-700"
          >
            <option value="ALL">Todas as Contas</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
        </div>

      </div>

      {/* Tabela de Lançamentos */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/70 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-6 py-4">Data</th>
                <th className="px-6 py-4">Descrição / Detalhes</th>
                <th className="px-4 py-4">Categoria</th>
                <th className="px-4 py-4">Conta Bancária</th>
                <th className="px-6 py-4 text-right">Valor / Impacto</th>
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

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-5 text-xs font-bold text-slate-500 whitespace-nowrap">{t.date}</td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-slate-800">{t.description}</p>
                          {t.paymentMethod && (
                            <span className="text-[9px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">
                              {t.paymentMethod}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-purple-600 pt-0.5">
                          {costCenters.find(cc => cc.id === t.costCenterId)?.name || 'Geral'}
                          {t.customerId && ` • ${customers.find(c => c.id === t.customerId)?.name || 'Cliente'}`}
                        </p>
                      </td>
                      <td className="px-4 py-5">
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-tight bg-slate-100 px-2.5 py-1 rounded-lg">
                          {t.category}
                        </span>
                      </td>
                      <td className="px-4 py-5 text-xs font-bold text-slate-600">
                        {account?.name || 'Caixa'}
                      </td>
                      <td className={`px-6 py-5 text-right font-black text-sm whitespace-nowrap ${isSale ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isSale ? '+' : '-'} {formatBRL(t.paidAmount || t.amount)}
                      </td>
                      <td className="px-4 py-5 text-center">
                        <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase border ${
                          t.status === TransactionStatus.CONFIRMADO || t.status === TransactionStatus.PAGO 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : t.status === TransactionStatus.PARCIAL 
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex justify-center items-center gap-1.5">
                          {isSale && (
                            <button
                              onClick={() => handleOpenReceiptForTx(t)}
                              className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all"
                              title="Visualizar / Imprimir Recibo"
                            >
                              <Receipt size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => setEditingTransaction(t)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                            title="Editar Lançamento"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => onDeleteTransaction(t.id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            title="Excluir"
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

      {/* Modal Criar / Editar Lançamento */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl p-8 md:p-10 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                {editingTransaction ? 'Editar Lançamento' : (formData.type === TransactionType.SALE ? 'Nova Entrada (Receita)' : 'Nova Saída (Despesa)')}
              </h3>
              <button onClick={handleCloseModal} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              
              <div className="grid grid-cols-2 gap-4 p-1.5 bg-slate-100 rounded-2xl mb-4">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: TransactionType.SALE })}
                  className={`py-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 ${formData.type === TransactionType.SALE ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
                >
                  <ArrowUpRight size={14} /> ENTRADA
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: TransactionType.EXPENSE })}
                  className={`py-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 ${formData.type === TransactionType.EXPENSE ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500'}`}
                >
                  <ArrowDownLeft size={14} /> SAÍDA
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição</label>
                  <input
                    required
                    type="text"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Ex: Recebimento de Venda, Compra de Peças, Diesel..."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-bold text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
                  <select
                    required
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 font-bold text-sm"
                  >
                    {categories
                      .filter(c => formData.type === TransactionType.SALE ? c.type === 'INFLOW' : c.type === 'OUTFLOW')
                      .map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)
                    }
                    <option value="Outros">Outros</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor Total (R$)</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg focus:border-purple-500"
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma de Pagamento</label>
                  <select
                    value={formData.paymentMethod}
                    onChange={e => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs"
                  >
                    <option value="PIX">PIX</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Transferência (TED/DOC)">Transferência (TED/DOC)</option>
                    <option value="Boleto">Boleto</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs"
                  >
                    <option value={TransactionStatus.CONFIRMADO}>Confirmado</option>
                    <option value={TransactionStatus.PENDENTE}>Pendente</option>
                    <option value={TransactionStatus.PARCIAL}>Parcial</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Conta Bancária / Caixa</label>
                  <select
                    value={formData.accountId}
                    onChange={e => setFormData({ ...formData, accountId: e.target.value })}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({acc.bankName || 'Caixa'})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Centro de Custo</label>
                  <select
                    value={formData.costCenterId}
                    onChange={e => setFormData({ ...formData, costCenterId: e.target.value })}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm"
                  >
                    {costCenters.map(cc => (
                      <option key={cc.id} value={cc.id}>{cc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {formData.type === TransactionType.SALE && (
                <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs font-black text-emerald-900">Emitir Recibo de Pagamento Oficial</p>
                    <p className="text-[10px] text-emerald-700">Abre o recibo pronto para impressão ou compartilhamento logo após salvar.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.generateReceipt}
                    onChange={e => setFormData({ ...formData, generateReceipt: e.target.checked })}
                    className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                  />
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest border border-slate-100 rounded-2xl hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`flex-[2] py-4 rounded-2xl font-black text-white shadow-xl ${formData.type === TransactionType.SALE ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-slate-800'}`}
                >
                  Salvar Lançamento
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal de Recibo Oficial */}
      {viewingReceipt && (
        <PaymentReceiptModal
          receipt={viewingReceipt}
          company={company}
          onClose={() => setViewingReceipt(null)}
        />
      )}

    </div>
  );
};

export default Transactions;
