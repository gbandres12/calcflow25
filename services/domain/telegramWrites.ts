import {
  Customer,
  InventoryItem,
  OrderStatus,
  PaymentReceipt,
  SaleOrder,
  SaleOrderItem,
  Transaction,
  TransactionPayment,
  TransactionStatus,
  TransactionType
} from '../../types.js';
import { newId, nextOrderReference, nextQuoteReference } from '../ids.js';
import { productSheetFromInventory } from '../../utils/salesOrderProduct.js';

/**
 * Regras de escrita do agente do Telegram.
 *
 * Tudo aqui é aditivo e puro: recebe os registros atuais e devolve os registros
 * a gravar, sem tocar em estoque nem disparar efeito colateral. Os dois pontos
 * que sustentam a segurança disso vivem no App.tsx e continuam intocados:
 *
 * 1. applyReceiptToFinance ignora recibo cujo id já esteja em alguma transação
 *    do pedido (t.receiptId), então gravar o receiptId aqui evita lançamento
 *    duplicado quando o app abrir.
 * 2. handleAddOrder só chama finalizeSale quando o status é FINALIZED, então
 *    pedido criado como Orçamento não mexe em estoque nem no financeiro.
 */

export const TOLERANCE = 0.01;

export type PaymentKind = 'PAGAMENTO' | 'ABATIMENTO';

/** Texto reconhecido pelo DailyFinancialReport para separar abatimento de baixa. */
export const DEDUCTION_METHOD = 'Abatimento / Devolução';

export interface OpenInstallment {
  transactionId: string;
  description: string;
  amount: number;
  paidAmount: number;
  outstanding: number;
  dueDate?: string;
  orderId?: string;
  customerId?: string;
  status: TransactionStatus;
}

const toNumber = (value: any): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

export const outstandingOf = (transaction: Transaction): number =>
  Math.max(0, round2(toNumber(transaction?.amount) - toNumber(transaction?.paidAmount)));

/** Parcelas de venda ainda em aberto, da mais antiga para a mais recente. */
export function listOpenInstallments(
  transactions: Transaction[],
  filter: { orderId?: string; customerId?: string } = {}
): OpenInstallment[] {
  return (transactions || [])
    .filter((transaction) => {
      if (!transaction || transaction.type !== TransactionType.SALE) return false;
      if (filter.orderId && transaction.orderId !== filter.orderId) return false;
      if (filter.customerId && transaction.customerId !== filter.customerId) return false;
      return outstandingOf(transaction) > TOLERANCE;
    })
    .sort((a, b) => String(a.dueDate || a.date || '').localeCompare(String(b.dueDate || b.date || '')))
    .map((transaction) => ({
      transactionId: transaction.id,
      description: transaction.description,
      amount: round2(toNumber(transaction.amount)),
      paidAmount: round2(toNumber(transaction.paidAmount)),
      outstanding: outstandingOf(transaction),
      dueDate: transaction.dueDate || transaction.date,
      orderId: transaction.orderId,
      customerId: transaction.customerId,
      status: transaction.status
    }));
}

export interface ApplyPaymentInput {
  amount: number;
  kind: PaymentKind;
  date: string;
  accountId: string;
  paymentMethod?: string;
  notes?: string;
  receiptId?: string;
  /** Quem pediu o lançamento no chat, para a trilha de auditoria. */
  requestedBy?: string;
}

/**
 * Acrescenta o pagamento à parcela escolhida e recalcula saldo e status.
 * Mesma regra do handleSubmit do ReceivePayDialog, que é append puro.
 */
export function applyPaymentToTransaction(
  transaction: Transaction,
  input: ApplyPaymentInput
): Transaction {
  if (!transaction) throw new Error('Parcela não encontrada.');

  const amount = round2(toNumber(input.amount));
  if (amount <= 0) throw new Error('Informe um valor maior que zero.');

  const outstanding = outstandingOf(transaction);
  if (amount > outstanding + TOLERANCE) {
    throw new Error(
      `O valor de ${formatBRL(amount)} é maior que o saldo em aberto da parcela (${formatBRL(outstanding)}).`
    );
  }

  const isDeduction = input.kind === 'ABATIMENTO';
  const paymentMethod = isDeduction ? DEDUCTION_METHOD : input.paymentMethod || 'PIX';
  const paidAmount = round2(toNumber(transaction.paidAmount) + amount);
  const total = round2(toNumber(transaction.amount));

  const payment: TransactionPayment = {
    id: newId('pmt'),
    transactionId: transaction.id,
    amount,
    paymentDate: input.date,
    accountId: input.accountId || transaction.accountId,
    paymentMethod,
    notes: input.notes || (isDeduction ? 'Abatimento registrado pelo Telegram' : 'Baixa registrada pelo Telegram'),
    isDiscountOrDeduction: isDeduction,
    createdAt: new Date().toISOString()
  };

  const remaining = Math.max(0, round2(total - paidAmount));
  const historyLine = `[${formatDateBR(input.date)}] ${isDeduction ? 'Abatimento' : 'Baixa'} de ${formatBRL(amount)} via Telegram${
    input.requestedBy ? ` por ${input.requestedBy}` : ''
  }. Saldo restante: ${formatBRL(remaining)}.`;

  return {
    ...transaction,
    paidAmount,
    status: paidAmount >= total - TOLERANCE ? TransactionStatus.PAGO : TransactionStatus.PARCIAL,
    paymentDate: input.date,
    accountId: input.accountId || transaction.accountId,
    paymentMethod,
    // Desarma a reaplicação do recibo pelo applyReceiptToFinance quando o app abrir.
    receiptId: input.receiptId || transaction.receiptId,
    notes: transaction.notes ? `${transaction.notes}\n${historyLine}` : historyLine,
    payments: [...(transaction.payments || []), payment]
  };
}

export const newReceiptId = (): string =>
  `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

export interface BuildReceiptInput {
  order?: SaleOrder | null;
  customer?: Customer | null;
  amount: number;
  kind: PaymentKind;
  date: string;
  accountId: string;
  accountName?: string;
  paymentMethod?: string;
  notes?: string;
  receivedBy?: string;
  receiptId?: string;
}

/** Recibo no formato que o RegisterPaymentModal já grava no pedido. */
export function buildPaymentReceipt(input: BuildReceiptInput): PaymentReceipt {
  const amount = round2(toNumber(input.amount));
  const order = input.order || null;
  const isDeduction = input.kind === 'ABATIMENTO';
  const orderTotal = round2(toNumber(order?.total));
  const paidSoFar = round2(totalReceipts(order) + amount);

  return {
    id: input.receiptId || newReceiptId(),
    orderId: order?.id,
    orderReference: order?.reference,
    customerId: input.customer?.id || order?.customerId || '',
    customerName: input.customer?.name || 'Cliente',
    customerDocument: input.customer?.document,
    amount,
    date: input.date,
    paymentMethod: isDeduction ? DEDUCTION_METHOD : input.paymentMethod || 'PIX',
    accountId: input.accountId,
    accountName: input.accountName || 'Caixa Geral',
    receivedBy: input.receivedBy || 'Agente Telegram',
    description: order
      ? `${isDeduction ? 'Abatimento' : 'Recebimento'} Pedido #${order.reference}`
      : `${isDeduction ? 'Abatimento' : 'Recebimento'} avulso`,
    type: isDeduction ? 'ABATIMENTO' : order ? 'PARCELA' : 'AVULSO',
    totalOrderAmount: orderTotal || undefined,
    totalPaidSoFar: paidSoFar,
    remainingDebt: orderTotal ? Math.max(0, round2(orderTotal - paidSoFar)) : undefined,
    notes: input.notes
  };
}

export const totalReceipts = (order?: SaleOrder | null): number =>
  round2((order?.receipts || []).reduce((sum, receipt) => sum + toNumber(receipt?.amount), 0));

export function appendReceiptToOrder(order: SaleOrder, receipt: PaymentReceipt): SaleOrder {
  const alreadyThere = (order.receipts || []).some((item) => item?.id === receipt.id);
  if (alreadyThere) return order;
  return { ...order, receipts: [...(order.receipts || []), receipt] };
}

export interface BudgetItemInput {
  productId: string;
  quantity: number;
  unitPrice?: number;
  discount?: number;
}

export interface BuildBudgetOrderInput {
  companyId: string;
  customer: Customer;
  items: BudgetItemInput[];
  inventory: InventoryItem[];
  existingOrders: SaleOrder[];
  sellerName?: string;
  notes?: string;
  date?: string;
}

function buildOrderItems(input: { items: BudgetItemInput[]; inventory: InventoryItem[] }): SaleOrderItem[] {
  if (!input.items?.length) throw new Error('Informe ao menos um produto.');

  return input.items.map((line) => {
    const product = (input.inventory || []).find((item) => item.id === line.productId);
    if (!product) throw new Error(`Produto ${line.productId} não encontrado no estoque.`);

    const quantity = round2(toNumber(line.quantity));
    if (quantity <= 0) throw new Error(`Informe a quantidade de ${product.name}.`);

    const unitPrice = round2(line.unitPrice != null ? toNumber(line.unitPrice) : toNumber(product.unitPrice));
    if (unitPrice <= 0) throw new Error(`Informe o preço unitário de ${product.name}.`);

    const discount = round2(toNumber(line.discount));
    return {
      productId: product.id,
      productCode: product.code || product.id,
      productName: product.name,
      productDescription: product.name,
      unit: product.unit || 'Ton',
      quantity,
      unitPrice,
      discount,
      total: round2(quantity * unitPrice - discount),
      ncm: product.ncm,
      cfop: product.cfop,
      cst: product.cst
    };
  });
}

/**
 * Pedido em Orçamento: não baixa estoque nem gera financeiro, porque o
 * handleAddOrder do app só chama finalizeSale quando o status é FINALIZED.
 */
export function buildBudgetOrder(input: BuildBudgetOrderInput): SaleOrder {
  if (!input.customer?.id) throw new Error('Informe o cliente do orçamento.');
  const items = buildOrderItems(input);
  const subtotal = round2(items.reduce((sum, item) => sum + toNumber(item.total), 0));
  const date = input.date || new Date().toISOString().split('T')[0];

  return {
    id: newId('ord'),
    reference: nextQuoteReference(input.existingOrders || []),
    customerId: input.customer.id,
    sellerName: input.sellerName || 'Agente Telegram',
    date,
    items,
    subtotal,
    discount: 0,
    shipping: 0,
    total: subtotal,
    status: OrderStatus.BUDGET,
    payments: [],
    receipts: [],
    withdrawals: [],
    notes: input.notes,
    companyId: input.companyId
  };
}

export interface BuildSaleOrderInput extends BuildBudgetOrderInput {
  accountId?: string;
  paymentMethod?: string;
}

/**
 * Pedido de venda confirmado: mesma regra do finalizeSale do app.
 * Quem grava estoque e financeiro é o commitAction, com as funções puras abaixo.
 */
export function buildSaleOrder(input: BuildSaleOrderInput): SaleOrder {
  if (!input.customer?.id) throw new Error('Informe o cliente do pedido.');
  const items = buildOrderItems(input);
  const subtotal = round2(items.reduce((sum, item) => sum + toNumber(item.total), 0));
  const date = input.date || new Date().toISOString().split('T')[0];
  const accountId = input.accountId || 'acc-1';
  const sheet =
    items.length > 1
      ? {
          title: 'Informações complementares do pedido',
          body: 'Consulte a tabela de itens acima para descrição de cada produto.'
        }
      : productSheetFromInventory(input.inventory.find((item) => item.id === items[0]?.productId));

  return {
    id: newId('ord'),
    reference: nextOrderReference(input.existingOrders || []),
    customerId: input.customer.id,
    sellerName: input.sellerName || 'Agente Telegram',
    date,
    items,
    productSheetTitle: sheet.title,
    productSheetBody: sheet.body,
    subtotal,
    discount: 0,
    shipping: 0,
    total: subtotal,
    status: OrderStatus.FINALIZED,
    paymentMethod: input.paymentMethod || 'A combinar',
    paymentStatus: 'pendente',
    paidAmount: 0,
    remainingAmount: subtotal,
    payments: [
      {
        id: newId('pay'),
        amount: subtotal,
        paidAmount: 0,
        date,
        status: TransactionStatus.PENDENTE,
        accountId,
        description: 'Saldo em aberto da venda',
        paymentMethod: input.paymentMethod
      }
    ],
    receipts: [],
    withdrawals: [],
    notes: input.notes,
    companyId: input.companyId
  };
}

export function applySaleStock(inventory: InventoryItem[], items: SaleOrderItem[]): InventoryItem[] {
  const used = new Map<string, number>();
  for (const item of items || []) {
    used.set(item.productId, round2((used.get(item.productId) || 0) + toNumber(item.quantity)));
  }

  return (inventory || []).map((product) => {
    const qty = used.get(product.id);
    if (!qty) return product;
    return { ...product, quantity: Math.max(0, round2(toNumber(product.quantity) - qty)) };
  });
}

export function stockAfterSale(inventory: InventoryItem[], items: SaleOrderItem[], productId: string): number {
  const product = (inventory || []).find((item) => item.id === productId);
  const used = (items || [])
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + toNumber(item.quantity), 0);
  return Math.max(0, round2(toNumber(product?.quantity) - used));
}

export function buildOpenSaleTransaction(order: SaleOrder, accountId: string, date: string): Transaction {
  return {
    id: newId('tx'),
    accountId: accountId || 'acc-1',
    costCenterId: 'cc4',
    date,
    dueDate: date,
    type: TransactionType.SALE,
    status: TransactionStatus.PENDENTE,
    description: `Venda Faturada #${order.reference}`,
    category: 'Venda Calcário Moído Granel',
    amount: round2(toNumber(order.total)),
    paidAmount: 0,
    customerId: order.customerId,
    orderId: order.id,
    payments: []
  };
}

export function applySaleToCustomer(customer: Customer, order: SaleOrder): Customer {
  return {
    ...customer,
    totalSpent: round2(toNumber(customer.totalSpent) + toNumber(order.total))
  };
}

export interface ReconciliationIssue {
  orderId: string;
  reference: string;
  receiptsTotal: number;
  paymentsTotal: number;
  difference: number;
}

/**
 * Conferência do /conferir: por pedido, a soma dos recibos deve bater com a
 * soma dos pagamentos das transações. Divergência aponta recibo que não virou
 * baixa (ou o contrário).
 */
export function reconcileReceiptsAgainstPayments(
  orders: SaleOrder[],
  transactions: Transaction[]
): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];

  for (const order of orders || []) {
    if (!order || order.status !== OrderStatus.FINALIZED) continue;

    const receiptsTotal = totalReceipts(order);
    const paymentsTotal = round2(
      (transactions || [])
        .filter((transaction) => transaction?.orderId === order.id && transaction.type === TransactionType.SALE)
        .reduce(
          (sum, transaction) =>
            sum + (transaction.payments || []).reduce((inner, payment) => inner + toNumber(payment?.amount), 0),
          0
        )
    );

    const difference = round2(receiptsTotal - paymentsTotal);
    if (Math.abs(difference) > TOLERANCE) {
      issues.push({
        orderId: order.id,
        reference: order.reference,
        receiptsTotal,
        paymentsTotal,
        difference
      });
    }
  }

  return issues;
}

export function formatBRL(value: number): string {
  return toNumber(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDateBR(isoDate: string): string {
  const [year, month, day] = String(isoDate || '').split('-');
  return day && month && year ? `${day}/${month}/${year}` : String(isoDate || '');
}
