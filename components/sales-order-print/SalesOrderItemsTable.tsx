import React from 'react';
import { SaleOrder } from '../../types';
import { SO } from './theme';
import { formatBRL, formatQty } from './format';

interface Props {
  order: SaleOrder;
}

export const SalesOrderItemsTable: React.FC<Props> = ({ order }) => {
  const items = order.items || [];
  const qtyTotal = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <section>
      <h2 className="text-[12px] font-bold mb-2" style={{ color: SO.navy }}>
        Itens do pedido
      </h2>
      <table className="w-full border-collapse text-[10px]" style={{ color: SO.text }}>
        <thead>
          <tr style={{ background: SO.navy, color: '#fff' }}>
            <th className="font-semibold text-left py-1.5 px-2 w-[72px]">Referência</th>
            <th className="font-semibold text-left py-1.5 px-2">Descrição</th>
            <th className="font-semibold text-center py-1.5 px-2 w-[64px]">Unidade</th>
            <th className="font-semibold text-right py-1.5 px-2 w-[78px]">Quantidade</th>
            <th className="font-semibold text-right py-1.5 px-2 w-[88px]">Unitário</th>
            <th className="font-semibold text-right py-1.5 px-2 w-[80px]">Desconto</th>
            <th className="font-semibold text-right py-1.5 px-2 w-[92px]">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr
              key={item.productId || idx}
              style={{ background: idx % 2 === 0 ? '#fff' : SO.bg, borderBottom: `1px solid ${SO.border}` }}
            >
              <td className="py-1.5 px-2 align-top whitespace-nowrap">{item.productCode || '—'}</td>
              <td className="py-1.5 px-2 align-top font-semibold">{item.productName}</td>
              <td className="py-1.5 px-2 align-top text-center">{item.unit || '—'}</td>
              <td className="py-1.5 px-2 align-top text-right">{formatQty(item.quantity)}</td>
              <td className="py-1.5 px-2 align-top text-right">{formatBRL(item.unitPrice)}</td>
              <td className="py-1.5 px-2 align-top text-right">{formatBRL(item.discount || 0)}</td>
              <td className="py-1.5 px-2 align-top text-right font-semibold">{formatBRL(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div
        className="mt-0 flex items-center justify-between text-[10px] px-2.5 py-1.5 rounded-b-md"
        style={{ background: SO.bg, border: `1px solid ${SO.border}`, borderTop: 'none' }}
      >
        <span style={{ color: SO.muted }}>
          Quantidade total:{' '}
          <strong style={{ color: SO.text }}>{formatQty(qtyTotal)}</strong>
        </span>
        <span style={{ color: SO.muted }}>
          Valor total dos itens:{' '}
          <strong style={{ color: SO.text }}>{formatBRL(order.subtotal)}</strong>
        </span>
      </div>
    </section>
  );
};
