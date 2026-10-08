import React from 'react';
import { FileCheck, Receipt, ShoppingCart, Truck } from 'lucide-react';
import { SaleOrder } from '../types';
import { TimelineKind, buildOrderTimeline } from '../services/domain/orderTimeline';

const ICON: Record<TimelineKind, React.ElementType> = {
  created: ShoppingCart,
  loading: Truck,
  nfe: FileCheck,
  receipt: Receipt
};

const TONE: Record<TimelineKind, string> = {
  created: 'bg-ink text-white',
  loading: 'bg-forest text-white',
  nfe: 'bg-purple-700 text-white',
  receipt: 'bg-sand text-ink'
};

const brDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

/** Criado → carregamentos → notas → pagamentos, na ordem em que aconteceram. */
export const OrderTimeline: React.FC<{ order: SaleOrder }> = ({ order }) => {
  const events = buildOrderTimeline(order);
  return (
    <ol className="relative space-y-4 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-line">
      {events.map((event) => {
        const Icon = ICON[event.kind];
        return (
          <li key={event.id} className="relative flex gap-3">
            <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONE[event.kind]}`}>
              <Icon size={15} />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-bold text-ink">
                {event.title}
                <span className="ml-2 font-medium text-muted tabular-nums">{brDate(event.date)}</span>
              </p>
              {event.detail && <p className="text-sm text-muted break-words">{event.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default OrderTimeline;
