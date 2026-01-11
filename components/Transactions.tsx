
import React, { useState, useRef, useEffect } from 'react';
import { Transaction, TransactionType, TransactionStatus, FinancialAccount, CostCenter, Category } from '../types';
import { 
  Plus, Search, Filter, Download, 
  TrendingUp, TrendingDown, 
  Calendar, CreditCard, Tag, 
  X, CheckCircle2, Clock, AlertCircle, FileUp, Database, Loader2, AlignLeft, Zap, Pencil, Trash2, DollarSign,
  ArrowRight, CheckCircle
} from 'lucide-react';

interface TransactionsProps {
  transactions: Transaction[];
  accounts: FinancialAccount[];
  costCenters: CostCenter[];
  categories: Category[];
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'companyId'>) => void;
  onUpdateTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}

const Transactions: React.FC<TransactionsProps> = ({ 
  transactions, 
  accounts, 
  costCenters, 
  categories,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
    notes: ''
  });

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
        notes: editingTransaction.notes || ''
      });
      setIsModalOpen(true);
    }
  }, [editingTransaction]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(formData.amount);
    const paidAmountNum = parseFloat(formData.paidAmount) || 0;
    
    if (paidAmountNum > amountNum) {
      alert('Erro: O valor pago não pode ser superior ao valor total.');
      return;
    }

    if (editingTransaction) {
      onUpdateTransaction({ ...editingTransaction, ...formData, amount: amountNum, paidAmount: paidAmountNum });
    } else {
      onAddTransaction({ ...formData, amount: amountNum, paidAmount: paidAmountNum });
    }
    handleCloseModal();
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTransaction(null);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      description: '', amount: '', paidAmount: '', date: new Date().toISOString().split('T')[0],
      type: TransactionType.EXPENSE, accountId: accounts[0]?.id || '', costCenterId: costCenters[0]?.id || '',
      category: 'Outros', status: TransactionStatus.CONFIRMADO, notes: ''
    });
  };

  const handleTypeChange = (type: TransactionType) => {
    const firstCat = categories.find(c => c.type === (type === TransactionType.SALE ? 'INFLOW' : 'OUTFLOW'))?.name || 'Outros';
    setFormData({ ...formData, type, category: firstCat });
  };

  const filteredCategories = categories.filter(c => 
    formData.type === TransactionType.SALE ? c.type === 'INFLOW' : c.type === 'OUTFLOW'
  );

  const remainingAmount = (parseFloat(formData.amount) || 0) - (parseFloat(formData.paidAmount) || 0);

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Área de Lançamentos</h2>
          <p className="text-slate-500 text-sm font-medium">Gestão financeira para conciliação bancária</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { setEditingTransaction(null); resetForm(); setIsModalOpen(true); }} className="bg-purple-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-purple-700 transition-all flex items-center gap-2 shadow-lg shadow-purple-200 text-sm">
            <Plus size={18} /> Novo Lançamento
          </button>
        </div>
      </header>

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-8 py-4">Data</th>
                <th className="px-6 py-4">Descrição / C. Custo</th>
                <th className="px-6 py-4">Categoria</th>
                <th className="px-6 py-4 text-right">Impacto Caixa</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-8 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {transactions.slice().reverse().map(t => (
                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-5 text-xs font-bold text-slate-500">{t.date}</td>
                  <td className="px-6 py-5">
                    <p className="text-sm font-bold text-slate-800">{t.description}</p>
                    <p className="text-[10px] font-black uppercase tracking-wider text-purple-600">
                      {costCenters.find(cc => cc.id === t.costCenterId)?.name || 'Geral'}
                    </p>
                  </td>
                  <td className="px-6 py-5">
                     <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight bg-slate-100 px-2 py-0.5 rounded-md">
                       {t.category}
                     </span>
                  </td>
                  <td className={`px-6 py-5 text-right font-black text-sm ${t.type === TransactionType.SALE ? 'text-green-600' : 'text-rose-600'}`}>
                    {t.type === TransactionType.SALE ? '+' : '-'} R$ {t.paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex justify-center">
                      <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase border ${t.status === TransactionStatus.CONFIRMADO ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                        {t.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => setEditingTransaction(t)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Pencil size={16} /></button>
                      <button onClick={() => onDeleteTransaction(t.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl p-10 animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-black mb-6 text-slate-800 tracking-tight">
              {editingTransaction ? 'Editar Lançamento' : 'Novo Lançamento Financeiro'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
               <div className="grid grid-cols-2 gap-4 p-1.5 bg-slate-100 rounded-2xl mb-4">
                <button type="button" onClick={() => handleTypeChange(TransactionType.SALE)} className={`py-3 rounded-xl font-black text-xs transition-all ${formData.type === TransactionType.SALE ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500'}`}>ENTRADA</button>
                <button type="button" onClick={() => handleTypeChange(TransactionType.EXPENSE)} className={`py-3 rounded-xl font-black text-xs transition-all ${formData.type === TransactionType.EXPENSE ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>SAÍDA</button>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição</label>
                    <input required type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-bold text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
                    <select required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 font-bold text-sm">
                       {filteredCategories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                       <option value="Outros">Outros</option>
                    </select>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor Total (R$)</label>
                    <input required type="number" step="0.01" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</label>
                    <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm">
                      <option value={TransactionStatus.CONFIRMADO}>Confirmado</option>
                      <option value={TransactionStatus.PENDENTE}>Pendente</option>
                      <option value={TransactionStatus.PARCIAL}>Parcial</option>
                    </select>
                  </div>
               </div>

               <div className="flex gap-4 pt-4">
                  <button type="button" onClick={handleCloseModal} className="flex-1 py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest border border-slate-100 rounded-2xl">Cancelar</button>
                  <button type="submit" className={`flex-[2] py-4 rounded-2xl font-black text-white shadow-xl ${formData.type === TransactionType.SALE ? 'bg-green-600' : 'bg-slate-900'}`}>Salvar Lançamento</button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transactions;
