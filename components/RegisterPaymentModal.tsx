import React, { useState } from 'react';
import { SaleOrder, Customer, FinancialAccount, PaymentReceipt, Company } from '../types';
import { orderReceiptsPaid } from '../services/saleNfe';
import { CheckCircle } from 'lucide-react';
import { newId } from '../services/ids';
import { FlowSheet } from './ui/FlowSheet';

interface RegisterPaymentModalProps {
  order: SaleOrder;
  /** Já baixado direto no Financeiro (sem recibo no pedido). */
  financePaid?: number;
  customer?: Customer;
  accounts: FinancialAccount[];
  company: Company;
  onSavePayment: (receipt: PaymentReceipt, updatedOrder: SaleOrder) => void;
  onClose: () => void;
}

export const RegisterPaymentModal: React.FC<RegisterPaymentModalProps> = ({
  order,
  financePaid = 0,
  customer,
  accounts,
  company,
  onSavePayment,
  onClose
}) => {
  const totalPaidSoFar = Math.max(orderReceiptsPaid(order), financePaid);
  const currentDebt = Math.max(0, Number(order.total || 0) - totalPaidSoFar);

  const [amount, setAmount] = useState(currentDebt > 0 ? (currentDebt > 5000 ? '5000' : currentDebt.toString()) : '0');
  const [paymentType, setPaymentType] = useState<'ENTRADA' | 'PARCELA' | 'ABATIMENTO'>(
    (order.receipts || []).length === 0 ? 'ENTRADA' : 'ABATIMENTO'
  );
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0].id : '');
  const [receivedBy, setReceivedBy] = useState('Setor Financeiro / Caixa');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [formError, setFormError] = useState('');

  const amountNum = parseFloat(amount) || 0;
  const remainingDebtAfter = Math.max(0, currentDebt - amountNum);

  const formatBRL = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amountNum <= 0) {
      setFormError('Informe um valor de pagamento maior que zero.');
      return;
    }
    if (amountNum > currentDebt + 0.01) {
      setFormError(`O valor informado é maior que o saldo em aberto de ${formatBRL(currentDebt)}.`);
      return;
    }
    const selectedAccount = accounts.find(a => a.id === accountId);
    if (!selectedAccount) {
      setFormError('Escolha em qual banco/caixa o dinheiro entrou.');
      return;
    }
    setFormError('');

    // Id único de verdade: o antigo (4 dígitos aleatórios) podia repetir e
    // fazer um recibo novo ser tratado como já lançado.
    const receiptId = newId(`REC-${new Date().getFullYear()}`);

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
      accountName: selectedAccount.name,
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
    <FlowSheet
      title="Receber entrada / abatimento"
      zIndexClass="z-[200]"
      onClose={onClose}
      subtitle={`${order.reference} · ${customer?.name || 'Cliente'}`}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 min-h-11 text-xs font-bold uppercase text-slate-500 hover:bg-slate-50 rounded-xl"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="register-payment-form"
            className="flex-1 min-h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wide rounded-xl flex items-center justify-center gap-2"
          >
            <CheckCircle size={16} /> Confirmar e emitir recibo
          </button>
        </div>
      }
    >
        <form id="register-payment-form" onSubmit={handleSubmit} className="space-y-4">
          
          {/* Card Resumo do Pedido */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
            <div>
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Valor Total Venda</span>
              <p className="text-sm font-black text-slate-800">{formatBRL(order.total)}</p>
            </div>
            <div>
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Já Pago/Abatido</span>
              <p className="text-sm font-black text-emerald-600">{formatBRL(totalPaidSoFar)}</p>
            </div>
            <div>
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Saldo Devedor Atual</span>
              <p className="text-sm font-black text-rose-600">{formatBRL(currentDebt)}</p>
            </div>
          </div>

          {/* Tipo de Transação */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Tipo de Lançamento</label>
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
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Valor do Recebimento (R$)</label>
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              max={currentDebt}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full p-3.5 bg-emerald-50/50 border border-emerald-200 text-emerald-900 rounded-2xl outline-none font-black text-xl sm:text-2xl focus:border-emerald-500"
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
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Forma de Pagamento</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm focus:border-purple-500"
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
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Conta Bancária / Caixa Destino</label>
              <select
                value={accountId}
                required
                onChange={e => setAccountId(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm focus:border-purple-500"
              >
                <option value="" disabled>Selecione o banco/caixa…</option>
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
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Data do Pagamento</label>
              <input
                required
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm focus:border-purple-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Recebido Por</label>
              <input
                type="text"
                value={receivedBy}
                onChange={e => setReceivedBy(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm focus:border-purple-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Observações do Recibo (Opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Pagamento referente a 1ª carga de calcário..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-medium text-sm focus:border-purple-500"
            />
          </div>

          {formError ? <p className="text-xs font-bold text-rose-600">{formError}</p> : null}
        </form>
    </FlowSheet>
  );
};
