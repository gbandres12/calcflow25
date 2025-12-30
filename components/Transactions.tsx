
import React, { useState, useRef, useEffect } from 'react';
import { Transaction, TransactionType, TransactionStatus, FinancialAccount, CostCenter } from '../types';
import { 
  Plus, Search, Filter, Download, 
  TrendingUp, TrendingDown, 
  Calendar, CreditCard, Tag, 
  X, CheckCircle2, Clock, AlertCircle, FileUp, Database, Loader2, AlignLeft, Zap, Pencil, Trash2
} from 'lucide-react';

interface TransactionsProps {
  transactions: Transaction[];
  accounts: FinancialAccount[];
  costCenters: CostCenter[];
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'companyId'>) => void;
  onUpdateTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}

const Transactions: React.FC<TransactionsProps> = ({ 
  transactions, 
  accounts, 
  costCenters, 
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
    date: new Date().toISOString().split('T')[0],
    type: TransactionType.EXPENSE,
    accountId: accounts[0]?.id || '',
    costCenterId: costCenters[0]?.id || '',
    category: 'Geral',
    status: TransactionStatus.CONFIRMADO,
    notes: ''
  });

  useEffect(() => {
    if (editingTransaction) {
      setFormData({
        description: editingTransaction.description,
        amount: editingTransaction.amount.toString(),
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
    
    if (editingTransaction) {
      onUpdateTransaction({
        ...editingTransaction,
        ...formData,
        amount: amountNum,
        paidAmount: (formData.status === TransactionStatus.CONFIRMADO || formData.status === TransactionStatus.PAGO) ? amountNum : 0
      });
    } else {
      onAddTransaction({
        ...formData,
        type: formData.type as TransactionType,
        amount: amountNum,
        paidAmount: (formData.status === TransactionStatus.CONFIRMADO || formData.status === TransactionStatus.PAGO) ? amountNum : 0
      });
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
      description: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      type: TransactionType.EXPENSE,
      accountId: accounts[0]?.id || '',
      costCenterId: costCenters[0]?.id || '',
      category: 'Geral',
      status: TransactionStatus.CONFIRMADO,
      notes: ''
    });
  };

  const handleQuickExpense = () => {
    setEditingTransaction(null);
    setFormData({
      ...formData,
      description: 'Saída Rápida',
      amount: '',
      type: TransactionType.EXPENSE,
      status: TransactionStatus.CONFIRMADO,
      notes: 'Lançamento registrado via ação rápida.'
    });
    setIsModalOpen(true);
  };

  const handleSimulateImport = () => {
    setIsImporting(true);
    setTimeout(() => {
      const mockImports = [
        { description: 'Venda Diversos (Importado)', amount: 1500, type: TransactionType.SALE, category: 'Vendas', status: TransactionStatus.CONFIRMADO },
        { description: 'Energia Elétrica (Importado)', amount: 450.20, type: TransactionType.EXPENSE, category: 'Utilidades', status: TransactionStatus.CONFIRMADO },
      ];

      mockImports.forEach(item => {
        onAddTransaction({
          description: item.description,
          amount: item.amount,
          date: new Date().toISOString().split('T')[0],
          type: item.type,
          accountId: formData.accountId,
          costCenterId: formData.costCenterId,
          category: item.category,
          status: item.status,
          paidAmount: item.amount,
          notes: 'Importado via extrato bancário'
        });
      });

      setIsImporting(false);
      setIsImportModalOpen(false);
      alert(`${mockImports.length} lançamentos importados com sucesso!`);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Área de Lançamentos</h2>
          <p className="text-slate-500 text-sm font-medium">Gestão completa de receitas e despesas operacionais</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleQuickExpense} className="bg-slate-800 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-900 transition-all text-sm shadow-lg shadow-slate-100">
            <Zap size={18} className="text-amber-400" /> Saída Rápida
          </button>
          <button onClick={() => setIsImportModalOpen(true)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all text-sm">
            <FileUp size={18} /> Importar Extrato
          </button>
          <button onClick={() => { setEditingTransaction(null); resetForm(); setIsModalOpen(true); }} className="bg-purple-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-purple-700 transition-all flex items-center gap-2 shadow-lg shadow-purple-200 text-sm">
            <Plus size={18} /> Novo Lançamento
          </button>
        </div>
      </header>

      {/* Tabela de Lançamentos */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row gap-4 items-center bg-slate-50/30">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Pesquisar por descrição, categoria ou valor..." 
              className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:border-purple-500 transition-all font-medium text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-8 py-4">Data</th>
                <th className="px-6 py-4">Descrição / C. Custo</th>
                <th className="px-6 py-4">Conta</th>
                <th className="px-6 py-4 text-right">Valor</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-8 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center text-slate-400 text-sm italic font-medium">Nenhum lançamento encontrado.</td>
                </tr>
              ) : (
                transactions.slice().reverse().map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-5 text-xs font-bold text-slate-500">{t.date}</td>
                    <td className="px-6 py-5">
                      <p className="text-sm font-bold text-slate-800">{t.description}</p>
                      <p className="text-[10px] font-black uppercase tracking-wider text-purple-600">
                        {costCenters.find(cc => cc.id === t.costCenterId)?.name || 'Sem Centro de Custo'}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-xs font-bold text-slate-500">
                      {accounts.find(a => a.id === t.accountId)?.name}
                    </td>
                    <td className={`px-6 py-5 text-right font-black text-sm ${t.type === TransactionType.SALE ? 'text-green-600' : 'text-slate-800'}`}>
                      {t.type === TransactionType.SALE ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex justify-center">
                        <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase border ${
                          t.status === TransactionStatus.CONFIRMADO || t.status === TransactionStatus.PAGO 
                          ? 'bg-green-50 text-green-700 border-green-200' 
                          : 'bg-amber-100 text-amber-700 border-amber-200'
                        }`}>
                          {t.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex justify-center gap-1">
                        <button 
                          onClick={() => setEditingTransaction(t)} 
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" 
                          title="Editar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button 
                          onClick={() => { if(confirm('Excluir este lançamento?')) onDeleteTransaction(t.id); }} 
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all" 
                          title="Excluir"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Lançamento */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden p-10 animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-black mb-6 text-slate-800 tracking-tight">
              {editingTransaction ? 'Editar Lançamento' : 'Novo Lançamento Financeiro'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar pr-2">
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><AlignLeft size={12} /> Descrição</label>
                    <input required type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-bold text-sm" placeholder="Ex: Energia, Aluguel..." />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Centro de Custo</label>
                    <select required value={formData.costCenterId} onChange={e => setFormData({...formData, costCenterId: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-bold text-sm">
                       {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                    </select>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor (R$)</label>
                    <input required type="number" step="0.01" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-black text-xl text-slate-800" placeholder="0,00" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</label>
                    <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-bold text-sm" />
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Conta Impactada</label>
                    <select required value={formData.accountId} onChange={e => setFormData({...formData, accountId: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-bold text-sm">
                      {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status Inicial</label>
                    <select required value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as TransactionStatus})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-bold text-sm">
                      <option value={TransactionStatus.CONFIRMADO}>Confirmado</option>
                      <option value={TransactionStatus.PAGO}>Pago / Recebido</option>
                      <option value={TransactionStatus.PENDENTE}>Pendente (Previsão)</option>
                    </select>
                  </div>
               </div>

               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observações Adicionais</label>
                  <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-medium text-sm min-h-[100px] resize-none" placeholder="Detalhes específicos..." />
               </div>

               <div className="grid grid-cols-2 gap-4 p-1.5 bg-slate-100 rounded-2xl mt-4">
                <button type="button" onClick={() => setFormData({...formData, type: TransactionType.SALE})} className={`py-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 ${formData.type === TransactionType.SALE ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500'}`}>RECEITA (+)</button>
                <button type="button" onClick={() => setFormData({...formData, type: TransactionType.EXPENSE})} className={`py-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 ${formData.type === TransactionType.EXPENSE ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>DESPESA (-)</button>
               </div>

               <button type="submit" className={`w-full py-5 rounded-2xl font-black text-white shadow-xl transition-all hover:scale-[1.01] ${formData.type === TransactionType.SALE ? 'bg-green-600 shadow-green-100' : 'bg-slate-900 shadow-slate-100'}`}>
                {editingTransaction ? 'Salvar Alterações' : 'Efetivar Lançamento'}
              </button>
            </form>
            <button onClick={handleCloseModal} className="w-full mt-4 text-slate-400 font-bold uppercase text-[10px] tracking-widest hover:text-slate-600">Cancelar e Sair</button>
          </div>
        </div>
      )}

      {/* Modal Importação */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] p-10 shadow-2xl space-y-8 animate-in zoom-in-95">
            <div className="text-center space-y-4">
               <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner"><FileUp size={36} /></div>
               <h3 className="text-2xl font-black text-slate-800 tracking-tight">Importar Extrato</h3>
               <p className="text-sm text-slate-500 font-medium px-8">Processe lançamentos em lote a partir de arquivos CSV ou Excel.</p>
            </div>
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-[2.5rem] p-12 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer group">
              <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.xls,.xlsx" />
              <Database size={32} className="mx-auto text-slate-300 group-hover:text-blue-400 mb-4" />
              <p className="text-sm font-black text-slate-700">Selecione seu arquivo</p>
            </div>
            <div className="flex gap-4">
               <button onClick={() => setIsImportModalOpen(false)} className="flex-1 py-4 text-xs font-black uppercase text-slate-400 border rounded-2xl">Cancelar</button>
               <button onClick={handleSimulateImport} disabled={isImporting} className="flex-[2] py-4 bg-blue-600 text-white text-xs font-black uppercase rounded-2xl shadow-xl flex items-center justify-center gap-2">
                  {isImporting ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />}
                  {isImporting ? 'Processando...' : 'Iniciar Importação'}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transactions;
