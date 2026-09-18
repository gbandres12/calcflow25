import React, { useMemo, useState } from 'react';
import {
  Company,
  FinancialAccount,
  PaymentReceipt,
  Transaction,
  TransactionPayment,
  TransactionStatus,
  TransactionType,
} from '../types';
import { titleBalance, canonicalTitleStatus, appliedAmount, isReceivable, isPayable } from '../services/financeMath';
import { ReceivePayDialog } from './ReceivePayDialog';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { AlertCircle, Banknote, FileText, Printer, Search } from 'lucide-react';

interface ReceivablePayableProps {
  mode: 'receber' | 'pagar';
  transactions: Transaction[];
  accounts: FinancialAccount[];
  company: Company;
  onUpdateTransaction: (transaction: Transaction) => void;
}

const formatBRL = (val?: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const ReceivablePayable: React.FC<ReceivablePayableProps> = ({
  mode,
  transactions,
  accounts,
  company,
  onUpdateTransaction,
}) => {
  const [query, setQuery] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);

  const rows = useMemo(() => {
    return transactions
      .filter((tx) => (mode === 'receber' ? isReceivable(tx) : isPayable(tx)))
      .filter((tx) => tx.nfeAmbiente !== 'sandbox')
      .filter((tx) => !onlyOpen || titleBalance(tx) > 0.01)
      .filter((tx) => {
        const hay = `${tx.description} ${tx.contactName || ''} ${tx.category}`.toLowerCase();
        return hay.includes(query.toLowerCase());
      })
      .sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date));
  }, [transactions, mode, onlyOpen, query]);

  const openTotal = rows.reduce((sum, tx) => sum + titleBalance(tx), 0);

  const handleConfirm = (updated: Transaction, payment: TransactionPayment) => {
    onUpdateTransaction(updated);
    const remaining = Math.max(0, Number(updated.amount || 0) - Number(updated.paidAmount || 0));
    const account = accounts.find((a) => a.id === payment.accountId);
    setReceipt({
      id: payment.receiptId || `REC-${payment.id}`,
      transactionId: updated.id,
      customerId: updated.customerId || updated.contactId || updated.id,
      customerName: updated.contactName || updated.description,
      amount: payment.amount,
      date: payment.paymentDate,
      paymentMethod: payment.paymentMethod,
      accountId: payment.accountId,
      accountName: account?.name,
      description: updated.description,
      type: payment.isDiscountOrDeduction ? 'ABATIMENTO' : 'PARCELA',
      side: mode,
      totalOrderAmount: updated.amount,
      totalPaidSoFar: appliedAmount(updated),
      remainingDebt: remaining,
      notes: payment.notes,
      companyId: company.id,
    });
    setSelected(null);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">
            {mode === 'receber' ? 'Contas a receber' : 'Contas a pagar'}
          </h2>
          <p className="text-xs text-slate-500">
            Títulos em aberto. Caixa só muda com pagamento real; abatimento reduz o saldo sem dinheiro.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase font-bold text-slate-400">Saldo em aberto na lista</p>
          <p className={`text-lg font-black ${mode === 'receber' ? 'text-emerald-700' : 'text-rose-700'}`}>{formatBRL(openTotal)}</p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar descrição, contato ou categoria"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm"
          />
        </div>
        <label className="text-xs font-bold text-slate-600 flex items-center gap-2 bg-white border border-slate-200 px-3 py-2.5 rounded-xl">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Só em aberto
        </label>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Título</th>
              <th className="text-left px-4 py-3">Vencimento</th>
              <th className="text-right px-4 py-3">Valor</th>
              <th className="text-right px-4 py-3">Saldo</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                  Nenhum título neste filtro.
                </td>
              </tr>
            )}
            {rows.map((tx) => {
              const status = canonicalTitleStatus(tx);
              return (
                <tr key={tx.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{tx.description}</p>
                    <p className="text-[11px] text-slate-500">{tx.contactName || tx.category} {tx.origin ? `• ${tx.origin}` : ''}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{tx.dueDate || tx.date}</td>
                  <td className="px-4 py-3 text-right">{formatBRL(tx.amount)}</td>
                  <td className="px-4 py-3 text-right font-black">{formatBRL(titleBalance(tx))}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${
                      status === TransactionStatus.ATRASADO ? 'bg-rose-50 text-rose-700' :
                      status === TransactionStatus.PARCIAL ? 'bg-amber-50 text-amber-700' :
                      status === TransactionStatus.PAGO ? 'bg-emerald-50 text-emerald-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {titleBalance(tx) > 0.01 && (
                      <button
                        type="button"
                        onClick={() => setSelected(tx)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"
                      >
                        {mode === 'receber' ? <Banknote size={14} /> : <AlertCircle size={14} />}
                        {mode === 'receber' ? 'Receber / abater' : 'Pagar / abater'}
                      </button>
                    )}
                    {(tx.payments || []).length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const last = [...(tx.payments || [])].pop();
                          if (!last) return;
                          handleConfirm(tx, last);
                        }}
                        className="ml-3 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:underline"
                      >
                        <Printer size={13} /> Recibo
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ReceivePayDialog
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        transaction={selected}
        accounts={accounts}
        onConfirm={handleConfirm}
      />
      {receipt && (
        <PaymentReceiptModal receipt={receipt} company={company} onClose={() => setReceipt(null)} />
      )}
      <p className="text-[11px] text-slate-400 flex items-center gap-1">
        <FileText size={12} /> Pedido faturado sem receber permanece aqui até parcela ou abatimento avulso.
      </p>
    </div>
  );
};
