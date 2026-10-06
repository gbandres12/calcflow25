import {
  Customer,
  OrderStatus,
  PaymentReceipt,
  SaleOrder,
  Transaction,
  TransactionPayment,
  TransactionStatus,
  TransactionType
} from '../types';
import { isFiscalOnlyOrder, orderReceiptsPaid } from './saleNfe';

/** Saldo que ainda falta receber de uma venda (total − recibos). */
export function orderOpenBalance(order: Pick<SaleOrder, 'total' | 'receipts'>): number {
  return Math.max(0, Number(order.total || 0) - orderReceiptsPaid(order));
}

/** Vendas confirmadas com saldo em aberto (nota avulsa e orçamento ficam de fora). */
export function openOrdersForReceipt(orders: SaleOrder[]): SaleOrder[] {
  return orders
    .filter(o => o.status === OrderStatus.FINALIZED && !isFiscalOnlyOrder(o) && orderOpenBalance(o) > 0.01)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export function transactionOpenBalance(tx: Pick<Transaction, 'amount' | 'paidAmount'>): number {
  return Math.max(0, Number(tx.amount || 0) - Number(tx.paidAmount || 0));
}

/**
 * Contas a receber avulsas (sem pedido). As que pertencem a uma venda já
 * entram pela própria venda, para o mesmo valor não aparecer duas vezes.
 */
export function openReceivables(transactions: Transaction[]): Transaction[] {
  return transactions
    .filter(t => t.type === TransactionType.SALE && !t.orderId && transactionOpenBalance(t) > 0.01)
    .sort((a, b) => String(a.dueDate || a.date || '').localeCompare(String(b.dueDate || b.date || '')));
}

export interface ReceiptInput {
  amount: number;
  date: string;
  paymentMethod: string;
  accountId: string;
  accountName?: string;
  notes?: string;
  receivedBy?: string;
}

/** Mesmo recibo que a tela "Receber entrada / abatimento" da venda gera. */
export function buildOrderReceipt(order: SaleOrder, customer: Customer | undefined, input: ReceiptInput, now = new Date()): PaymentReceipt {
  const paidBefore = orderReceiptsPaid(order);
  const debtBefore = orderOpenBalance(order);
  const isFirst = (order.receipts || []).length === 0;
  const kind = isFirst ? 'ENTRADA' : 'ABATIMENTO';
  const id = `REC-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  return {
    id,
    orderId: order.id,
    orderReference: order.reference,
    customerId: order.customerId,
    customerName: customer?.name || 'Cliente Geral',
    customerDocument: customer?.document,
    amount: input.amount,
    date: input.date,
    paymentMethod: input.paymentMethod,
    accountId: input.accountId,
    accountName: input.accountName || 'Caixa Geral',
    receivedBy: input.receivedBy || 'Setor Financeiro / Caixa',
    description: `${isFirst ? 'Entrada' : 'Abatimento'} Pedido #${order.reference}`,
    type: kind,
    totalOrderAmount: order.total,
    totalPaidSoFar: paidBefore + input.amount,
    remainingDebt: Math.max(0, debtBefore - input.amount),
    notes: (input.notes || '').trim()
  };
}

/** Baixa (total ou parcial) numa conta a receber avulsa — mesmo formato da tela de liquidar. */
export function settleReceivable(tx: Transaction, input: ReceiptInput, now = new Date()): Transaction {
  const paidAfter = Number(tx.paidAmount || 0) + input.amount;
  const remaining = Math.max(0, Number(tx.amount || 0) - paidAfter);
  const payment: TransactionPayment = {
    id: `pmt-${now.getTime()}`,
    transactionId: tx.id,
    amount: input.amount,
    paymentDate: input.date,
    accountId: input.accountId,
    paymentMethod: input.paymentMethod,
    notes: (input.notes || '').trim() || `Pagamento via ${input.paymentMethod}`,
    isDiscountOrDeduction: false,
    createdAt: now.toISOString()
  };
  return {
    ...tx,
    paidAmount: paidAfter,
    status: paidAfter >= Number(tx.amount || 0) - 0.01 ? TransactionStatus.PAGO : TransactionStatus.PARCIAL,
    paymentDate: input.date,
    accountId: input.accountId,
    paymentMethod: input.paymentMethod,
    notes: tx.notes ? `${tx.notes}\nBaixa de ${input.amount.toFixed(2)}. Saldo restante: ${remaining.toFixed(2)}.` : `Baixa de ${input.amount.toFixed(2)}. Saldo restante: ${remaining.toFixed(2)}.`,
    payments: [...(tx.payments || []), payment]
  };
}
