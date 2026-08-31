import React, { useState } from 'react';
import { SaleOrder, Customer, FinancialAccount, PaymentReceipt, Company, TransactionStatus } from '../types';
import { DollarSign, Landmark, CreditCard, Calendar, User, FileText, CheckCircle, X } from 'lucide-react';

interface RegisterPaymentModalProps {
  order: SaleOrder;
  customer?: Customer;
  accounts: FinancialAccount[];
  company: Company;
  onSavePayment: (receipt: PaymentReceipt, updatedOrder: SaleOrder) => void;
  onClose: () => void;
}

export const RegisterPaymentModal: React.FC<RegisterPaymentModalProps> = ({
  order,
  customer,
  accounts,
  company,
  onSavePayment,
  onClose
}) => {
  const receiptsPaid = (order.receipts || []).reduce((acc, r) => acc + (r.amount || 0), 0);
  const scheduledPaid = (order.payments || []).reduce((acc, p) => (
    p.status === TransactionStatus.CONFIRMADO || p.status === TransactionStatus.PAGO
      ? acc + p.amount
      : acc + (p.paidAmount || 0)
  ), 0);
  const totalPaidSoFar = Math.max(receiptsPaid, scheduledPaid);
  const currentDebt = Math.max(0, order.total - totalPaidSoFar);

  const [amount, setAmount] = useState(currentDebt > 0 ? (currentDebt > 5000 ? '5000' : currentDebt.toString()) : '0');
  const [paymentType, setPaymentType] = useState<'ENTRADA' | 'PARCELA' | 'ABATIMENTO'>(
    (order.receipts || []).length === 0 ? 'ENTRADA' : 'ABATIMENTO'
  );
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [receivedBy, setReceivedBy] = useState('Setor Financeiro / Caixa');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const amountNum = parseFloat(amount) || 0;
  const remainingDebtAfter = Math.max(0, currentDebt - amountNum);

  const formatBRL = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amountNum <= 0) {
      alert('Informe um valor de pagamento maior que zero.');
      return;
    }

    const receiptId = `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const selectedAccount = accounts.find(a => a.id === accountId);

    const newReceipt: PaymentReceipt = {
      id: receiptId,
      orderId: order.id,
      orderReference: order.reference,
      customerId: order.customerId,
      customerName: customer?.name || 'Cliente Geral',
      customerDocument: customer?.document,
      amount: amountNum,
      date,
      paymentMethod,
      accountId,
      accountName: selectedAccount?.name || 'Caixa Geral',
      receivedBy,
      description: paymentType === 'ENTRADA' ? `Entrada Pedido #${order.reference}` : 
                   paymentType === 'ABATIMENTO' ? `Abatimento Pedido #${order.reference}` : `Parcela Pedido #${order.reference}`,
      type: paymentType,
      totalOrderAmount: order.total,
      totalPaidSoFar: totalPaidSoFar + amountNum,
      remainingDebt: remainingDebtAfter,
      notes: notes.trim()
    };

    const updatedReceipts = [...(order.receipts || []), newReceipt];
    const updatedOrder: SaleOrder = {
      ...order,
      receipts: updatedReceipts
    };

    onSavePayment(newReceipt, updatedOrder);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 rounded-xl text-white">
              <DollarSign size={20} />
            </div>
            <div>
              <h3 className="font-black text-lg tracking-tight">Receber Entrada / Abatimento</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                Pedido: {order.reference} • Cliente: {customer?.name || 'Cliente'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
          
          {/* Card Resumo do Pedido */}
          <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center">
            <div>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Valor Total Venda</span>
              <p className="text-sm font-black text-slate-800">{formatBRL(order.total)}</p>
            </div>
            <div>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Já Pago/Abatido</span>
              <p className="text-sm font-black text-emerald-600">{formatBRL(totalPaidSoFar)}</p>
            </div>
            <div>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Saldo Devedor Atual</span>
              <p className="text-sm font-black text-rose-600">{formatBRL(currentDebt)}</p>
            </div>
          </div>

          {/* Tipo de Transação */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Lançamento</label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-2xl">
              <button
                type="button"
                onClick={() => setPaymentType('ENTRADA')}
                className={`py-2.5 rounded-xl font-black text-xs transition-all ${paymentType === 'ENTRADA' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
              >
                ENTRADA
              </button>
              <button
                type="button"
                onClick={() => setPaymentType('ABATIMENTO')}
                className={`py-2.5 rounded-xl font-black text-xs transition-all ${paymentType === 'ABATIMENTO' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500'}`}
              >
                ABATIMENTO
              </button>
              <button
                type="button"
                onClick={() => setPaymentType('PARCELA')}
                className={`py-2.5 rounded-xl font-black text-xs transition-all ${paymentType === 'PARCELA' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
              >
                PARCELA
              </button>
            </div>
          </div>

          {/* Valor do Pagamento */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor do Recebimento (R$)</label>
            <input
              required
              type="number"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full p-4 bg-emerald-50/50 border border-emerald-200 text-emerald-900 rounded-2xl outline-none font-black text-2xl focus:border-emerald-500"
              placeholder="0.00"
            />
            <div className="flex justify-between items-center pt-1 text-xs font-bold text-slate-500">
              <span>Saldo devedor restante após este pagamento:</span>
              <strong className={remainingDebtAfter === 0 ? 'text-emerald-600 font-black' : 'text-rose-600 font-black'}>
                {formatBRL(remainingDebtAfter)}
              </strong>
            </div>
          </div>

          {/* Forma de Pagamento e Conta de Destino */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma de Pagamento</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm focus:border-purple-500"
              >
                <option value="PIX">PIX</option>
                <option value="Dinheiro">Dinheiro (Espécie)</option>
                <option value="Transferência Bancária (TED/DOC)">Transferência (TED/DOC)</option>
                <option value="Boleto Bancário">Boleto Bancário</option>
                <option value="Cartão de Débito">Cartão de Débito</option>
                <option value="Cartão de Crédito">Cartão de Crédito</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Conta Bancária / Caixa Destino</label>
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm focus:border-purple-500"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.bankName || 'Caixa'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data do Pagamento</label>
              <input
                required
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm focus:border-purple-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recebido Por</label>
              <input
                type="text"
                value={receivedBy}
                onChange={e => setReceivedBy(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm focus:border-purple-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observações do Recibo (Opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Pagamento referente a 1ª carga de calcário..."
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-medium text-sm focus:border-purple-500"
            />
          </div>

          <div className="flex gap-4 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-4 text-xs font-black uppercase text-slate-400 hover:bg-slate-50 rounded-2xl transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-emerald-100 transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle size={16} /> Confirmar Recebimento & Emitir Recibo
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
