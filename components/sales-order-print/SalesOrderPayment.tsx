import React from 'react';
import { SaleOrder, SalePayment, TransactionStatus } from '../../types';
import { SO } from './theme';
import { dash, formatBRL, formatDate } from './format';

interface Props {
  order: SaleOrder;
}

const paidOf = (payment: SalePayment) => {
  if (payment.status === TransactionStatus.CONFIRMADO || payment.status === TransactionStatus.PAGO) {
    return payment.amount;
  }
  return payment.paidAmount || 0;
};

export const SalesOrderPayment: React.FC<Props> = ({ order }) => {
  const payments = order.payments || [];
  const rows = payments.length > 0
    ? payments
    : order.paymentMethod
      ? [{
          id: 'method',
          amount: order.total,
          paidAmount: 0,
          date: order.date,
          status: TransactionStatus.PENDENTE,
          accountId: '',
          description: order.paymentMethod,
          paymentMethod: order.paymentMethod
        } as SalePayment]
      : [];

  return (
    <section className="so-keep">
      <h2 className="text-[12px] font-bold mb-2" style={{ color: SO.navy }}>
        Forma / condições de pagamento
      </h2>
      <table className="w-full border-collapse text-[10px]" style={{ color: SO.text }}>
        <thead>
          <tr style={{ background: SO.navy, color: '#fff' }}>
            <th className="font-semibold text-left py-1.5 px-2">Descrição</th>
            <th className="font-semibold text-left py-1.5 px-2 w-[88px]">Vencimento</th>
            <th className="font-semibold text-left py-1.5 px-2 w-[92px]">Pagamento</th>
            <th className="font-semibold text-right py-1.5 px-2 w-[92px]">Valor</th>
            <th className="font-semibold text-right py-1.5 px-2 w-[92px]">Saldo</th>
            <th className="font-semibold text-left py-1.5 px-2">Observação</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-2 px-2" style={{ color: SO.muted }}>
                —
              </td>
            </tr>
          ) : (
            rows.map((payment, idx) => {
              const paid = paidOf(payment);
              const saldo = Math.max(0, (payment.amount || 0) - paid);
              const label = payment.description
                || payment.paymentMethod
                || `Parcela ${idx + 1}`;
              const numbered = payments.length > 1 ? `${label} [${idx + 1}/${payments.length}]` : label;
              return (
                <tr
                  key={payment.id || idx}
                  style={{ background: idx % 2 === 0 ? '#fff' : SO.bg, borderBottom: `1px solid ${SO.border}` }}
                >
                  <td className="py-1.5 px-2 font-semibold">{numbered}</td>
                  <td className="py-1.5 px-2">{formatDate(payment.date)}</td>
                  <td className="py-1.5 px-2">{dash(payment.paymentMethod || payment.status)}</td>
                  <td className="py-1.5 px-2 text-right">{formatBRL(payment.amount)}</td>
                  <td className="py-1.5 px-2 text-right">{formatBRL(saldo)}</td>
                  <td className="py-1.5 px-2">{payment.status || ''}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
};
