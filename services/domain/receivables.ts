import { LoadingBillingTerm, OrderStatus, SaleOrder, Transaction, TransactionStatus, TransactionType } from '../../types';
import { isFiscalOnlyOrder, orderReceiptsPaid } from '../saleNfe';

// Contas a receber = vendas confirmadas menos o que já entrou por recibo.
// Não depende do lançamento financeiro do pedido: a venda pode existir sem
// tocar o caixa, e o dinheiro só entra quando alguém recebe e escolhe o banco.

export interface ReceivableRow {
  /** Chave única da linha: a carga, ou o pedido quando ele é cobrado inteiro. */
  key: string;
  orderId: string;
  withdrawalId?: string;
  reference: string;
  customerId: string;
  date: string;
  /** Carga: vencimento dela. Pedido: primeira parcela programada ou a data da venda. */
  dueDate: string;
  term: LoadingBillingTerm;
  plate?: string;
  quantity?: number;
  unitPrice?: number;
  total: number;
  paid: number;
  open: number;
}

export { BILLING_LABEL as TERM_LABEL } from './loadings';

const cents = (n: number) => Math.round(n * 100) / 100;

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Vencimento de uma carga pela modalidade. Semanal vence no sábado da mesma semana. */
export function loadingDueDate(term: LoadingBillingTerm, loadDate: string, termDays = 0): string {
  if (term === 'semanal') {
    const weekday = new Date(`${loadDate}T12:00:00`).getDay(); // 0 dom … 6 sáb
    return addDays(loadDate, (6 - weekday + 7) % 7);
  }
  if (term === 'prazo') return addDays(loadDate, Math.max(0, Math.round(termDays)));
  return loadDate;
}

const orderUnitPrice = (order: SaleOrder): number => Number(order.items?.[0]?.unitPrice) || 0;

/** Pedido é cobrado por carga quando alguma carga tem negociação própria. */
export const isBilledPerLoading = (order: SaleOrder): boolean =>
  (order.withdrawals || []).some((w) => w?.billingTerm && w.billingTerm !== 'pedido');

const firstDueDate = (order: SaleOrder): string => {
  const dates = (order.payments || []).map((p) => p?.date).filter(Boolean).sort();
  return dates[0] || order.date;
};

/**
 * Quanto do pedido já foi baixado pelo Financeiro (inclusive abatimento/
 * desconto, que também reduz a dívida). Muita venda foi quitada direto em
 * Lançamentos, sem recibo no pedido — sem isso ela apareceria em aberto.
 */
export function financePaidByOrder(transactions: Transaction[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (!t?.orderId || t.type !== TransactionType.SALE) continue;
    const payments = t.payments || [];
    const paid = payments.length > 0
      ? payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
      : t.status === TransactionStatus.PAGO || t.status === TransactionStatus.CONFIRMADO
        ? Number(t.paidAmount) || Number(t.amount) || 0
        : Number(t.paidAmount) || 0;
    map.set(t.orderId, (map.get(t.orderId) || 0) + paid);
  }
  return map;
}

export function buildReceivableRows(orders: SaleOrder[], transactions: Transaction[] = []): ReceivableRow[] {
  const financePaid = financePaidByOrder(transactions);
  const rows: ReceivableRow[] = [];
  for (const o of orders) {
    if (!o || o.status !== OrderStatus.FINALIZED || isFiscalOnlyOrder(o)) continue;
    // Todo recibo também vira pagamento no Financeiro; o maior dos dois
    // cobre pedidos só com recibo, só com baixa, ou com os dois.
    let paidLeft = cents(Math.max(orderReceiptsPaid(o), financePaid.get(o.id) || 0));

    if (!isBilledPerLoading(o)) {
      const total = cents(Number(o.total) || 0);
      rows.push({
        key: o.id, orderId: o.id, reference: o.reference, customerId: o.customerId,
        date: o.date, dueDate: firstDueDate(o), term: 'pedido',
        total, paid: Math.min(total, paidLeft), open: cents(Math.max(0, total - paidLeft))
      });
      continue;
    }

    // Cobrança por carga: o cliente deve o que carregou, não o pedido inteiro.
    // O que ele já pagou no pedido quita as cargas que vencem primeiro.
    const loads = (o.withdrawals || [])
      .filter(Boolean)
      .map((w) => {
        const term: LoadingBillingTerm = w.billingTerm || 'pedido';
        const unitPrice = w.unitPrice ?? orderUnitPrice(o);
        return {
          w, term, unitPrice,
          dueDate: w.dueDate || (term === 'pedido' ? firstDueDate(o) : loadingDueDate(term, w.date, w.termDays)),
          total: cents((Number(w.quantityWithdrawn) || 0) * unitPrice)
        };
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.w.date.localeCompare(b.w.date));
    for (const l of loads) {
      const paid = cents(Math.min(l.total, paidLeft));
      paidLeft = cents(paidLeft - paid);
      rows.push({
        key: l.w.id, orderId: o.id, withdrawalId: l.w.id, reference: o.reference, customerId: o.customerId,
        date: l.w.date, dueDate: l.dueDate, term: l.term, plate: l.w.plateNumber,
        quantity: l.w.quantityWithdrawn, unitPrice: l.unitPrice,
        total: l.total, paid, open: cents(l.total - paid)
      });
    }
  }
  return rows
    .filter((r) => r.open > 0.009)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.date.localeCompare(b.date));
}

export interface Allocation {
  key: string;
  orderId: string;
  amount: number;
}

/**
 * Divide um pagamento entre as vendas escolhidas, na ordem dada (a mais
 * antiga primeiro). Nunca passa do saldo de cada venda; o que sobrar volta
 * em `leftover` pra tela barrar — pagamento a mais não vira entrada solta.
 */
export function allocatePayment(rows: ReceivableRow[], amount: number): { allocations: Allocation[]; leftover: number } {
  let remaining = cents(amount);
  const allocations: Allocation[] = [];
  for (const row of rows) {
    if (remaining <= 0.009) break;
    const applied = cents(Math.min(row.open, remaining));
    if (applied <= 0.009) continue;
    allocations.push({ key: row.key, orderId: row.orderId, amount: applied });
    remaining = cents(remaining - applied);
  }
  return { allocations, leftover: remaining };
}

/** Soma as fatias por pedido — o recibo é gravado no pedido. */
export function allocationsByOrder(allocations: Allocation[]): { orderId: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const a of allocations) map.set(a.orderId, cents((map.get(a.orderId) || 0) + a.amount));
  return [...map].map(([orderId, amount]) => ({ orderId, amount }));
}

export type Aging = 'vencido' | 'hoje' | 'a_vencer';

export function agingOf(dueDate: string, today: string): Aging {
  if (dueDate < today) return 'vencido';
  if (dueDate === today) return 'hoje';
  return 'a_vencer';
}

