import React, { useState, useEffect } from 'react';
import { 
  X, CheckCircle2, DollarSign, Calendar, CreditCard, Tag, 
  Landmark, User, Percent, Sparkles, AlertCircle, ArrowUpRight, ArrowDownLeft, Receipt
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

interface TransactionFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: TransactionType;
  editingTransaction: Transaction | null;
  accounts: FinancialAccount[];
  costCenters: CostCenter[];
  categories: Category[];
  customers: Customer[];
  historyTransactions?: Transaction[];
  onSave: (tx: Transaction | Omit<Transaction, 'id' | 'companyId'>) => Promise<void> | void;
}

export const TransactionFormDialog: React.FC<TransactionFormDialogProps> = ({
  isOpen,
  onClose,
  initialType = TransactionType.EXPENSE,
  editingTransaction,
  accounts,
  costCenters,
  categories,
  customers,
  historyTransactions = [],
  onSave
}) => {
  const [activeTab, setActiveTab] = useState<'dados' | 'condicoes' | 'historico'>('dados');
  
  const [type, setType] = useState<TransactionType>(initialType);
  const [description, setDescription] = useState('');
  
  // Valores e Desconto Dinâmico
  const [originalAmountStr, setOriginalAmountStr] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('fixed');
  const [discountValueStr, setDiscountValueStr] = useState('0');
  
  const [paidAmountStr, setPaidAmountStr] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentDate, setPaymentDate] = useState('');
  
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [costCenterId, setCostCenterId] = useState(costCenters[0]?.id || '');
  const [costCenterCustom, setCostCenterCustom] = useState('');
  const [category, setCategory] = useState(OUTFLOW_CATEGORIES[0]);
  const [status, setStatus] = useState<TransactionStatus>(TransactionStatus.PAGO);
  
  const [customerId, setCustomerId] = useState('');
  const [contactName, setContactName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [notes, setNotes] = useState('');
  const [generateReceipt, setGenerateReceipt] = useState(false);
  const [saving, setSaving] = useState(false);

  // Inicialização ao abrir ou editar
  useEffect(() => {
    if (editingTransaction) {
      setType(editingTransaction.type);
      setDescription(editingTransaction.description || '');
      
      const orig = editingTransaction.originalAmount !== undefined 
        ? editingTransaction.originalAmount 
        : editingTransaction.amount;
      setOriginalAmountStr(orig.toString());
      
      setDiscountType(editingTransaction.discountType || 'fixed');
      setDiscountValueStr((editingTransaction.discountValue || editingTransaction.discount || 0).toString());
      setPaidAmountStr((editingTransaction.paidAmount || 0).toString());
      
      setDate(editingTransaction.date || new Date().toISOString().split('T')[0]);
      setDueDate(editingTransaction.dueDate || editingTransaction.date || new Date().toISOString().split('T')[0]);
      setPaymentDate(editingTransaction.paymentDate || '');
      
      setAccountId(editingTransaction.accountId || accounts[0]?.id || '');
      setCostCenterId(editingTransaction.costCenterId || costCenters[0]?.id || '');
      setCostCenterCustom(editingTransaction.costCenter || '');
      setCategory(editingTransaction.category || (editingTransaction.type === TransactionType.SALE ? INFLOW_CATEGORIES[0] : OUTFLOW_CATEGORIES[0]));
      setStatus(editingTransaction.status || TransactionStatus.PAGO);
      
      setCustomerId(editingTransaction.customerId || editingTransaction.contactId || '');
      setContactName(editingTransaction.contactName || '');
      setPaymentMethod(editingTransaction.paymentMethod || 'PIX');
      setNotes(editingTransaction.notes || '');
      setGenerateReceipt(false);
    } else {
      setType(initialType);
      setDescription('');
      setOriginalAmountStr('');
      setDiscountType('fixed');
      setDiscountValueStr('0');
      setPaidAmountStr('');
      const todayStr = new Date().toISOString().split('T')[0];
      setDate(todayStr);
      setDueDate(todayStr);
      setPaymentDate(todayStr);
      setAccountId(accounts[0]?.id || '');
      setCostCenterId(costCenters[0]?.id || '');
      setCostCenterCustom('');
      const firstCat = initialType === TransactionType.SALE ? INFLOW_CATEGORIES[0] : OUTFLOW_CATEGORIES[0];
      setCategory(firstCat);
      setStatus(TransactionStatus.PAGO);
      setCustomerId('');
      setContactName('');
      setPaymentMethod('PIX');
      setNotes('');
      setGenerateReceipt(initialType === TransactionType.SALE);
    }
  }, [editingTransaction, initialType, isOpen]);

  // Cálculo Dinâmico de Desconto e Valor Líquido Final
  const originalAmountNum = parseFloat(originalAmountStr) || 0;
  const discountValNum = parseFloat(discountValueStr) || 0;

  const calculatedDiscount = discountType === 'percentage'
    ? (originalAmountNum * (discountValNum / 100))
    : discountValNum;

  const finalAmount = Math.max(0, originalAmountNum - calculatedDiscount);

  // Atualiza paidAmount quando status é alternado
  useEffect(() => {
    if (status === TransactionStatus.PAGO || status === TransactionStatus.CONFIRMADO) {
      setPaidAmountStr(finalAmount.toString());
      if (!paymentDate) setPaymentDate(date);
    } else if (status === TransactionStatus.PENDENTE || status === TransactionStatus.ATRASADO) {
      setPaidAmountStr('0');
      setPaymentDate('');
    }
  }, [status, finalAmount]);

  if (!isOpen) return null;

  const officialCategories = type === TransactionType.SALE 
    ? (categories.filter(c => c.type === 'INFLOW').map(c => c.name).length ? categories.filter(c => c.type === 'INFLOW').map(c => c.name) : INFLOW_CATEGORIES)
    : (categories.filter(c => c.type === 'OUTFLOW').map(c => c.name).length ? categories.filter(c => c.type === 'OUTFLOW').map(c => c.name) : OUTFLOW_CATEGORIES);

  const formatBRL = (val?: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setSaving(true);
    try {
      const paidNum = parseFloat(paidAmountStr) || 0;
      const isPaid = paidNum >= finalAmount - 0.01 && finalAmount > 0;
      const isPartial = paidNum > 0 && paidNum < finalAmount - 0.01;
      
      let finalStatus = status;
      if (isPaid) finalStatus = TransactionStatus.PAGO;
      else if (isPartial) finalStatus = TransactionStatus.PARCIAL;

      const selectedCustomer = customers.find(c => c.id === customerId);
      const finalContact = contactName || selectedCustomer?.name || '';

      const receiptId = generateReceipt && type === TransactionType.SALE 
        ? (editingTransaction?.receiptId || `REC-${Date.now()}`) 
        : editingTransaction?.receiptId;

      // Cria ou atualiza pagamentos
      let paymentsList: TransactionPayment[] = editingTransaction?.payments || [];
      if (paymentsList.length === 0 && paidNum > 0) {
        paymentsList = [{
          id: `pmt-${Date.now()}`,
          transactionId: editingTransaction?.id || '',
          amount: paidNum,
          paymentDate: paymentDate || date,
          accountId: accountId,
          paymentMethod: paymentMethod,
          notes: 'Pagamento inicial registrado no formulário',
          isDiscountOrDeduction: false,
          createdAt: new Date().toISOString()
        }];
      }

      const txPayload = {
        type,
        description: description.trim(),
        originalAmount: originalAmountNum,
        discount: calculatedDiscount,
        discountType,
        discountValue: discountValNum,
        amount: finalAmount, // Valor LÍQUIDO final
        paidAmount: paidNum,
        status: finalStatus,
        date,
        dueDate,
        paymentDate: paidNum > 0 ? (paymentDate || date) : undefined,
        accountId,
        costCenterId,
        costCenter: costCenterCustom || costCenters.find(c => c.id === costCenterId)?.name || '',
        category,
        customerId: customerId || undefined,
        contactId: customerId || undefined,
        contactName: finalContact || undefined,
        paymentMethod,
        notes,
        receiptId,
        payments: paymentsList
      };

      if (editingTransaction) {
        await onSave({
          ...editingTransaction,
          ...txPayload
        });
      } else {
        await onSave(txPayload);
      }

      onClose();
    } catch (err) {
      console.error("Erro ao salvar transação:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[130] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-[3rem] p-8 md:p-10 shadow-2xl animate-in zoom-in-95 overflow-y-auto max-h-[92vh] custom-scrollbar border border-slate-100">
        
        {/* Cabeçalho */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl ${type === TransactionType.SALE ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              {type === TransactionType.SALE ? <ArrowUpRight size={24} /> : <ArrowDownLeft size={24} />}
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                {editingTransaction ? 'Editar Lançamento' : (type === TransactionType.SALE ? 'Nova Entrada (Receita)' : 'Nova Saída (Despesa)')}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Formulário financeiro completo com descontos e IA
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

        {/* Abas do Formulário */}
        <div className="flex p-1 bg-slate-100 rounded-2xl mb-5">
          <button
            type="button"
            onClick={() => setActiveTab('dados')}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'dados' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Dados Principais & IA
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('condicoes')}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'condicoes' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Descontos & Pagamento
          </button>
          {editingTransaction?.payments && editingTransaction.payments.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('historico')}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
                activeTab === 'historico' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Baixas Realizadas ({editingTransaction.payments.length})
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {activeTab === 'dados' && (
            <>
              {/* Seletor Tipo */}
              <div className="grid grid-cols-2 gap-3 p-1.5 bg-slate-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setType(TransactionType.SALE);
                    setCategory(INFLOW_CATEGORIES[0]);
                  }}
                  className={`py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    type === TransactionType.SALE
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ArrowUpRight size={14} /> 📥 Entrada / Receita
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setType(TransactionType.EXPENSE);
                    setCategory(OUTFLOW_CATEGORIES[0]);
                  }}
                  className={`py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    type === TransactionType.EXPENSE
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ArrowDownLeft size={14} /> 📤 Saída / Despesa
                </button>
              </div>

              {/* Descrição */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  Descrição do Lançamento *
                </label>
                <input
                  required
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Venda de Calcário Moído Granel ou Manutenção Preventiva Moinho"
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-500 font-bold text-sm"
                />
              </div>

              {/* Valores: Original, Desconto e Líquido */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    Valor Bruto (R$) *
                  </label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={originalAmountStr}
                    onChange={(e) => setOriginalAmountStr(e.target.value)}
                    placeholder="0.00"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Desconto ({discountType === 'percentage' ? '%' : 'R$'})
                    </label>
                    <button
                      type="button"
                      onClick={() => setDiscountType(discountType === 'fixed' ? 'percentage' : 'fixed')}
                      className="text-[9px] font-black text-purple-600 uppercase underline"
                    >
                      Mudar p/ {discountType === 'fixed' ? '%' : 'R$'}
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={discountValueStr}
                    onChange={(e) => setDiscountValueStr(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    Valor Líquido Final
                  </label>
                  <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-2xl text-indigo-950 font-black text-sm">
                    {formatBRL(finalAmount)}
                  </div>
                </div>
              </div>

              {/* Categoria com IA */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  Categoria Oficial *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-indigo-500"
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
                  onSelectCategory={(cat) => setCategory(cat)}
                />
              </div>

              {/* Centro de Custo com IA */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  Centro de Custo
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={costCenterId}
                    onChange={(e) => {
                      setCostCenterId(e.target.value);
                      setCostCenterCustom('');
                    }}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-indigo-500"
                  >
                    {costCenters.map(cc => (
                      <option key={cc.id} value={cc.id}>{cc.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={costCenterCustom}
                    onChange={(e) => setCostCenterCustom(e.target.value)}
                    placeholder="Ou centro customizado..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-indigo-500"
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
            </>
          )}

          {activeTab === 'condicoes' && (
            <>
              {/* Status e Valor Pago */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    Status do Lançamento
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TransactionStatus)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-indigo-500"
                  >
                    <option value={TransactionStatus.PAGO}>✅ Pago / Liquidado</option>
                    <option value={TransactionStatus.PARCIAL}>🟡 Parcialmente Pago</option>
                    <option value={TransactionStatus.PENDENTE}>🟡 Pendente / A Vencer</option>
                    <option value={TransactionStatus.ATRASADO}>🔴 Atrasado</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    Valor Já Pago / Baixado (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paidAmountStr}
                    onChange={(e) => setPaidAmountStr(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Datas de Competência, Vencimento e Pagamento */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    Data Emissão
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    Data Vencimento
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    Data Efetiva Pagto
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none"
                  />
                </div>
              </div>

              {/* Conta Bancária e Meio */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    Conta Financeira *
                  </label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    Forma de Pagamento
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none"
                  >
                    <option value="PIX">PIX Instantâneo</option>
                    <option value="Transferência Bancária (TED)">TED / Transferência</option>
                    <option value="Boleto Bancário">Boleto Bancário</option>
                    <option value="Dinheiro Físico">Dinheiro Físico</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
              </div>

              {/* Contato Vinculado */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  Cliente / Fornecedor Vinculado
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={customerId}
                    onChange={(e) => {
                      setCustomerId(e.target.value);
                      const cust = customers.find(c => c.id === e.target.value);
                      if (cust) setContactName(cust.name);
                    }}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none"
                  >
                    <option value="">Selecione Cliente da base...</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Ou nome livre do fornecedor/contato"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none"
                  />
                </div>
              </div>

              {/* Observações */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  Observações / Histórico
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Informações adicionais do lançamento..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-medium text-xs outline-none"
                />
              </div>

              {/* Gerar Recibo Térmico/A4 */}
              {type === TransactionType.SALE && (
                <label className="flex items-center gap-2 text-xs font-black text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={generateReceipt}
                    onChange={(e) => setGenerateReceipt(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span>Emitir Recibo de Pagamento Oficial ao salvar</span>
                </label>
              )}
            </>
          )}

          {activeTab === 'historico' && editingTransaction?.payments && (
            <div className="space-y-3">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Histórico de Liquidações Realizadas
              </h4>
              <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase">
                    <tr>
                      <th className="p-3">Data</th>
                      <th className="p-3">Meio</th>
                      <th className="p-3">Notas</th>
                      <th className="p-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {editingTransaction.payments.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="p-3">{p.paymentDate}</td>
                        <td className="p-3">{p.paymentMethod}</td>
                        <td className="p-3 text-slate-500 italic">{p.notes || '-'}</td>
                        <td className="p-3 text-right font-black text-slate-900">{formatBRL(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-wider transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !description.trim()}
              className={`flex-1 py-3.5 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-xl active:scale-95 disabled:opacity-50 ${
                type === TransactionType.SALE
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                  : 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
              }`}
            >
              {saving ? 'Gravando...' : (editingTransaction ? 'Atualizar Lançamento' : 'Gravar Lançamento')}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
