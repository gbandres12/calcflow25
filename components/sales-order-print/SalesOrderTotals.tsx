import React from 'react';
import { SaleOrder } from '../../types';
import { SO } from './theme';
import { formatBRL } from './format';

interface Props {
  order: SaleOrder;
}

export const SalesOrderTotals: React.FC<Props> = ({ order }) => (
  <section className="so-totals so-keep flex flex-col md:flex-row md:items-stretch gap-3">
    <div className="flex-1 rounded-md px-3.5 py-3" style={{ background: SO.bg, border: `1px solid ${SO.border}` }}>
      <h2 className="text-[12px] font-bold mb-2.5" style={{ color: SO.navy }}>
        Valor total do pedido
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[9px]">
        <div>
          <p className="font-medium" style={{ color: SO.muted }}>Total dos itens</p>
          <p className="text-[11px] font-semibold" style={{ color: SO.text }}>{formatBRL(order.subtotal)}</p>
        </div>
        <div>
          <p className="font-medium" style={{ color: SO.muted }}>Desconto</p>
          <p className="text-[11px] font-semibold" style={{ color: SO.text }}>{formatBRL(order.discount || 0)}</p>
        </div>
        <div>
          <p className="font-medium" style={{ color: SO.muted }}>Frete</p>
          <p className="text-[11px] font-semibold" style={{ color: SO.text }}>{formatBRL(order.shipping || 0)}</p>
        </div>
        <div>
          <p className="font-medium" style={{ color: SO.muted }}>Outros</p>
          <p className="text-[11px] font-semibold" style={{ color: SO.text }}>{formatBRL(0)}</p>
        </div>
      </div>
    </div>

    <div
      className="md:w-[220px] rounded-md px-4 py-3 flex flex-col justify-center"
      style={{ background: SO.totalBg, border: `1px solid ${SO.border}` }}
    >
      <p className="text-[11px] font-bold tracking-wide" style={{ color: SO.green }}>
        Valor total
      </p>
      <p className="text-[22px] font-bold leading-tight" style={{ color: SO.navy }}>
        {formatBRL(order.total)}
      </p>
    </div>
  </section>
);
