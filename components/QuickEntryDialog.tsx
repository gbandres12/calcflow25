import React, { useState } from 'react';
import { 
  X, Zap, DollarSign, Calendar, CreditCard, Tag, Landmark, 
  User, Sparkles, CheckCircle2, AlertCircle, ArrowUpRight, ArrowDownLeft
} from 'lucide-react';
import { 
  Transaction, 
  TransactionType, 
  TransactionStatus, 
  FinancialAccount, 
  CostCenter, 
  Category, 
  Customer,
  TransactionPayment 
} from '../types';
import { CategorySuggestion } from './CategorySuggestion';
import { CostCenterSuggestion } from './CostCenterSuggestion';
import { INFLOW_CATEGORIES, OUTFLOW_CATEGORIES } from '../constants';

interface QuickEntryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: FinancialAccount[];
  costCenters: CostCenter[];
  categories: Category[];
  customers: Customer[];
  historyTransactions?: Transaction[];
  onSave: (tx: Omit<Transaction, 'id' | 'companyId'>) => Promise<void> | void;
}

export const QuickEntryDialog: React.FC<QuickEntryDialogProps> = ({
  isOpen,
  onClose,
  accounts,
  costCenters,
  categories,
  customers,
  historyTransactions = [],
  onSave
}) => {
  const [type, setType] = useState<TransactionType>(TransactionType.EXPENSE);
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [costCenterId, setCostCenterId] = useState(costCenters[0]?.id || '');
  const [costCenterCustom, setCostCenterCustom] = useState('');
  const [category, setCategory] = useState(OUTFLOW_CATEGORIES[0]);
  const [customerId, setCustomerId] = useState('');
  const [contactName, setContactName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const officialCategories = type === TransactionType.SALE 
    ? (categories.filter(c => c.type === 'INFLOW').map(c => c.name).length ? categories.filter(c => c.type === 'INFLOW').map(c => c.name) : INFLOW_CATEGORIES)
    : (categories.filter(c => c.type === 'OUTFLOW').map(c => c.name).length ? categories.filter(c => c.type === 'OUTFLOW').map(c => c.name) : OUTFLOW_CATEGORIES);

  const numAmount = parseFloat(amountStr) || 0;
  const isZeroValue = numAmount === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setSaving(true);
    try {
      const isPaid = numAmount > 0;
      const initialStatus = isPaid ? TransactionStatus.PAGO : TransactionStatus.PENDENTE;
      
      const newPayments: TransactionPayment[] = isPaid ? [{
        id: `pmt-${Date.now()}`,
        transactionId: '',
        amount: numAmount,
        paymentDate: date,
        accountId: accountId,
        paymentMethod: paymentMethod,
        notes: `Lançamento rápido inicial em ${new Date().toLocaleDateString('pt-BR')}`,
        isDiscountOrDeduction: false,
        createdAt: new Date().toISOString()
      }] : [];

      const selectedCustomer = customers.find(c => c.id === customerId);
      const finalContactName = contactName || selectedCustomer?.name || '';

      await onSave({
        type,
        description: description.trim(),
        amount: numAmount,
        originalAmount: numAmount,
        discount: 0,
        discountValue: 0,
        discountType: 'fixed',
        paidAmount: isPaid ? numAmount : 0,
        status: initialStatus,
        date: date,
        dueDate: date,
        paymentDate: isPaid ? date : undefined,
        accountId: accountId,
        costCenterId: costCenterId,
        costCenter: costCenterCustom || costCenters.find(c => c.id === costCenterId)?.name || '',
        category: category,
        customerId: customerId || undefined,
        contactId: customerId || undefined,
        contactName: finalContactName || undefined,
        paymentMethod: paymentMethod,
        notes: isZeroValue 
          ? `[Lançamento Rápido R$ 0,00] Criado como pendente para abatimento futuro. ${notes}` 
          : notes,
        payments: newPayments
      });

      onClose();
    } catch (err) {
      console.error("Erro ao salvar lançamento rápido:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[130] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-[3rem] p-8 md:p-10 shadow-2xl animate-in zoom-in-95 overflow-y-auto max-h-[92vh] custom-scrollbar border border-slate-100">
        
        {/* Cabeçalho */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
              <Zap size={24} className="fill-amber-500 text-amber-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">Lançamento Rápido</h3>
                <span className="bg-amber-100 text-amber-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                  1-Click Express
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Crie entradas ou saídas instantâneas (Aceita R$ 0 para abatimento futuro)
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Seletor de Tipo (Receita vs Despesa) */}
          <div className="grid grid-cols-2 gap-3 p-1.5 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setType(TransactionType.SALE);
                setCategory(INFLOW_CATEGORIES[0]);
              }}
              className={`py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                type === TransactionType.SALE
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100 scale-100'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ArrowUpRight size={16} /> 📥 Entrada / Receita
            </button>
            <button
              type="button"
              onClick={() => {
                setType(TransactionType.EXPENSE);
                setCategory(OUTFLOW_CATEGORIES[0]);
              }}
              className={`py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                type === TransactionType.EXPENSE
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-100 scale-100'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ArrowDownLeft size={16} /> 📤 Saída / Despesa
            </button>
          </div>

          {/* Descrição com IA */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
              Descrição do Lançamento *
            </label>
            <input
              required
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === TransactionType.SALE ? "Ex: Adiantamento Fazenda Santa Rita ou Venda Calcário" : "Ex: Troca de correia moinho #02 ou Diesel S10"}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-amber-500 focus:bg-white font-bold text-sm transition-all"
            />
          </div>

          {/* Valor (R$) e Regra de R$ 0,00 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Valor R$ (Líquido) *
                </label>
                {isZeroValue && (
                  <span className="text-[9px] font-black text-amber-600 uppercase bg-amber-50 px-1.5 py-0.5 rounded-md">
                    🟡 Pendente p/ Abatimento
                  </span>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-amber-500 focus:bg-white font-black text-base transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Data do Lançamento
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-amber-500 font-bold text-sm"
              />
            </div>
          </div>

          {/* Banner Informativo de Lançamento com Valor 0 */}
          {isZeroValue && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
              <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-black">Regra de Abatimento Futuro (Valor R$ 0,00)</strong>
                Este lançamento será criado como <span className="font-bold underline">PENDENTE</span> para ser abatido ou quitado gradualmente no módulo de Receber/Pagar.
              </div>
            </div>
          )}

          {/* Categoria com Assistente de IA */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Categoria Oficial *
              </label>
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-amber-500"
            >
              {officialCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            
            <CategorySuggestion
              type={type}
              description={description}
              notes={notes}
              currentCategory={category}
              officialCategories={officialCategories}
              history={historyTransactions.map(t => ({ description: t.description, category: t.category }))}
              onSelectCategory={(suggestedCat) => setCategory(suggestedCat)}
            />
          </div>

          {/* Centro de Custo com Assistente de IA */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
              Centro de Custo (Sugerido por IA ou Selecionável)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={costCenterId}
                onChange={(e) => {
                  setCostCenterId(e.target.value);
                  setCostCenterCustom('');
                }}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-amber-500"
              >
                {costCenters.map(cc => (
                  <option key={cc.id} value={cc.id}>{cc.name}</option>
                ))}
              </select>
              <input
                type="text"
                value={costCenterCustom}
                onChange={(e) => setCostCenterCustom(e.target.value)}
                placeholder="Ou digite centro livre..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-amber-500"
              />
            </div>
            
            <CostCenterSuggestion
              description={description}
              category={category}
              notes={notes}
              currentCostCenterId={costCenterId}
              currentCostCenterName={costCenterCustom}
              existingCostCenters={costCenters}
              history={historyTransactions.map(t => ({ description: t.description, costCenter: t.costCenter || '' }))}
              onSelectCostCenter={(res) => {
                if (res.id) {
                  setCostCenterId(res.id);
                  setCostCenterCustom('');
                } else {
                  setCostCenterCustom(res.name);
                }
              }}
            />
          </div>

          {/* Conta Financeira & Forma de Pagamento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Conta Financeira Afetada *
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-amber-500"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({acc.bankName || acc.type})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Meio de Pagamento
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-amber-500"
              >
                <option value="PIX">PIX Instantâneo</option>
                <option value="Transferência Bancária (TED)">TED / Transferência</option>
                <option value="Boleto Bancário">Boleto Bancário</option>
                <option value="Dinheiro Físico (Caixa)">Dinheiro Físico</option>
                <option value="Cartão de Débito">Cartão de Débito</option>
                <option value="Cartão de Crédito">Cartão de Crédito</option>
                <option value="Cheque / Permuta">Cheque / Permuta</option>
              </select>
            </div>
          </div>

          {/* Cliente ou Fornecedor Vinculado */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
              Contato Vinculado (Cliente ou Fornecedor)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  const cust = customers.find(c => c.id === e.target.value);
                  if (cust) setContactName(cust.name);
                }}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-amber-500"
              >
                <option value="">Selecione Cliente cadastrado...</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Ou nome livre do contato/fornecedor"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
              Observações Adicionais
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Ref. NF-e 4021 ou Adiantamento pátio"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-medium text-xs outline-none focus:border-amber-500"
            />
          </div>

          {/* Botão de Salvar */}
          <div className="pt-3">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-amber-200 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              <Zap size={18} className="fill-slate-950" />
              {saving ? 'Processando Lançamento...' : (isZeroValue ? 'Salvar como Pendente (R$ 0,00)' : 'Lançar e Quitar Imediatamente')}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
