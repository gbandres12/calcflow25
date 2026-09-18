import {
  FinancialAccount,
  PaymentReceipt,
  SaleOrder,
  Transaction,
  TransactionPayment,
  TransactionStatus,
  TransactionType,
} from '../types';

const EPS = 0.01;

export const money = (value?: number) => Number(value) || 0;

export function cashFromPayments(
  transaction: Pick<Transaction, 'payments' | 'accountId'>,
  accountId?: string
): number {
  return (transaction.payments || [])
    .filter((payment) => !payment.isDiscountOrDeduction)
    .filter((payment) => !accountId || (payment.accountId || transaction.accountId) === accountId)
    .reduce((sum, payment) => sum + money(payment.amount), 0);
}

export function appliedAmount(transaction: Pick<Transaction, 'payments' | 'paidAmount'>): number {
  const fromPayments = (transaction.payments || []).reduce((sum, payment) => sum + money(payment.amount), 0);
  if (fromPayments > 0) return fromPayments;
  return money(transaction.paidAmount);
}

export function titleBalance(transaction: Pick<Transaction, 'amount' | 'payments' | 'paidAmount'>): number {
  return Math.max(0, money(transaction.amount) - appliedAmount(transaction));
}

export function isReceivable(transaction: Pick<Transaction, 'type'>): boolean {
  return transaction.type === TransactionType.SALE;
}

export function isPayable(transaction: Pick<Transaction, 'type'>): boolean {
  return transaction.type === TransactionType.EXPENSE || transaction.type === TransactionType.PURCHASE;
}

export function canonicalTitleStatus(
  transaction: Pick<Transaction, 'amount' | 'payments' | 'paidAmount' | 'dueDate' | 'status'>,
  today = new Date().toISOString().slice(0, 10)
): TransactionStatus {
  const remaining = titleBalance(transaction);
  const total = money(transaction.amount);
  if (total > EPS && remaining <= EPS) return TransactionStatus.PAGO;
  if (remaining < total - EPS && remaining > EPS) {
    if (transaction.dueDate && transaction.dueDate < today) return TransactionStatus.ATRASADO;
    return TransactionStatus.PARCIAL;
  }
  if (transaction.dueDate && transaction.dueDate < today && remaining > EPS) return TransactionStatus.ATRASADO;
  return TransactionStatus.PENDENTE;
}

export function syncPaidAmount<T extends Pick<Transaction, 'payments' | 'paidAmount' | 'amount' | 'dueDate' | 'status'>>(
  transaction: T,
  today = new Date().toISOString().slice(0, 10)
): T {
  const paidAmount = appliedAmount(transaction);
  return {
    ...transaction,
    paidAmount,
    status: canonicalTitleStatus({ ...transaction, paidAmount }, today),
  };
}

export function cashOnDate(
  transactions: Transaction[],
  date: string,
  accountId?: string
): { inflow: number; outflow: number; deductions: number } {
  let inflow = 0;
  let outflow = 0;
  let deductions = 0;
  transactions.forEach((transaction) => {
    (transaction.payments || []).forEach((payment) => {
      const paymentDate = payment.paymentDate || transaction.paymentDate || transaction.date;
      if (paymentDate !== date) return;
      if (accountId && (payment.accountId || transaction.accountId) !== accountId) return;
      const amount = money(payment.amount);
      if (payment.isDiscountOrDeduction) {
        deductions += amount;
        return;
      }
      if (isReceivable(transaction)) inflow += amount;
      else if (isPayable(transaction)) outflow += amount;
    });
  });
  return { inflow, outflow, deductions };
}

export function cashInPeriod(
  transactions: Transaction[],
  startDate?: string,
  endDate?: string,
  accountId?: string
): { inflow: number; outflow: number } {
  let inflow = 0;
  let outflow = 0;
  transactions.forEach((transaction) => {
    (transaction.payments || []).forEach((payment) => {
      if (payment.isDiscountOrDeduction) return;
      const paymentDate = payment.paymentDate || transaction.paymentDate || transaction.date;
      if (startDate && paymentDate < startDate) return;
      if (endDate && paymentDate > endDate) return;
      if (accountId && (payment.accountId || transaction.accountId) !== accountId) return;
      const amount = money(payment.amount);
      if (isReceivable(transaction)) inflow += amount;
      else if (isPayable(transaction)) outflow += amount;
    });
  });
  return { inflow, outflow };
}

export function accountLedgerBalance(account: FinancialAccount, transactions: Transaction[]): number {
  const { inflow, outflow } = cashInPeriod(transactions, undefined, undefined, account.id);
  return money(account.initialBalance) + inflow - outflow;
}

export function openBooks(transactions: Transaction[]) {
  const receivable = transactions.filter((tx) => isReceivable(tx) && titleBalance(tx) > EPS && tx.nfeAmbiente !== 'sandbox');
  const payable = transactions.filter((tx) => isPayable(tx) && titleBalance(tx) > EPS && tx.nfeAmbiente !== 'sandbox');
  return {
    receivableOpen: receivable.reduce((sum, tx) => sum + titleBalance(tx), 0),
    payableOpen: payable.reduce((sum, tx) => sum + titleBalance(tx), 0),
    receivableOverdue: receivable
      .filter((tx) => canonicalTitleStatus(tx) === TransactionStatus.ATRASADO)
      .reduce((sum, tx) => sum + titleBalance(tx), 0),
    payableOverdue: payable
      .filter((tx) => canonicalTitleStatus(tx) === TransactionStatus.ATRASADO)
      .reduce((sum, tx) => sum + titleBalance(tx), 0),
    receivable,
    payable,
  };
}

export function orderSettledFromReceipts(order?: SaleOrder | null): number {
  if (!order) return 0;
  return (order.receipts || []).reduce((sum, receipt) => sum + money(receipt.amount), 0);
}

export function orderRemainingDebt(order?: SaleOrder | null): number {
  if (!order) return 0;
  return Math.max(0, money(order.total) - orderSettledFromReceipts(order));
}

export function receiptAlreadyPosted(transactions: Transaction[], receiptId?: string): boolean {
  if (!receiptId) return false;
  return transactions.some((transaction) =>
    (transaction.payments || []).some((payment) => payment.receiptId === receiptId) ||
    transaction.receiptId === receiptId
  );
}

export function competenceKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function recurringOriginKey(companyId: string, billId: string, competence: string): string {
  return `recurring:${companyId}:${billId}:${competence}`;
}

export function payrollOriginKey(companyId: string, employeeId: string, competence: string): string {
  return `payroll:${companyId}:${employeeId}:${competence}`;
}

export function dueDateForDay(dueDay: number, date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(Math.max(1, dueDay), lastDay);
  return new Date(year, month, day).toISOString().slice(0, 10);
}

export function isHomologFinanceSkip(order: Pick<SaleOrder, 'nfeAmbiente' | 'nfes'>): boolean {
  if (order.nfeAmbiente === 'sandbox') return true;
  return (order.nfes || []).some((nfe) => nfe.nfeAmbiente === 'sandbox');
}

export function receiptKindIsDeduction(type?: PaymentReceipt['type']): boolean {
  return type === 'ABATIMENTO';
}

export function paymentFromReceipt(
  receipt: PaymentReceipt,
  transactionId: string,
  appliedAmountValue: number
): TransactionPayment {
  const deduction = receiptKindIsDeduction(receipt.type);
  return {
    id: `pmt-${receipt.id}-${appliedAmountValue}`,
    transactionId,
    amount: appliedAmountValue,
    paymentDate: receipt.date,
    accountId: receipt.accountId || '',
    paymentMethod: deduction ? 'Abatimento / Devolução' : (receipt.paymentMethod || 'PIX'),
    notes: receipt.notes || receipt.description,
    isDiscountOrDeduction: deduction,
    createdAt: new Date().toISOString(),
    receiptId: receipt.id,
    origin: deduction ? 'abatimento' : 'receipt',
  };
}
