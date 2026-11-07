import {
  CostCenter,
  PurchaseOrder,
  Transaction,
  TransactionStatus,
  TransactionType
} from '../../types';
import { isNonCashTransactionFallback } from '../receiptLink';

export type BudgetHealthStatus = 'SAUDAVEL' | 'ATENCAO' | 'ESTOURO' | 'SEM_VERBA';

export interface CostCenterConsumedItem {
  id: string;
  source: 'PAID_TX' | 'PENDING_TX' | 'COMMITTED_PO';
  date: string;
  description: string;
  category: string;
  contactName?: string;
  reference?: string;
  amount: number;
}

export interface CostCenterBudgetMetrics {
  costCenter: CostCenter;
  yearMonth: string;
  budget: number;
  alertThresholdPercent: number;
  paidAmount: number;
  pendingPayableAmount: number;
  committedPoAmount: number;
  totalConsumed: number;
  remainingBudget: number;
  overrunAmount: number;
  usagePercent: number;
  paidPercentOfBudget: number;
  pendingPercentOfBudget: number;
  committedPercentOfBudget: number;
  status: BudgetHealthStatus;
  items: CostCenterConsumedItem[];
  categoryBreakdown: Array<{ category: string; amount: number; percent: number }>;
}

export interface CostCenterGlobalSummary {
  yearMonth: string;
  totalBudget: number;
  totalPaid: number;
  totalPendingPayable: number;
  totalCommittedPo: number;
  totalConsumed: number;
  totalRemaining: number;
  globalUsagePercent: number;
  centersInAlertCount: number;
  centersInOverrunCount: number;
  byCenter: CostCenterBudgetMetrics[];
}

export function getEffectiveBudgetForMonth(costCenter: CostCenter, yearMonth: string): number {
  if (
    costCenter.monthlyOverrides &&
    yearMonth &&
    Object.prototype.hasOwnProperty.call(costCenter.monthlyOverrides, yearMonth)
  ) {
    return Math.max(0, Number(costCenter.monthlyOverrides[yearMonth]) || 0);
  }
  return Math.max(0, Number(costCenter.monthlyBudget) || 0);
}

export function resolveCostCenterIdForRecord(
  record: { costCenterId?: string; costCenter?: string; costCenterName?: string },
  costCenters: CostCenter[]
): string {
  if (record.costCenterId) {
    const byId = costCenters.find((c) => c.id === record.costCenterId);
    if (byId) return byId.id;
  }
  const rawName = (record.costCenter || record.costCenterName || '').trim().toLowerCase();
  if (rawName) {
    const byName = costCenters.find(
      (c) => c.name.trim().toLowerCase() === rawName || c.id.toLowerCase() === rawName
    );
    if (byName) return byName.id;
  }
  return record.costCenterId || costCenters[0]?.id || 'cc1';
}

function matchesYearMonth(dateStr: string | undefined, yearMonth: string): boolean {
  if (!yearMonth) return true;
  if (!dateStr) return false;
  return String(dateStr).trim().slice(0, 7) === yearMonth;
}

/**
 * Verifica se uma Ordem de Compra já foi convertida em título(s) no Contas a Pagar
 * para evitar dupla contagem entre "Comprometido em OC" e "A Pagar / Pago".
 */
export function isPurchaseOrderAlreadyInTransactions(
  po: PurchaseOrder,
  transactions: Transaction[]
): boolean {
  if (po.status === 'RECEBIDA') return true;
  if (Array.isArray(po.generatedTransactionIds) && po.generatedTransactionIds.length > 0) {
    return true;
  }
  return transactions.some((tx) => tx.purchaseOrderId === po.id);
}

export function computeCostCenterBudgetSummary(params: {
  costCenters: CostCenter[];
  transactions: Transaction[];
  purchaseOrders: PurchaseOrder[];
  yearMonth: string;
}): CostCenterGlobalSummary {
  const { costCenters, transactions, purchaseOrders, yearMonth } = params;
  const activeCenters = costCenters.filter((c) => c.isActive !== false);

  const paidMap = new Map<string, number>();
  const pendingMap = new Map<string, number>();
  const committedMap = new Map<string, number>();
  const itemsMap = new Map<string, CostCenterConsumedItem[]>();
  const catMap = new Map<string, Map<string, number>>();

  for (const cc of activeCenters) {
    paidMap.set(cc.id, 0);
    pendingMap.set(cc.id, 0);
    committedMap.set(cc.id, 0);
    itemsMap.set(cc.id, []);
    catMap.set(cc.id, new Map());
  }

  const addCat = (ccId: string, category: string, amount: number) => {
    if (amount <= 0) return;
    const m = catMap.get(ccId);
    if (!m) return;
    const catKey = (category || 'Outras Despesas Operacionais').trim();
    m.set(catKey, (m.get(catKey) || 0) + amount);
  };

  // 1. Processar Transações de Saída (PURCHASE e EXPENSE)
  for (const tx of transactions) {
    if (tx.type === TransactionType.SALE) continue;
    const ccId = resolveCostCenterIdForRecord(tx, activeCenters);
    if (!paidMap.has(ccId)) continue;

    const totalTxAmount = Math.max(0, Number(tx.amount) || 0);
    if (totalTxAmount <= 0) continue;

    // 1a. Parcela Paga no mês selecionado
    let paidInMonth = 0;
    let paidDateRef = tx.paymentDate || tx.date;

    if (Array.isArray(tx.payments) && tx.payments.length > 0) {
      for (const pmt of tx.payments) {
        if (pmt.isDiscountOrDeduction) continue;
        const pDate = pmt.paymentDate || tx.paymentDate || tx.date;
        if (matchesYearMonth(pDate, yearMonth)) {
          paidInMonth += Math.max(0, Number(pmt.amount) || 0);
          paidDateRef = pDate;
        }
      }
    } else {
      const isPaidStatus =
        tx.status === TransactionStatus.CONFIRMADO ||
        tx.status === TransactionStatus.PAGO ||
        tx.status === TransactionStatus.PARCIAL;

      if (isPaidStatus && !isNonCashTransactionFallback(tx)) {
        const effDate = tx.paymentDate || tx.date;
        if (matchesYearMonth(effDate, yearMonth)) {
          paidInMonth =
            tx.paidAmount !== undefined && tx.paidAmount !== null && tx.paidAmount > 0
              ? Number(tx.paidAmount)
              : tx.status === TransactionStatus.CONFIRMADO || tx.status === TransactionStatus.PAGO
                ? totalTxAmount
                : 0;
          paidDateRef = effDate;
        }
      }
    }

    if (paidInMonth > 0.009) {
      paidMap.set(ccId, (paidMap.get(ccId) || 0) + paidInMonth);
      addCat(ccId, tx.category, paidInMonth);
      itemsMap.get(ccId)?.push({
        id: `${tx.id}-paid`,
        source: 'PAID_TX',
        date: paidDateRef,
        description: tx.description,
        category: tx.category || 'Despesa',
        contactName: tx.contactName,
        reference: tx.purchaseOrderReference || tx.documentNumber || tx.nfeNumero,
        amount: paidInMonth
      });
    }

    // 1b. Saldo A Pagar (Previsto) com vencimento ou competência no mês selecionado
    const isFullyPaid =
      tx.status === TransactionStatus.PAGO || tx.status === TransactionStatus.CONFIRMADO;
    if (!isFullyPaid) {
      const totalPaidEver = Array.isArray(tx.payments) && tx.payments.length > 0
        ? tx.payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
        : Number(tx.paidAmount) || 0;
      const openBalance = Math.max(0, totalTxAmount - totalPaidEver - (Number(tx.discount) || 0));
      const dueRef = tx.dueDate || tx.date;
      if (openBalance > 0.009 && matchesYearMonth(dueRef, yearMonth)) {
        pendingMap.set(ccId, (pendingMap.get(ccId) || 0) + openBalance);
        addCat(ccId, tx.category, openBalance);
        itemsMap.get(ccId)?.push({
          id: `${tx.id}-pending`,
          source: 'PENDING_TX',
          date: dueRef,
          description: tx.description,
          category: tx.category || 'Contas a Pagar',
          contactName: tx.contactName,
          reference: tx.purchaseOrderReference || tx.documentNumber || tx.nfeNumero,
          amount: openBalance
        });
      }
    }
  }

  // 2. Processar Ordens de Compra Aprovadas que ainda não viraram Transação
  for (const po of purchaseOrders) {
    if (po.status !== 'APROVADA') continue;
    if (isPurchaseOrderAlreadyInTransactions(po, transactions)) continue;

    const poDateRef = po.firstDueDate || po.expectedDeliveryDate || po.date;
    if (!matchesYearMonth(poDateRef, yearMonth) && !matchesYearMonth(po.date, yearMonth)) {
      continue;
    }

    const ccId = resolveCostCenterIdForRecord(po, activeCenters);
    if (!committedMap.has(ccId)) continue;

    const poTotal = Math.max(0, Number(po.total) || 0);
    if (poTotal <= 0) continue;

    committedMap.set(ccId, (committedMap.get(ccId) || 0) + poTotal);
    addCat(ccId, po.category, poTotal);
    itemsMap.get(ccId)?.push({
      id: po.id,
      source: 'COMMITTED_PO',
      date: po.date,
      description: `OC ${po.reference} · ${po.items.map((i) => i.description).join(', ').slice(0, 65)}`,
      category: po.category || 'Ordem de Compra',
      contactName: po.supplierName,
      reference: po.reference,
      amount: poTotal
    });
  }

  // 3. Consolidar métricas por Centro de Custo
  let totalBudget = 0;
  let totalPaid = 0;
  let totalPendingPayable = 0;
  let totalCommittedPo = 0;
  let centersInAlertCount = 0;
  let centersInOverrunCount = 0;

  const byCenter: CostCenterBudgetMetrics[] = activeCenters.map((cc) => {
    const budget = getEffectiveBudgetForMonth(cc, yearMonth);
    const alertThresholdPercent = Number(cc.alertThresholdPercent) || 80;
    const paidAmount = paidMap.get(cc.id) || 0;
    const pendingPayableAmount = pendingMap.get(cc.id) || 0;
    const committedPoAmount = committedMap.get(cc.id) || 0;
    const totalConsumed = paidAmount + pendingPayableAmount + committedPoAmount;
    const remainingBudget = Math.max(0, budget - totalConsumed);
    const overrunAmount = Math.max(0, totalConsumed - budget);
    const usagePercent = budget > 0 ? (totalConsumed / budget) * 100 : 0;

    let status: BudgetHealthStatus = 'SAUDAVEL';
    if (budget <= 0) {
      status = 'SEM_VERBA';
    } else if (totalConsumed > budget + 0.01) {
      status = 'ESTOURO';
      centersInOverrunCount += 1;
    } else if (usagePercent >= alertThresholdPercent) {
      status = 'ATENCAO';
      centersInAlertCount += 1;
    }

    totalBudget += budget;
    totalPaid += paidAmount;
    totalPendingPayable += pendingPayableAmount;
    totalCommittedPo += committedPoAmount;

    const rawCats = catMap.get(cc.id) || new Map<string, number>();
    const categoryBreakdown = Array.from(rawCats.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        percent: totalConsumed > 0 ? (amount / totalConsumed) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    const items = (itemsMap.get(cc.id) || []).sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || ''))
    );

    return {
      costCenter: cc,
      yearMonth,
      budget,
      alertThresholdPercent,
      paidAmount,
      pendingPayableAmount,
      committedPoAmount,
      totalConsumed,
      remainingBudget,
      overrunAmount,
      usagePercent,
      paidPercentOfBudget: budget > 0 ? Math.min(100, (paidAmount / budget) * 100) : 0,
      pendingPercentOfBudget: budget > 0 ? Math.min(100, (pendingPayableAmount / budget) * 100) : 0,
      committedPercentOfBudget: budget > 0 ? Math.min(100, (committedPoAmount / budget) * 100) : 0,
      status,
      items,
      categoryBreakdown
    };
  });

  const totalConsumed = totalPaid + totalPendingPayable + totalCommittedPo;
  const totalRemaining = Math.max(0, totalBudget - totalConsumed);
  const globalUsagePercent = totalBudget > 0 ? (totalConsumed / totalBudget) * 100 : 0;

  return {
    yearMonth,
    totalBudget,
    totalPaid,
    totalPendingPayable,
    totalCommittedPo,
    totalConsumed,
    totalRemaining,
    globalUsagePercent,
    centersInAlertCount,
    centersInOverrunCount,
    byCenter
  };
}

export interface PurchaseOrderBudgetSimulation {
  costCenterName: string;
  budget: number;
  currentConsumed: number;
  orderAmount: number;
  projectedConsumed: number;
  projectedRemaining: number;
  projectedOverrun: number;
  currentPercent: number;
  projectedPercent: number;
  projectedStatus: BudgetHealthStatus;
}

/**
 * Simula em tempo real o impacto de uma Ordem de Compra (nova ou em edição)
 * sobre a verba mensal do Centro de Custo escolhido.
 */
export function simulatePurchaseOrderBudgetImpact(params: {
  costCenterId: string;
  orderAmount: number;
  editingOrderId?: string;
  yearMonth: string;
  costCenters: CostCenter[];
  transactions: Transaction[];
  purchaseOrders: PurchaseOrder[];
}): PurchaseOrderBudgetSimulation {
  const {
    costCenterId,
    orderAmount,
    editingOrderId,
    yearMonth,
    costCenters,
    transactions,
    purchaseOrders
  } = params;

  const filteredPos = editingOrderId
    ? purchaseOrders.filter((po) => po.id !== editingOrderId)
    : purchaseOrders;

  const summary = computeCostCenterBudgetSummary({
    costCenters,
    transactions,
    purchaseOrders: filteredPos,
    yearMonth
  });

  const targetMetrics =
    summary.byCenter.find((m) => m.costCenter.id === costCenterId) || summary.byCenter[0];

  const budget = targetMetrics?.budget || 0;
  const alertThreshold = targetMetrics?.alertThresholdPercent || 80;
  const currentConsumed = targetMetrics?.totalConsumed || 0;
  const safeOrderAmount = Math.max(0, Number(orderAmount) || 0);
  const projectedConsumed = currentConsumed + safeOrderAmount;
  const projectedRemaining = Math.max(0, budget - projectedConsumed);
  const projectedOverrun = Math.max(0, projectedConsumed - budget);
  const currentPercent = budget > 0 ? (currentConsumed / budget) * 100 : 0;
  const projectedPercent = budget > 0 ? (projectedConsumed / budget) * 100 : 0;

  let projectedStatus: BudgetHealthStatus = 'SAUDAVEL';
  if (budget <= 0) {
    projectedStatus = 'SEM_VERBA';
  } else if (projectedConsumed > budget + 0.01) {
    projectedStatus = 'ESTOURO';
  } else if (projectedPercent >= alertThreshold) {
    projectedStatus = 'ATENCAO';
  }

  return {
    costCenterName: targetMetrics?.costCenter.name || 'Centro de Custo',
    budget,
    currentConsumed,
    orderAmount: safeOrderAmount,
    projectedConsumed,
    projectedRemaining,
    projectedOverrun,
    currentPercent,
    projectedPercent,
    projectedStatus
  };
}
