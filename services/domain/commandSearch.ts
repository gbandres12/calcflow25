import { Customer, SaleOrder } from '../../types.js';

export type CommandKind = 'view' | 'order' | 'customer' | 'loading';

export interface CommandItem {
  id: string;
  kind: CommandKind;
  label: string;
  hint: string;
  /** Tela pra onde ir ao escolher. */
  view: string;
  /** Texto que alimenta a busca (sem acento, minúsculo). */
  haystack: string;
}

export interface ViewEntry {
  id: string;
  label: string;
}

const normalize = (text: string) =>
  String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function buildCommandIndex(input: {
  views: ViewEntry[];
  orders: SaleOrder[];
  customers: Customer[];
}): CommandItem[] {
  const nameById = new Map((input.customers || []).map((c) => [c.id, c.name]));
  const items: CommandItem[] = [];

  for (const v of input.views) {
    items.push({ id: `view-${v.id}`, kind: 'view', label: v.label, hint: 'Tela', view: v.id, haystack: normalize(v.label) });
  }

  for (const c of input.customers || []) {
    if (!c?.id) continue;
    items.push({
      id: `customer-${c.id}`,
      kind: 'customer',
      label: c.name,
      hint: c.document || 'Cliente',
      view: 'customers',
      haystack: normalize(`${c.name} ${c.document || ''} ${String(c.document || '').replace(/\D/g, '')} ${c.city || ''}`)
    });
  }

  for (const o of input.orders || []) {
    if (!o?.id) continue;
    const customer = nameById.get(o.customerId) || '';
    const nfes = [o.nfeNumero, ...(o.nfes || []).map((n) => n?.nfeNumero)].filter(Boolean).join(' ');
    items.push({
      id: `order-${o.id}`,
      kind: 'order',
      label: `${o.reference} · ${customer || 'Cliente'}`,
      hint: nfes ? `NF-e ${nfes}` : String(o.status),
      view: 'orders',
      haystack: normalize(`${o.reference} ${customer} ${nfes}`)
    });
    for (const w of o.withdrawals || []) {
      if (!w) continue;
      items.push({
        id: `loading-${o.id}-${w.id}`,
        kind: 'loading',
        label: `${String(w.plateNumber || '').toUpperCase()} · ${customer || 'Cliente'}`,
        hint: [w.date?.split('-').reverse().join('/'), w.nfeNumero ? `NF-e ${w.nfeNumero}` : '', w.driverName].filter(Boolean).join(' · '),
        view: 'yard',
        haystack: normalize(`${w.plateNumber} ${String(w.plateNumber || '').replace(/[^a-z0-9]/gi, '')} ${w.driverName} ${w.transporterName || ''} ${w.nfeNumero || ''} ${w.weighTicketNumber || ''} ${customer}`)
      });
    }
  }

  return items;
}

const KIND_RANK: Record<CommandKind, number> = { view: 0, customer: 1, order: 2, loading: 3 };

/** Todas as palavras digitadas precisam aparecer; começo de palavra conta mais. */
export function searchCommands(items: CommandItem[], query: string, limit = 12): CommandItem[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return items.filter((i) => i.kind === 'view').slice(0, limit);
  const scored: { item: CommandItem; score: number }[] = [];
  for (const item of items) {
    if (!terms.every((t) => item.haystack.includes(t))) continue;
    const startsWord = terms.filter((t) => new RegExp(`(^|\\s)${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(item.haystack)).length;
    scored.push({ item, score: startsWord * 10 - KIND_RANK[item.kind] });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.item);
}
