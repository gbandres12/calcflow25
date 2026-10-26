import {
  Customer,
  FinancialAccount,
  OrderStatus,
  SaleOrder,
  Transaction,
  TransactionStatus,
  TransactionType
} from '../../types';
import { ParsedNfDocument } from '../nfeDocumentParser';

export interface InstallmentDraft {
  id: string;
  number: number;
  dupCode: string;
  dueDate: string; // YYYY-MM-DD
  amount: number;
  status: TransactionStatus.PENDENTE | TransactionStatus.PAGO;
  paymentMethod: string;
  notes?: string;
}

export type InstallmentPreset = 'AVISTA' | '30' | '30_60' | '30_60_90' | '15_30_45' | 'CUSTOM';

export const addDaysISO = (baseDateStr: string, days: number): string => {
  const clean = (baseDateStr || '').slice(0, 10);
  const parts = clean.split('-').map(Number);
  const date = parts.length === 3 && !parts.some(isNaN)
    ? new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0))
    : new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const splitAmountIntoInstallments = (total: number, count: number): number[] => {
  const safeCount = Math.max(1, Math.floor(count || 1));
  const totalCents = Math.round(Math.max(0, Number(total || 0)) * 100);
  const baseCents = Math.floor(totalCents / safeCount);
  const remainder = totalCents - baseCents * safeCount;
  return Array.from({ length: safeCount }, (_, idx) => {
    const cents = idx === safeCount - 1 ? baseCents + remainder : baseCents;
    return Number((cents / 100).toFixed(2));
  });
};

export const generateInstallmentsFromPreset = (
  totalAmount: number,
  baseDateStr: string,
  preset: InstallmentPreset,
  paymentMethod = 'Boleto Bancário',
  customCount = 3,
  customStepDays = 30
): InstallmentDraft[] => {
  const offsets: number[] =
    preset === 'AVISTA' ? [0] :
    preset === '30' ? [30] :
    preset === '30_60' ? [30, 60] :
    preset === '30_60_90' ? [30, 60, 90] :
    preset === '15_30_45' ? [15, 30, 45] :
    Array.from({ length: Math.max(1, customCount) }, (_, i) => (i + 1) * Math.max(1, customStepDays));

  const amounts = splitAmountIntoInstallments(totalAmount, offsets.length);

  return offsets.map((daysOffset, idx) => ({
    id: `inst-${idx + 1}-${Date.now()}`,
    number: idx + 1,
    dupCode: String(idx + 1).padStart(3, '0'),
    dueDate: addDaysISO(baseDateStr, daysOffset),
    amount: amounts[idx],
    status: TransactionStatus.PENDENTE,
    paymentMethod
  }));
};

export const buildInstallmentsFromNf = (
  doc: ParsedNfDocument,
  fallbackDateStr: string
): { installments: InstallmentDraft[]; fromXmlDuplicatas: boolean } => {
  const baseDate = (doc.issuedAt || '').slice(0, 10) || fallbackDateStr;
  const method = doc.paymentMethod || 'Boleto Bancário';

  if (doc.duplicatas && doc.duplicatas.length > 0) {
    return {
      fromXmlDuplicatas: true,
      installments: doc.duplicatas.map((dup, idx) => ({
        id: `dup-${idx + 1}-${Date.now()}`,
        number: idx + 1,
        dupCode: dup.nDup || String(idx + 1).padStart(3, '0'),
        dueDate: dup.dVenc || addDaysISO(baseDate, (idx + 1) * 30),
        amount: Number(dup.vDup.toFixed(2)),
        status: TransactionStatus.PENDENTE,
        paymentMethod: method
      }))
    };
  }

  const total = Number(doc.vNF || doc.vProd || 0);
  return {
    fromXmlDuplicatas: false,
    installments: generateInstallmentsFromPreset(total, baseDate, '30', method)
  };
};

const cleanDigits = (v?: string) => (v || '').replace(/\D/g, '');

export const findDuplicateNfeTransactions = (
  transactions: Transaction[],
  doc: ParsedNfDocument | null
): Transaction[] => {
  if (!doc) return [];
  const key = cleanDigits(doc.accessKey);
  const nfNum = (doc.nfNumber || '').trim();
  const supCnpj = cleanDigits(doc.supplierDocument);

  return transactions.filter((tx) => {
    if (key && key.length === 44) {
      if (cleanDigits(tx.nfeChave) === key) return true;
      if (tx.notes && tx.notes.includes(key)) return true;
    }
    if (nfNum && supCnpj) {
      const sameNf = tx.nfeNumero === nfNum || tx.description?.includes(`NF ${nfNum}`) || tx.description?.includes(`NF-e ${nfNum}`);
      const sameSup = cleanDigits(tx.supplierCnpj) === supCnpj;
      if (sameNf && sameSup) return true;
    }
    return false;
  });
};

export const matchSupplierCustomer = (
  customers: Customer[],
  doc: ParsedNfDocument | null
): Customer | undefined => {
  if (!doc) return undefined;
  const supDoc = cleanDigits(doc.supplierDocument);
  if (supDoc) {
    const byDoc = customers.find((c) => cleanDigits(c.document) === supDoc);
    if (byDoc) return byDoc;
  }
  const supName = (doc.supplier || '').trim().toLowerCase();
  if (supName) {
    return customers.find((c) => (c.name || '').trim().toLowerCase() === supName);
  }
  return undefined;
};

export const getEffectiveDueDate = (tx: Transaction): string => {
  return (tx.dueDate || tx.date || '').slice(0, 10);
};

export const getTransactionOpenBalance = (tx: Transaction): number => {
  if (tx.status === TransactionStatus.PAGO || tx.status === TransactionStatus.CONFIRMADO) {
    return 0;
  }
  const total = Number(tx.amount || 0);
  const paid = Number(tx.paidAmount || 0);
  return Number(Math.max(0, total - paid).toFixed(2));
};

export const isPayableTransaction = (tx: Transaction): boolean => {
  return tx.type === TransactionType.EXPENSE || tx.type === TransactionType.PURCHASE;
};

export const isReceivableTransaction = (tx: Transaction): boolean => {
  return tx.type === TransactionType.SALE;
};

export const calculateAvailableCashBalance = (
  accounts: FinancialAccount[],
  transactions: Transaction[]
): number => {
  let totalBalance = accounts.reduce((sum, acc) => sum + Number(acc.initialBalance || 0), 0);
  const validAccountIds = new Set(accounts.map((a) => a.id));

  transactions.forEach((t) => {
    const isPaidOrConfirmed =
      t.status === TransactionStatus.CONFIRMADO ||
      t.status === TransactionStatus.PAGO ||
      t.status === TransactionStatus.PARCIAL;

    const hasPayments = Array.isArray(t.payments) && t.payments.length > 0;

    if (hasPayments) {
      t.payments!.forEach((p) => {
        if (p.isDiscountOrDeduction) return;
        const pAccId = p.accountId || t.accountId;
        if (validAccountIds.size > 0 && pAccId && !validAccountIds.has(pAccId)) return;
        const pAmt = Number(p.amount || 0);
        if (t.type === TransactionType.SALE) {
          totalBalance += pAmt;
        } else {
          totalBalance -= pAmt;
        }
      });
    } else if (isPaidOrConfirmed) {
      const isDeduction =
        t.category?.toLowerCase().includes('abatimento') ||
        t.category?.toLowerCase().includes('devolu') ||
        t.description?.toLowerCase().includes('abatimento');
      if (isDeduction) return;
      if (validAccountIds.size > 0 && t.accountId && !validAccountIds.has(t.accountId)) return;

      const paidAmt =
        Number(
          t.paidAmount !== undefined && t.paidAmount !== null && t.paidAmount > 0
            ? t.paidAmount
            : t.status === TransactionStatus.PAGO || t.status === TransactionStatus.CONFIRMADO
            ? t.amount
            : 0
        ) || 0;

      if (t.type === TransactionType.SALE) {
        totalBalance += paidAmt;
      } else {
        totalBalance -= paidAmt;
      }
    }
  });

  return Number(totalBalance.toFixed(2));
};

export interface ProjectionTimelinePoint {
  date: string;
  label: string;
  receivables: number;
  payables: number;
  netChange: number;
  projectedBalance: number;
}

export interface CashProjectionSummary {
  availableBalance: number;
  totalReceivablesInHorizon: number;
  totalPayablesInHorizon: number;
  overdueReceivables: number;
  overduePayables: number;
  dueTodayReceivables: number;
  dueTodayPayables: number;
  projectedFinalBalance: number;
  lowestProjectedBalance: number;
  lowestBalanceDate: string | null;
  timeline: ProjectionTimelinePoint[];
}

export const buildCashProjection = (
  accounts: FinancialAccount[],
  transactions: Transaction[],
  todayStr: string,
  horizonEndStr: string,
  includeOverdueInProjection = true
): CashProjectionSummary => {
  const availableBalance = calculateAvailableCashBalance(accounts, transactions);

  let totalReceivablesInHorizon = 0;
  let totalPayablesInHorizon = 0;
  let overdueReceivables = 0;
  let overduePayables = 0;
  let dueTodayReceivables = 0;
  let dueTodayPayables = 0;

  const dailyMap = new Map<string, { receivables: number; payables: number }>();

  const ensureDay = (d: string) => {
    if (!dailyMap.has(d)) {
      dailyMap.set(d, { receivables: 0, payables: 0 });
    }
    return dailyMap.get(d)!;
  };

  ensureDay(todayStr);

  transactions.forEach((tx) => {
    const open = getTransactionOpenBalance(tx);
    if (open <= 0.009) return;

    const due = getEffectiveDueDate(tx) || todayStr;
    const isRec = isReceivableTransaction(tx);

    if (due < todayStr) {
      if (isRec) overdueReceivables += open;
      else overduePayables += open;

      if (includeOverdueInProjection) {
        if (isRec) totalReceivablesInHorizon += open;
        else totalPayablesInHorizon += open;
        const bucket = ensureDay(todayStr);
        if (isRec) bucket.receivables += open;
        else bucket.payables += open;
      }
      return;
    }

    if (due === todayStr) {
      if (isRec) dueTodayReceivables += open;
      else dueTodayPayables += open;
    }

    if (!horizonEndStr || due <= horizonEndStr) {
      if (isRec) totalReceivablesInHorizon += open;
      else totalPayablesInHorizon += open;

      const bucket = ensureDay(due);
      if (isRec) bucket.receivables += open;
      else bucket.payables += open;
    }
  });

  const sortedDates = Array.from(dailyMap.keys()).sort();
  let runningBalance = availableBalance;
  let lowestProjectedBalance = availableBalance;
  let lowestBalanceDate: string | null = null;

  const timeline: ProjectionTimelinePoint[] = sortedDates.map((date) => {
    const entry = dailyMap.get(date)!;
    const rec = Number(entry.receivables.toFixed(2));
    const pay = Number(entry.payables.toFixed(2));
    const netChange = Number((rec - pay).toFixed(2));
    runningBalance = Number((runningBalance + netChange).toFixed(2));

    if (runningBalance < lowestProjectedBalance) {
      lowestProjectedBalance = runningBalance;
      lowestBalanceDate = date;
    }

    const parts = date.split('-');
    const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : date;

    return {
      date,
      label,
      receivables: rec,
      payables: pay,
      netChange,
      projectedBalance: runningBalance
    };
  });

  const projectedFinalBalance = Number(
    (availableBalance + totalReceivablesInHorizon - totalPayablesInHorizon).toFixed(2)
  );

  return {
    availableBalance,
    totalReceivablesInHorizon: Number(totalReceivablesInHorizon.toFixed(2)),
    totalPayablesInHorizon: Number(totalPayablesInHorizon.toFixed(2)),
    overdueReceivables: Number(overdueReceivables.toFixed(2)),
    overduePayables: Number(overduePayables.toFixed(2)),
    dueTodayReceivables: Number(dueTodayReceivables.toFixed(2)),
    dueTodayPayables: Number(dueTodayPayables.toFixed(2)),
    projectedFinalBalance,
    lowestProjectedBalance,
    lowestBalanceDate,
    timeline
  };
};

export const findUnprojectedOrders = (
  orders: SaleOrder[],
  transactions: Transaction[]
): SaleOrder[] => {
  const orderIdsWithTx = new Set(
    transactions.map((t) => t.orderId).filter((id): id is string => Boolean(id))
  );
  return orders.filter((order) => {
    if (order.status !== OrderStatus.FINALIZED) return false;
    if (orderIdsWithTx.has(order.id)) return false;
    const hasRefTx =
      order.reference &&
      transactions.some((t) => t.description?.includes(order.reference));
    if (hasRefTx) return false;
    return Number(order.total || 0) > 0;
  });
};
