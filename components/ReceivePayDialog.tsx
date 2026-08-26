import React, { useState, useMemo } from 'react';
import { 
  X, CheckCircle2, DollarSign, Calendar, CreditCard, Landmark, 
  Tag, Percent, AlertCircle, ArrowUpRight, ArrowDownLeft, Receipt, ShieldCheck
} from 'lucide-react';
import { 
  Transaction, 
  TransactionType, 
  TransactionStatus, 
  FinancialAccount, 
  TransactionPayment 
} from '../types';

interface ReceivePayDialogProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  accounts: FinancialAccount[];
  onConfirm: (updatedTransaction: Transaction, newPayment: TransactionPayment) => Promise<void> | void;
}

export const ReceivePayDialog: React.FC<ReceivePayDialogProps> = ({
  isOpen,
  onClose,
  transaction,
  accounts,
  onConfirm
}) => {
  if (!isOpen || !transaction) return null;

  const formatBRL = (val?: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const totalAmount = Number(transaction.amount || 0);
  const currentPaid = Number(transaction.paidAmount || 0);
  const remainingBalance = Math.max(0, totalAmount - currentPaid);

  // States do formulário
  const [payAmountStr, setPayAmountStr] = useState(remainingBalance.toString());
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState(transaction.accountId || accounts[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState(transaction.paymentMethod || 'PIX');
  const [isDeduction, setIsDeduction] = useState(false); // Flag se é Abatimento ou Pagamento Normal
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const numPayAmount = parseFloat(payAmountStr) || 0;
  const newProjectedPaid = currentPaid + numPayAmount;
  const newProjectedRemaining = Math.max(0, totalAmount - newProjectedPaid);

  const isIncome = transaction.type === TransactionType.SALE;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numPayAmount <= 0) return;

    setSaving(true);
    try {
      const isFullPaid = newProjectedPaid >= totalAmount - 0.01;
      const newStatus = isFullPaid ? TransactionStatus.PAGO : TransactionStatus.PARCIAL;

      const paymentRecord: TransactionPayment = {
        id: `pmt-${Date.now()}`,
        transactionId: transaction.id,
        amount: numPayAmount,
        paymentDate: paymentDate,
        accountId: accountId,
        paymentMethod: isDeduction ? 'Abatimento / Devolução' : paymentMethod,
        notes: notes.trim() || (isDeduction ? 'Abatimento / Desconto concedido' : `Pagamento via ${paymentMethod}`),
        isDiscountOrDeduction: isDeduction,
        createdAt: new Date().toISOString()
      };

      const existingPayments = transaction.payments || [];
      const updatedPayments = [...existingPayments, paymentRecord];

      const balanceNote = `[${new Date().toLocaleDateString('pt-BR')}] ${isDeduction ? '🏷️ Abatimento' : '💰 Baixa'} de ${formatBRL(numPayAmount)}. Saldo restante: ${formatBRL(newProjectedRemaining)}.`;
      const combinedNotes = transaction.notes ? `${transaction.notes}\n${balanceNote}` : balanceNote;

      const updatedTransaction: Transaction = {
        ...transaction,
        paidAmount: newProjectedPaid,
        status: newStatus,
        paymentDate: paymentDate,
        accountId: accountId,
        notes: combinedNotes,
        payments: updatedPayments
      };

      await onConfirm(updatedTransaction, paymentRecord);
      onClose();
    } catch (err) {
      console.error("Erro ao registrar recebimento/pagamento:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[140] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-[3rem] p-8 md:p-10 shadow-2xl animate-in zoom-in-95 border border-slate-100">
        
        {/* Cabeçalho */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl ${isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              {isIncome ? <ArrowUpRight size={24} /> : <ArrowDownLeft size={24} />}
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">
                {isIncome ? 'Receber Valor (Baixa)' : 'Pagar Despesa (Baixa)'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {transaction.description}
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

        {/* Resumo da Transação */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-5 space-y-2">
          <div className="flex justify-between text-xs font-bold text-slate-600">
            <span>Valor Total da Transação:</span>
            <span className="text-slate-900 font-black">{formatBRL(totalAmount)}</span>
          </div>
          <div className="flex justify-between text-xs font-bold text-emerald-600">
            <span>Já Pago / Baixado:</span>
            <span className="font-black">{formatBRL(currentPaid)}</span>
          </div>
          <div className="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-200">
            <span>Saldo Restante a Baixar:</span>
            <span className="text-amber-600 font-black">{formatBRL(remainingBalance)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Seletor se é Pagamento Normal ou Abatimento */}
          <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => setIsDeduction(false)}
              className={`py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                !isDeduction
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <CreditCard size={14} /> Pagamento Real
            </button>
            <button
              type="button"
              onClick={() => setIsDeduction(true)}
              className={`py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                isDeduction
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Tag size={14} /> 🏷️ Abatimento / Devolução
            </button>
          </div>

          {/* Valor a Baixar */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Valor Desta Baixa (R$) *
              </label>
              <button
                type="button"
                onClick={() => setPayAmountStr(remainingBalance.toString())}
                className="text-[10px] font-bold text-amber-600 hover:underline uppercase"
              >
                Quitar Tudo ({formatBRL(remainingBalance)})
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">R$</span>
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                max={remainingBalance * 1.5}
                value={payAmountStr}
                onChange={(e) => setPayAmountStr(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-amber-500 focus:bg-white font-black text-lg transition-all"
              />
            </div>
          </div>

          {/* Data e Conta Financeira */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Data do Pagamento
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Conta Financeira
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-amber-500"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Meio de Pagamento (se não for abatimento) */}
          {!isDeduction && (
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Forma de Pagamento
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-amber-500"
              >
                <option value="PIX">PIX</option>
                <option value="Transferência Bancária (TED)">Transferência Bancária (TED)</option>
                <option value="Boleto Bancário">Boleto Bancário</option>
                <option value="Dinheiro Físico">Dinheiro Físico</option>
                <option value="Cartão de Débito">Cartão de Débito</option>
                <option value="Cartão de Crédito">Cartão de Crédito</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
          )}

          {/* Observações */}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
              Observações / Motivo
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isDeduction ? "Ex: Desconto acordado por umidade excessiva" : "Ex: Comprovante #9042"}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-medium text-xs outline-none focus:border-amber-500"
            />
          </div>

          {/* Botão de Confirmação */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving || numPayAmount <= 0}
              className={`w-full py-4 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 ${
                isIncome ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
              }`}
            >
              <CheckCircle2 size={18} />
              {saving ? 'Registrando Baixa...' : `Confirmar Baixa de ${formatBRL(numPayAmount)}`}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
