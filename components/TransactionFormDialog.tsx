import React, { useState, useEffect } from 'react';
import { 
  X, CheckCircle2, DollarSign, Calendar, CreditCard, Tag, 
  Landmark, User, Percent, Sparkles, AlertCircle, ArrowUpRight, ArrowDownLeft, Receipt, Clock, Link2, Search, ShoppingCart, FileText
} from 'lucide-react';
import { 
  Transaction, 
  TransactionType, 
  TransactionStatus, 
  FinancialAccount, 
  CostCenter, 
  Category, 
  Customer,
  SaleOrder,
  TransactionPayment 
} from '../types';
import { CategorySuggestion } from './CategorySuggestion';
import { CostCenterSuggestion } from './CostCenterSuggestion';
import { INFLOW_CATEGORIES, OUTFLOW_CATEGORIES } from '../constants';
import { openOrdersForReceipt, openReceivables, orderOpenBalance, transactionOpenBalance, ReceiptInput } from '../services/receiptLink';
import { dateISOBR } from '../utils/dateFilterUtils';

export type ReceiptLink = { kind: 'order' | 'receivable'; id: string };

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
  companyName?: string;
  orders?: SaleOrder[];
  /** Recebimento ligado a uma venda ou conta a receber (em vez de um lançamento avulso). */
  onLinkedReceipt?: (link: ReceiptLink, input: ReceiptInput) => Promise<void> | void;
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
  companyName,
  orders = [],
  onLinkedReceipt,
  onSave
}) => {
  const [type, setType] = useState<TransactionType>(initialType);
  const [description, setDescription] = useState('');
  
  // Valores e Desconto Dinâmico
  const [originalAmountStr, setOriginalAmountStr] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('fixed');
  const [discountValueStr, setDiscountValueStr] = useState('0');
  
  const getLocalDateStr = (d: Date = new Date()): string => dateISOBR(d);

  const [paidAmountStr, setPaidAmountStr] = useState('');
  const [date, setDate] = useState(getLocalDateStr());
  const [dueDate, setDueDate] = useState(getLocalDateStr());
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
  const [link, setLink] = useState<ReceiptLink | null>(null);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkError, setLinkError] = useState('');

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
      
      setDate(editingTransaction.date || getLocalDateStr());
      setDueDate(editingTransaction.dueDate || editingTransaction.date || getLocalDateStr());
      setPaymentDate(editingTransaction.paymentDate || '');
      
      setAccountId(editingTransaction.accountId || accounts[0]?.id || '');
      setCostCenterId(editingTransaction.costCenterId || costCenters[0]?.id || '');
      setCostCenterCustom(editingTransaction.costCenter || '');
      setCategory(editingTransaction.category || (editingTransaction.type === TransactionType.SALE ? INFLOW_CATEGORIES[0] : OUTFLOW_CATEGORIES[0]));
      setStatus(editingTransaction.status);
      
      setCustomerId(editingTransaction.customerId || editingTransaction.contactId || '');
      setContactName(editingTransaction.contactName || '');
      setPaymentMethod(editingTransaction.paymentMethod || 'PIX');
      setNotes(editingTransaction.notes || '');
      setGenerateReceipt(Boolean(editingTransaction.receiptId));
    } else {
      setType(initialType);
      setDescription('');
      setOriginalAmountStr('');
      setDiscountType('fixed');
      setDiscountValueStr('0');
      setPaidAmountStr('');
      const todayStr = getLocalDateStr();
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

  useEffect(() => {
    if (!isOpen) { setLink(null); setShowLinkPicker(false); setLinkQuery(''); setLinkError(''); }
  }, [isOpen]);

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

  // O vínculo só vale para entrada já recebida (é o que vira baixa/recibo).
  useEffect(() => {
    if (link && (type !== TransactionType.SALE || !(status === TransactionStatus.PAGO || status === TransactionStatus.CONFIRMADO))) {
      setLink(null);
    }
  }, [type, status]);

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
      if (link && onLinkedReceipt) {
        const amount = parseFloat(paidAmountStr) || 0;
        const open = linkedOpenBalance;
        if (amount <= 0) { setLinkError('Informe o valor recebido.'); return; }
        if (amount > open + 0.01) { setLinkError(`O valor é maior que o saldo em aberto de ${formatBRL(open)}.`); return; }
        setLinkError('');
        await onLinkedReceipt(link, {
          amount,
          date: paymentDate || date,
          paymentMethod,
          accountId,
          accountName: accounts.find(a => a.id === accountId)?.name,
          notes
        });
        onClose();
        return;
      }

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

  const isIncome = type === TransactionType.SALE;
  const canLink = Boolean(onLinkedReceipt) && !editingTransaction && isIncome &&
    (status === TransactionStatus.PAGO || status === TransactionStatus.CONFIRMADO);
  const linkedOrder = link?.kind === 'order' ? orders.find(o => o.id === link.id) : undefined;
  const linkedTx = link?.kind === 'receivable' ? historyTransactions.find(t => t.id === link.id) : undefined;
  const linkedOpenBalance = linkedOrder ? orderOpenBalance(linkedOrder) : linkedTx ? transactionOpenBalance(linkedTx) : 0;
  const customerName = (id?: string) => customers.find(c => c.id === id)?.name || 'Cliente';

  const pickOrder = (o: SaleOrder) => {
    const open = orderOpenBalance(o);
    setLink({ kind: 'order', id: o.id });
    setCustomerId(o.customerId || '');
    setContactName(customerName(o.customerId));
    setDescription(`Recebimento ${o.reference} - ${customerName(o.customerId)}`);
    setOriginalAmountStr(open.toFixed(2));
    setDiscountValueStr('0');
    setShowLinkPicker(false); setLinkQuery(''); setLinkError('');
  };
  const pickReceivable = (t: Transaction) => {
    const open = transactionOpenBalance(t);
    setLink({ kind: 'receivable', id: t.id });
    setCustomerId(t.customerId || t.contactId || '');
    setContactName(t.contactName || '');
    setDescription(t.description);
    setOriginalAmountStr(open.toFixed(2));
    setDiscountValueStr('0');
    setShowLinkPicker(false); setLinkQuery(''); setLinkError('');
  };

  const q = linkQuery.trim().toLowerCase();
  const orderOptions = openOrdersForReceipt(orders).filter(o =>
    !q || `${o.reference} ${customerName(o.customerId)}`.toLowerCase().includes(q));
  const receivableOptions = openReceivables(historyTransactions).filter(t =>
    !q || `${t.description} ${t.contactName || ''} ${customerName(t.customerId)}`.toLowerCase().includes(q));
  const isSettled = status === TransactionStatus.PAGO || status === TransactionStatus.CONFIRMADO;
  const lblSettled = isIncome ? 'Já recebido' : 'Já pago';
  const lblOpen = isIncome ? 'A receber' : 'A pagar';

  const label = 'text-sm font-semibold text-slate-800 block mb-1.5';
  const input = 'w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 outline-none focus:border-slate-800 focus:ring-2 focus:ring-slate-100';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[130] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl animate-in zoom-in-95 overflow-y-auto max-h-[92vh] custom-scrollbar border border-slate-200">
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Cabeçalho */}
          <div className="space-y-3">
            <div className="flex justify-between items-start gap-3">
              <h3 className="text-xl font-bold text-slate-900">
                {editingTransaction ? 'Editar Lançamento' : 'Novo Lançamento'}
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="p-1.5 -mr-1.5 -mt-1 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            {companyName && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-sm text-amber-800">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Lançando em:</span>
                <b className="font-bold">{companyName}</b>
              </div>
            )}
          </div>

          {/* Tipo */}
          <div>
            <span className={label}>Tipo *</span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setType(TransactionType.SALE); setCategory(INFLOW_CATEGORIES[0]); }}
                className={`py-3 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  isIncome ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <ArrowUpRight size={16} /> Entrada
              </button>
              <button
                type="button"
                onClick={() => { setType(TransactionType.EXPENSE); setCategory(OUTFLOW_CATEGORIES[0]); }}
                className={`py-3 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  !isIncome ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <ArrowDownLeft size={16} /> Saída
              </button>
            </div>
          </div>

          {/* Valor original + desconto (R$ / %) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Valor Original (R$) *</label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={originalAmountStr}
                onChange={(e) => setOriginalAmountStr(e.target.value)}
                placeholder="0"
                className={input}
              />
            </div>
            <div>
              <label className={label}>Desconto</label>
              <div className="flex gap-2">
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
                  className="w-20 p-2.5 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:border-slate-800"
                  aria-label="Tipo de desconto"
                >
                  <option value="fixed">R$</option>
                  <option value="percentage">%</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discountValueStr}
                  onChange={(e) => setDiscountValueStr(e.target.value)}
                  className={input}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-sm text-slate-600">
              Valor Líquido (Final):
              {calculatedDiscount > 0 && <span className="ml-2 text-xs text-slate-400">desconto de {formatBRL(calculatedDiscount)}</span>}
            </span>
            <span className={`text-xl font-bold ${isIncome ? 'text-emerald-600' : 'text-rose-600'}`}>{formatBRL(finalAmount)}</span>
          </div>

          {/* Descrição */}
          <div>
            <label className={label}>Descrição *</label>
            <input
              required
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Venda de Calcário Moído Granel ou Manutenção Preventiva Moinho"
              className={input}
            />
          </div>

          {/* Categoria + Cliente */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>{isIncome ? 'Categoria de Entrada' : 'Categoria de Saída'}</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
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
            <div>
              <label className={label}>{isIncome ? 'Cliente' : 'Cliente / Fornecedor'}</label>
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  const cust = customers.find(c => c.id === e.target.value);
                  if (cust) setContactName(cust.name);
                }}
                className={input}
              >
                <option value="">Selecione...</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {!customerId && (
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Ou nome livre do contato"
                  className={`${input} mt-2`}
                />
              )}
            </div>
          </div>

          {/* Centro de custo */}
          <div>
            <label className={label}>Centro de Custo</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={costCenterId}
                onChange={(e) => { setCostCenterId(e.target.value); setCostCenterCustom(''); }}
                className={input}
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
                className={input}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">Necessário para o extrato por centro de custo e abatimentos.</p>
            <CostCenterSuggestion
              description={description}
              category={category}
              notes={notes}
              currentCostCenterId={costCenterId}
              currentCostCenterName={costCenterCustom}
              existingCostCenters={costCenters}
              history={historyTransactions.map(t => ({ description: t.description, costCenter: t.costCenter || '' }))}
              onSelectCostCenter={(res) => {
                if (res.id) { setCostCenterId(res.id); setCostCenterCustom(''); }
                else { setCostCenterCustom(res.name); }
              }}
            />
          </div>

          {/* Situação */}
          <div className="p-4 border border-slate-200 rounded-xl space-y-4">
            <div>
              <span className={label}>Situação *</span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setStatus(TransactionStatus.PAGO)}
                  className={`py-3 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                    isSettled ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <CheckCircle2 size={16} /> {lblSettled}
                </button>
                <button
                  type="button"
                  onClick={() => setStatus(TransactionStatus.PENDENTE)}
                  className={`py-3 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                    !isSettled ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <Clock size={16} /> {lblOpen}
                </button>
              </div>
            </div>

            {canLink && (
              <div>
                <span className={label}>Vincular a (opcional)</span>
                <button
                  type="button"
                  onClick={() => setShowLinkPicker(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200/70 border border-slate-200 rounded-lg text-sm text-slate-700 text-left transition-colors"
                >
                  <Link2 size={16} className="text-purple-600 shrink-0" />
                  <span className="flex-1 truncate">
                    {linkedOrder
                      ? `${linkedOrder.reference} · ${customerName(linkedOrder.customerId)} · saldo ${formatBRL(linkedOpenBalance)}`
                      : linkedTx
                        ? `${linkedTx.description} · saldo ${formatBRL(linkedOpenBalance)}`
                        : 'Sem vínculo (lançamento avulso)'}
                  </span>
                  <Search size={15} className="text-slate-400 shrink-0" />
                </button>
                {link && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    {link.kind === 'order'
                      ? 'O valor entra no pedido como recibo e abate o saldo da venda. Categoria e centro de custo seguem o padrão de vendas.'
                      : 'O valor dá baixa nessa conta a receber (total ou parcial).'}
                  </p>
                )}
                {linkError && <p className="text-xs text-rose-700 font-medium mt-1.5">{linkError}</p>}
              </div>
            )}

            {isSettled ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label}>{isIncome ? 'Data do recebimento *' : 'Data do pagamento *'}</label>
                  <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={input} />
                </div>
                <div>
                  <label className={label}>Conta *</label>
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={input}>
                    {accounts.map(acc => (<option key={acc.id} value={acc.id}>{acc.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className={label}>Forma de pagamento</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={input}>
                    <option value="PIX">PIX Instantâneo</option>
                    <option value="Transferência Bancária (TED)">TED / Transferência</option>
                    <option value="Boleto Bancário">Boleto Bancário</option>
                    <option value="Dinheiro Físico">Dinheiro Físico</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className={label}>{isIncome ? 'Valor recebido (R$)' : 'Valor pago (R$)'}</label>
                  <input type="number" step="0.01" min="0" value={paidAmountStr} onChange={(e) => setPaidAmountStr(e.target.value)} className={input} />
                  {(parseFloat(paidAmountStr) || 0) > 0 && (parseFloat(paidAmountStr) || 0) < finalAmount - 0.01 && (
                    <p className="text-xs text-amber-700 mt-1">Valor menor que o líquido: será gravado como parcial.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label}>Vencimento *</label>
                  <input required type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={input} />
                </div>
                <div>
                  <label className={label}>Conta *</label>
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={input}>
                    {accounts.map(acc => (<option key={acc.id} value={acc.id}>{acc.name}</option>))}
                  </select>
                </div>
                {status === TransactionStatus.PARCIAL && (
                  <div className="sm:col-span-2">
                    <label className={label}>Valor já {isIncome ? 'recebido' : 'pago'} (R$)</label>
                    <input type="number" step="0.01" min="0" value={paidAmountStr} onChange={(e) => setPaidAmountStr(e.target.value)} className={input} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Observações */}
          <div>
            <label className={label}>Observações</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Informações adicionais do lançamento..."
              className={input}
            />
          </div>

          {/* Mais opções (datas, recibo, baixas) */}
          <details className="group border border-slate-200 rounded-xl">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-700">
              Mais opções
              {editingTransaction?.payments && editingTransaction.payments.length > 0 && (
                <span className="ml-2 text-xs font-bold text-slate-500">· {editingTransaction.payments.length} baixa(s)</span>
              )}
            </summary>
            <div className="px-4 pb-4 space-y-4">
              <div>
                <label className={label}>Data de emissão</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
              </div>

              {isIncome && (
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={generateReceipt}
                    onChange={(e) => setGenerateReceipt(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                  <span>Emitir recibo de pagamento oficial ao salvar</span>
                </label>
              )}

              {editingTransaction?.payments && editingTransaction.payments.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-800 mb-2">Baixas realizadas</p>
                  <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="p-2.5 font-semibold">Data</th>
                          <th className="p-2.5 font-semibold">Meio</th>
                          <th className="p-2.5 font-semibold">Notas</th>
                          <th className="p-2.5 font-semibold text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {editingTransaction.payments.map(pm => (
                          <tr key={pm.id}>
                            <td className="p-2.5">{pm.paymentDate}</td>
                            <td className="p-2.5">{pm.paymentMethod}</td>
                            <td className="p-2.5 text-slate-500 italic">{pm.notes || '-'}</td>
                            <td className="p-2.5 text-right font-bold text-slate-900">{formatBRL(pm.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </details>

          {/* Ações */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !description.trim()}
              className={`flex-1 py-3 text-white rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50 ${
                isIncome ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {saving ? 'Gravando...' : (editingTransaction ? 'Atualizar Lançamento' : 'Gravar Lançamento')}
            </button>
          </div>
        </form>
      </div>

      {showLinkPicker && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-[140] flex items-start justify-center p-4 pt-[12vh]"
          onClick={() => setShowLinkPicker(false)}
        >
          <div
            className="bg-white w-full max-w-lg rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
              <Search size={18} className="text-slate-400" />
              <input
                autoFocus
                value={linkQuery}
                onChange={(e) => setLinkQuery(e.target.value)}
                placeholder="Buscar por cliente, venda ou descrição..."
                className="flex-1 outline-none text-sm text-slate-900"
              />
              <button type="button" onClick={() => setShowLinkPicker(false)} aria-label="Fechar busca" className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2 space-y-1">
              <button
                type="button"
                onClick={() => { setLink(null); setShowLinkPicker(false); setLinkQuery(''); setLinkError(''); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200/70 text-sm text-slate-700 text-left"
              >
                <X size={16} className="text-slate-400" /> Sem vínculo (lançamento avulso)
              </button>

              {orderOptions.length > 0 && <p className="px-3 pt-3 pb-1 text-xs font-semibold text-slate-500">Vendas em aberto</p>}
              {orderOptions.map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => pickOrder(o)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 text-left"
                >
                  <ShoppingCart size={18} className="text-purple-600 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 truncate">{customerName(o.customerId)}</span>
                    <span className="block text-xs text-slate-500">{o.reference} · {o.date ? new Date(o.date + 'T00:00:00').toLocaleDateString('pt-BR') : ''}</span>
                  </span>
                  <span className="text-sm font-bold text-amber-700 shrink-0">{formatBRL(orderOpenBalance(o))}</span>
                </button>
              ))}

              {receivableOptions.length > 0 && <p className="px-3 pt-3 pb-1 text-xs font-semibold text-slate-500">Contas a receber</p>}
              {receivableOptions.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickReceivable(t)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 text-left"
                >
                  <FileText size={18} className="text-slate-500 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 truncate">{t.description}</span>
                    <span className="block text-xs text-slate-500 truncate">
                      {t.contactName || customerName(t.customerId)}{t.dueDate ? ` · venc. ${new Date(t.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''}
                    </span>
                  </span>
                  <span className="text-sm font-bold text-amber-700 shrink-0">{formatBRL(transactionOpenBalance(t))}</span>
                </button>
              ))}

              {orderOptions.length === 0 && receivableOptions.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-slate-500">Nada em aberto{q ? ' para essa busca' : ''}.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
