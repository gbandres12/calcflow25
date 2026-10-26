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
  isDeduction?: boolean;
}

/**
 * Retorna true apenas quando a forma de pagamento indica um abatimento comercial,
 * desconto, devolução ou permuta SEM movimentação financeira em conta/caixa.
 * Pagamentos reais (PIX, Dinheiro, TED/DOC, Boleto, Cartão, Cheque) retornam false.
 */
export function isNonCashPaymentMethod(paymentMethod?: string | null): boolean {
  const pm = String(paymentMethod || '').trim();
  if (!pm) return false;
  return /(abatimento|desconto|devolu[cç][aã]o|quebra|permuta|barter|sem\s*caixa)/i.test(pm);
}

/**
 * Determina se um recibo de pedido (PaymentReceipt) representa um desconto/abatimento
 * não-financeiro (que reduz o saldo do pedido sem entrar dinheiro na conta bancária).
 * Nota: no ERP, `receipt.type === 'ABATIMENTO'` é usado para todo pagamento parcial
 * após a 1ª entrada (inclusive via PIX/TED/Dinheiro), portanto NÃO significa desconto sem caixa
 * a menos que `isDiscountOrDeduction` seja true ou a forma de pagamento seja não-financeira.
 */
export function isReceiptNonCashDeduction(
  receipt: Pick<PaymentReceipt, 'type' | 'paymentMethod' | 'notes'> & { isDiscountOrDeduction?: boolean }
): boolean {
  if (Boolean(receipt.isDiscountOrDeduction)) return true;
  if (isNonCashPaymentMethod(receipt.paymentMethod)) return true;
  return false;
}

/**
 * Fallback para transações antigas/avulsas que não possuem array `payments[]`.
 * Ignora a expressão "Abatimento Pedido #..." na descrição quando a forma de pagamento
 * é financeira (PIX, Dinheiro, TED, Boleto, etc.) e a categoria não é de desconto/devolução.
 */
export function isNonCashTransactionFallback(
  tx: Pick<Transaction, 'category' | 'description' | 'paymentMethod'>
): boolean {
  if (isNonCashPaymentMethod(tx.paymentMethod)) return true;
  const cat = String(tx.category || '').toLowerCase();
  if (cat.includes('abatimento') || cat.includes('desconto') || cat.includes('devolu')) return true;
  const pm = String(tx.paymentMethod || '').trim();
  const isCashMethod = /^(pix|dinheiro|transfer[eê]ncia|ted|doc|boleto|cart[aã]o|cheque|dep[oó]sito)/i.test(pm);
  if (isCashMethod) return false;
  const desc = String(tx.description || '').toLowerCase();
  if (/^abatimento\s+pedido\s+#/i.test(desc.trim())) return false;
  return desc.includes('abatimento') || desc.includes('devolu');
}

/** Mesmo recibo que a tela "Receber entrada / abatimento" da venda gera. */
export function buildOrderReceipt(order: SaleOrder, customer: Customer | undefined, input: ReceiptInput, now = new Date()): PaymentReceipt {
  const paidBefore = orderReceiptsPaid(order);
  const debtBefore = orderOpenBalance(order);
  const isFirst = (order.receipts || []).length === 0;
  const isDeduction = Boolean(input.isDeduction || isNonCashPaymentMethod(input.paymentMethod));
  const kind = isDeduction ? 'ABATIMENTO' : (isFirst ? 'ENTRADA' : 'ABATIMENTO');
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
    description: `${isFirst && !isDeduction ? 'Entrada' : 'Abatimento'} Pedido #${order.reference}`,
    type: kind,
    isDiscountOrDeduction: isDeduction,
    totalOrderAmount: order.total,
    totalPaidSoFar: paidBefore + input.amount,
    remainingDebt: Math.max(0, debtBefore - input.amount),
    notes: (input.notes || '').trim(),
    ...(isDeduction ? { isDiscountOrDeduction: true } : {})
  };
}

/** Baixa (total ou parcial) numa conta a receber avulsa — mesmo formato da tela de liquidar. */
export function settleReceivable(tx: Transaction, input: ReceiptInput, now = new Date()): Transaction {
  const paidAfter = Number(tx.paidAmount || 0) + input.amount;
  const remaining = Math.max(0, Number(tx.amount || 0) - paidAfter);
  const isDeduction = Boolean(input.isDeduction || isNonCashPaymentMethod(input.paymentMethod));
  const payment: TransactionPayment = {
    id: `pmt-${now.getTime()}`,
    transactionId: tx.id,
    amount: input.amount,
    paymentDate: input.date,
    accountId: input.accountId,
    paymentMethod: input.paymentMethod,
    notes: (input.notes || '').trim() || (isDeduction ? 'Abatimento concedido' : `Pagamento via ${input.paymentMethod}`),
    isDiscountOrDeduction: isDeduction,
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
