
import React, { useState } from 'react';
import { FinancialAccount, Transaction, TransactionStatus, TransactionType, AccountType } from '../types';
import { 
  CreditCard, Settings, Wallet, TrendingUp, TrendingDown, 
  Info, X, Lock, ShieldAlert, CheckCircle2, Building, Scale, AlertTriangle 
} from 'lucide-react';

interface AccountsProps {
  accounts: FinancialAccount[];
  transactions: Transaction[];
  onUpdateAccount: (updatedAccount: FinancialAccount) => void;
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'companyId'>) => void;
}

const FinancialAccounts: React.FC<AccountsProps> = ({ accounts, transactions, onUpdateAccount, onAddTransaction }) => {
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [reconcilingAccount, setReconcilingAccount] = useState<FinancialAccount | null>(null);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [password, setPassword] = useState('');
  const [tempFormData, setTempFormData] = useState<FinancialAccount | null>(null);
  const [realBalance, setRealBalance] = useState('');
  const [error, setError] = useState('');

  const calculateBalances = (account: FinancialAccount) => {
    const accTransactions = transactions.filter(t => 
      t.accountId === account.id && 
      (t.status === TransactionStatus.CONFIRMADO || t.status === TransactionStatus.PAGO)
    );

    const totalIn = accTransactions
      .filter(t => t.type === TransactionType.SALE)
      .reduce((sum, t) => sum + t.paidAmount, 0);

    const totalOut = accTransactions
      .filter(t => t.type !== TransactionType.SALE)
      .reduce((sum, t) => sum + t.paidAmount, 0);

    const currentBalance = account.initialBalance + totalIn - totalOut;

    const pendingIn = transactions
      .filter(t => t.accountId === account.id && t.status === TransactionStatus.PENDENTE && t.type === TransactionType.SALE)
      .reduce((sum, t) => sum + t.amount, 0);

    const pendingOut = transactions
      .filter(t => t.accountId === account.id && t.status === TransactionStatus.PENDENTE && t.type !== TransactionType.SALE)
      .reduce((sum, t) => sum + t.amount, 0);

    return { currentBalance, totalIn, totalOut, projected: currentBalance + pendingIn - pendingOut };
  };

  const handleEditClick = (account: FinancialAccount) => {
    setEditingAccount(account);
    setTempFormData({ ...account });
  };

  const handleReconcileClick = (account: FinancialAccount) => {
    setReconcilingAccount(account);
    setRealBalance('');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempFormData || !editingAccount) return;

    if (tempFormData.initialBalance !== editingAccount.initialBalance) {
      setShowPasswordPrompt(true);
    } else {
      onUpdateAccount(tempFormData);
      setEditingAccount(null);
    }
  };

  const handleConfirmReconciliation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcilingAccount || realBalance === '') return;

    const { currentBalance } = calculateBalances(reconcilingAccount);
    const diff = parseFloat(realBalance) - currentBalance;

    if (Math.abs(diff) > 0.01) {
      onAddTransaction({
        accountId: reconcilingAccount.id,
        date: new Date().toISOString().split('T')[0],
        type: diff > 0 ? TransactionType.SALE : TransactionType.EXPENSE,
        status: TransactionStatus.CONFIRMADO,
        description: `Ajuste de Conciliação (Caixa Real)`,
        category: 'Ajuste de Saldo',
        amount: Math.abs(diff),
        paidAmount: Math.abs(diff)
      });
      alert(`Ajuste de R$ ${Math.abs(diff).toFixed(2)} lançado com sucesso!`);
    } else {
      alert('Saldos já estão reconciliados!');
    }
    
    setReconcilingAccount(null);
  };

  const confirmBalanceChange = () => {
    if (password === 'admin123') {
      if (tempFormData) {
        onUpdateAccount(tempFormData);
        setEditingAccount(null);
        setShowPasswordPrompt(false);
        setPassword('');
        setError('');
      }
    } else {
      setError('Senha de supervisor incorreta.');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Caixa da Empresa</h2>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-widest text-[10px]">Gestão de Contas e Saldos • Unidades Ativas</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {accounts.map(acc => {
          const { currentBalance, totalIn, totalOut, projected } = calculateBalances(acc);
          return (
            <div key={acc.id} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-xl transition-all">
              <div className="flex justify-between items-start mb-8">
                <div className={`p-4 rounded-2xl group-hover:rotate-6 transition-all ${acc.type === AccountType.BANCO ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                  {acc.type === AccountType.BANCO ? <Building size={24} /> : <Wallet size={24} />}
                </div>
                <div className="flex flex-col items-end">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo do Sistema</span>
                   <p className={`text-2xl font-black ${currentBalance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                     R$ {currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                   </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-1">{acc.name}</h4>
                    <p className="text-[9px] font-bold text-slate-500 uppercase px-2 py-0.5 bg-slate-50 rounded-md inline-block">{acc.type}</p>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => handleReconcileClick(acc)}
                      className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                      title="Conciliar com Caixa Real"
                    >
                      <Scale size={18} />
                    </button>
                    <button 
                      onClick={() => handleEditClick(acc)}
                      className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all"
                      title="Configurações da Conta"
                    >
                      <Settings size={18} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-50">
                   <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1"><TrendingUp size={10} className="text-emerald-500"/> Entradas</p>
                      <p className="text-xs font-bold text-emerald-600">R$ {totalIn.toLocaleString('pt-BR')}</p>
                   </div>
                   <div className="space-y-1 text-right">
                      <p className="text-[9px] font-black text-slate-400 uppercase flex items-center justify-end gap-1"><TrendingDown size={10} className="text-rose-500"/> Saídas</p>
                      <p className="text-xs font-bold text-rose-600">R$ {totalOut.toLocaleString('pt-BR')}</p>
                   </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Reconciliação / Caixa Real */}
      {reconcilingAccount && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3.5rem] p-10 shadow-2xl space-y-8 animate-in zoom-in-95 duration-200">
            <div className="text-center space-y-4">
               <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                  <Scale size={36} />
               </div>
               <div>
                  <h3 className="text-2xl font-black text-slate-800 tracking-tight">Conciliação de Caixa Real</h3>
                  <p className="text-sm text-slate-500 font-medium px-4">Compare o saldo do sistema com o valor físico em mãos ou no extrato bancário.</p>
               </div>
            </div>

            <form onSubmit={handleConfirmReconciliation} className="space-y-6">
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex justify-between items-center">
                 <span className="text-[10px] font-black text-slate-400 uppercase">Saldo em Sistema</span>
                 <span className="text-lg font-black text-slate-900">R$ {calculateBalances(reconcilingAccount).currentBalance.toLocaleString('pt-BR')}</span>
              </div>

              <div className="space-y-2">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    Valor no Caixa Real / Extrato
                 </label>
                 <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 font-bold">R$</span>
                    <input 
                      required 
                      autoFocus
                      type="number" 
                      step="0.01" 
                      value={realBalance} 
                      onChange={e => setRealBalance(e.target.value)}
                      className="w-full p-6 pl-14 bg-white border-2 border-slate-100 rounded-3xl focus:border-emerald-500 outline-none text-2xl font-black"
                      placeholder="0,00"
                    />
                 </div>
              </div>

              <div className="flex gap-3">
                 <button 
                    type="button"
                    onClick={() => setReconcilingAccount(null)}
                    className="flex-1 py-4 text-xs font-black uppercase text-slate-400 border border-slate-200 rounded-2xl hover:bg-slate-50"
                 >
                    Fechar
                 </button>
                 <button 
                    type="submit"
                    className="flex-[2] py-4 bg-emerald-600 text-white text-xs font-black uppercase rounded-2xl shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all"
                 >
                    Confirmar e Ajustar
                 </button>
              </div>
            </form>

            <div className="flex gap-3 p-4 bg-amber-50 rounded-2xl">
               <AlertTriangle size={20} className="text-amber-500 shrink-0" />
               <p className="text-[10px] text-amber-700 font-bold uppercase leading-relaxed tracking-tighter">Se houver diferença, o sistema criará automaticamente um lançamento de ajuste para equalizar os saldos.</p>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição (Já existente, mantido) */}
      {editingAccount && tempFormData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-600 text-white rounded-2xl shadow-lg">
                  <Settings size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">Configurações da Conta</h3>
                  <p className="text-xs text-slate-500 font-medium tracking-tight">ID: {editingAccount.id}</p>
                </div>
              </div>
              <button onClick={() => setEditingAccount(null)} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome da Conta</label>
                  <input required type="text" value={tempFormData.name} onChange={e => setTempFormData({...tempFormData, name: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-bold text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Conta</label>
                  <select value={tempFormData.type} onChange={e => setTempFormData({...tempFormData, type: e.target.value as AccountType})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-bold text-sm appearance-none">
                    <option value={AccountType.BANCO}>Instituição Bancária</option>
                    <option value={AccountType.CAIXA}>Caixa Interno (Físico)</option>
                    <option value={AccountType.CARTEIRA_DIGITAL}>Carteira Digital / Pix</option>
                  </select>
                </div>
              </div>

              <div className="p-6 bg-amber-50 rounded-[2rem] border border-amber-100 space-y-4">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="text-amber-600 shrink-0" size={20} />
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Controle de Integridade Financeira</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Saldo Inicial Definido</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">R$</span>
                    <input required type="number" step="0.01" value={tempFormData.initialBalance} onChange={e => setTempFormData({...tempFormData, initialBalance: parseFloat(e.target.value)})} className="w-full p-4 pl-12 bg-white border border-slate-200 rounded-2xl focus:border-amber-500 outline-none font-black text-lg" />
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setEditingAccount(null)} className="flex-1 py-4 rounded-2xl font-black text-sm uppercase tracking-widest text-slate-400 border border-slate-200 hover:bg-slate-50 transition-all">Cancelar</button>
                <button type="submit" className="flex-[2] py-4 bg-purple-600 rounded-2xl font-black text-sm uppercase tracking-widest text-white shadow-xl shadow-purple-100 hover:bg-purple-700 transition-all">Salvar Alterações</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Prompt de Senha (Já existente) */}
      {showPasswordPrompt && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[150] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl text-center space-y-6 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
              <Lock size={32} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800">Acesso Restrito</h3>
              <p className="text-xs font-medium text-slate-500 mt-2">Senha de supervisor necessária (Dica: admin123)</p>
            </div>
            <input 
              autoFocus
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:border-rose-500 outline-none font-bold"
              placeholder="••••••••"
            />
            {error && <p className="text-[10px] font-bold text-rose-600">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setShowPasswordPrompt(false)} className="flex-1 py-3 text-xs font-black uppercase text-slate-400 border border-slate-200 rounded-xl">Voltar</button>
              <button onClick={confirmBalanceChange} className="flex-1 py-3 bg-rose-600 text-white text-xs font-black uppercase rounded-xl">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialAccounts;
