import React from 'react';
import { SaleOrder } from '../../types';
import { SO } from './theme';
import { formatBRL } from './format';

interface Props {
  order: SaleOrder;
}

export const SalesOrderObservations: React.FC<Props> = ({ order }) => {
  const barter = order.isBarter
    ? `Operação de barter: ${order.barterCommodityType || ''}${order.cornPricePerTon != null ? ` · Cotação ${formatBRL(order.cornPricePerTon)}/TON` : ''}${order.cornTons != null ? ` · ${order.cornTons.toFixed(2)} TON` : ''}`.trim()
    : '';
  const notes = (order.notes || '').trim();
  const content = [notes, barter].filter(Boolean).join('\n');

  return (
    <section className="so-keep rounded-md px-3.5 py-2.5" style={{ border: `1px solid ${SO.border}` }}>
      <h2 className="text-[12px] font-bold mb-1.5" style={{ color: SO.navy }}>
        Observações
      </h2>
      <div
        className={`text-[10px] whitespace-pre-wrap ${content ? '' : 'h-6'}`}
        style={{ color: SO.text }}
      >
        {content || ''}
      </div>
    </section>
  );
};
