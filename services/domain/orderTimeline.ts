import { OrderStatus, SaleOrder } from '../../types.js';
import { formatTons } from './loadings.js';
import { formatBRL } from './telegramWrites.js';

export type TimelineKind = 'created' | 'loading' | 'nfe' | 'receipt';

export interface TimelineEvent {
  id: string;
  date: string;
  kind: TimelineKind;
  title: string;
  detail?: string;
}

const day = (value?: string) => String(value || '').slice(0, 10);

// Mesmo dia: pedido → carga → nota → pagamento, que é a ordem real no pátio.
const KIND_ORDER: Record<TimelineKind, number> = { created: 0, loading: 1, nfe: 2, receipt: 3 };

/** Tudo que aconteceu com o pedido, em ordem, num lugar só. */
export function buildOrderTimeline(order: SaleOrder): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const isBudget = order.status === OrderStatus.BUDGET;

  events.push({
    id: `created-${order.id}`,
    date: day(order.date),
    kind: 'created',
    title: isBudget ? 'Orçamento criado' : 'Pedido confirmado',
    detail: `${formatBRL(order.total)}${order.sellerName ? ` · ${order.sellerName}` : ''}`
  });

  for (const w of order.withdrawals || []) {
    if (!w) continue;
    const parts = [`${formatTons(w.quantityWithdrawn)} t`, w.plateNumber, w.driverName, w.transporterName].filter(Boolean);
    events.push({
      id: `loading-${w.id}`,
      date: day(w.date),
      kind: 'loading',
      title: w.nfeNumero ? `Carregamento · NF-e ${w.nfeNumero}` : 'Carregamento',
      detail: parts.join(' · ')
    });
  }

  const seenNfe = new Set<string>();
  for (const nfe of order.nfes || []) {
    if (!nfe || (!nfe.nfeNumero && !nfe.nfeStatus)) continue;
    seenNfe.add(String(nfe.nfeNumero || nfe.id));
    events.push({
      id: `nfe-${nfe.id}`,
      date: day(nfe.nfeEmissao || nfe.createdAt || order.date),
      kind: 'nfe',
      title: nfe.nfeNumero ? `NF-e ${nfe.nfeNumero}` : 'NF-e',
      detail: [nfe.nfeStatus, formatBRL(nfe.total)].filter(Boolean).join(' · ')
    });
  }
  if (order.nfeNumero && !seenNfe.has(String(order.nfeNumero))) {
    events.push({
      id: `nfe-order-${order.id}`,
      date: day(order.nfeEmissao || order.date),
      kind: 'nfe',
      title: `NF-e ${order.nfeNumero}`,
      detail: order.nfeStatus
    });
  }

  for (const r of order.receipts || []) {
    if (!r) continue;
    events.push({
      id: `receipt-${r.id}`,
      date: day(r.date),
      kind: 'receipt',
      title: r.type === 'ABATIMENTO' ? 'Abatimento' : 'Recebimento',
      detail: [formatBRL(r.amount), r.paymentMethod].filter(Boolean).join(' · ')
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}
