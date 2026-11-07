import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CostCenter,
  PurchaseOrder,
  Transaction,
  TransactionStatus,
  TransactionType
} from '../../types';
import {
  computeCostCenterBudgetSummary,
  getEffectiveBudgetForMonth,
  simulatePurchaseOrderBudgetImpact
} from './costCenterBudget';

const SAMPLE_CENTERS: CostCenter[] = [
  {
    id: 'cc5',
    code: 'CC-05',
    name: 'Manutenção Eletromecânica',
    color: '#EF4444',
    monthlyBudget: 50000,
    monthlyOverrides: { '2026-12': 75000 },
    alertThresholdPercent: 80,
    isActive: true
  },
  {
    id: 'cc3',
    code: 'CC-03',
    name: 'Frota, Pátio & Balança',
    color: '#F59E0B',
    monthlyBudget: 40000,
    alertThresholdPercent: 80,
    isActive: true
  }
];

describe('cálculo de verba e consumo por Centro de Custo', () => {
  it('respeita teto mensal padrão e sobrescrita por mês específico (monthlyOverrides)', () => {
    assert.equal(getEffectiveBudgetForMonth(SAMPLE_CENTERS[0], '2026-10'), 50000);
    assert.equal(getEffectiveBudgetForMonth(SAMPLE_CENTERS[0], '2026-12'), 75000);
  });

  it('soma as 3 camadas (Pago + A Pagar + Comprometido em OC aprovada)', () => {
    const transactions: Transaction[] = [
      {
        id: 'tx-paid',
        accountId: 'acc-1',
        costCenterId: 'cc5',
        date: '2026-10-05',
        paymentDate: '2026-10-05',
        type: TransactionType.EXPENSE,
        status: TransactionStatus.PAGO,
        description: 'Rolamentos Moinho',
        category: 'Manutenção de Britador e Moinho',
        amount: 12000,
        paidAmount: 12000
      },
      {
        id: 'tx-pending',
        accountId: 'acc-1',
        costCenterId: 'cc5',
        date: '2026-10-10',
        dueDate: '2026-10-25',
        type: TransactionType.PURCHASE,
        status: TransactionStatus.PENDENTE,
        description: 'Correias Industriais',
        category: 'Peças de Desgaste e Telas',
        amount: 8000,
        paidAmount: 0
      }
    ];

    const purchaseOrders: PurchaseOrder[] = [
      {
        id: 'po-approved',
        reference: 'OC-2026-0001',
        date: '2026-10-12',
        status: 'APROVADA',
        priority: 'ALTA',
        costCenterId: 'cc5',
        category: 'Peças de Desgaste e Telas',
        requesterName: 'Roberto',
        supplierName: 'Metso',
        items: [{ id: 'i1', description: 'Mandíbula', quantity: 1, unit: 'JG', unitPrice: 22000, total: 22000 }],
        subtotal: 22000,
        discount: 0,
        shipping: 0,
        total: 22000
      },
      {
        id: 'po-draft',
        reference: 'OC-2026-0002',
        date: '2026-10-14',
        status: 'AGUARDANDO_APROVACAO',
        priority: 'NORMAL',
        costCenterId: 'cc5',
        category: 'Peças de Desgaste e Telas',
        requesterName: 'Roberto',
        supplierName: 'Fornecedor B',
        items: [{ id: 'i2', description: 'Parafusos', quantity: 10, unit: 'UN', unitPrice: 100, total: 1000 }],
        subtotal: 1000,
        discount: 0,
        shipping: 0,
        total: 1000
      }
    ];

    const summary = computeCostCenterBudgetSummary({
      costCenters: SAMPLE_CENTERS,
      transactions,
      purchaseOrders,
      yearMonth: '2026-10'
    });

    const cc5 = summary.byCenter.find((c) => c.costCenter.id === 'cc5')!;
    assert.equal(cc5.paidAmount, 12000);
    assert.equal(cc5.pendingPayableAmount, 8000);
    assert.equal(cc5.committedPoAmount, 22000, 'Apenas OC APROVADA não faturada entra em comprometido');
    assert.equal(cc5.totalConsumed, 42000);
    assert.equal(cc5.remainingBudget, 8000);
    assert.equal(cc5.usagePercent, 84);
    assert.equal(cc5.status, 'ATENCAO', '84% >= 80% deve acionar status ATENCAO');
  });

  it('não duplica valor quando OC aprovada é recebida e vira título no Contas a Pagar', () => {
    const purchaseOrders: PurchaseOrder[] = [
      {
        id: 'po-received',
        reference: 'OC-2026-0010',
        date: '2026-10-15',
        status: 'RECEBIDA',
        priority: 'NORMAL',
        costCenterId: 'cc3',
        category: 'Lubrificantes e Graxas Industriais',
        requesterName: 'Marcos',
        supplierName: 'Tapajós Lubrificantes',
        items: [{ id: 'i1', description: 'Óleo 68', quantity: 2, unit: 'TB', unitPrice: 5000, total: 10000 }],
        subtotal: 10000,
        discount: 0,
        shipping: 0,
        total: 10000,
        generatedTransactionIds: ['tx-from-po']
      }
    ];

    const transactions: Transaction[] = [
      {
        id: 'tx-from-po',
        accountId: 'acc-1',
        costCenterId: 'cc3',
        purchaseOrderId: 'po-received',
        purchaseOrderReference: 'OC-2026-0010',
        date: '2026-10-16',
        dueDate: '2026-10-30',
        type: TransactionType.PURCHASE,
        status: TransactionStatus.PENDENTE,
        description: 'Compra ref. OC-2026-0010',
        category: 'Lubrificantes e Graxas Industriais',
        amount: 10000,
        paidAmount: 0
      }
    ];

    const summary = computeCostCenterBudgetSummary({
      costCenters: SAMPLE_CENTERS,
      transactions,
      purchaseOrders,
      yearMonth: '2026-10'
    });

    const cc3 = summary.byCenter.find((c) => c.costCenter.id === 'cc3')!;
    assert.equal(cc3.committedPoAmount, 0, 'OC já recebida não fica em comprometido');
    assert.equal(cc3.pendingPayableAmount, 10000, 'Valor agora consta apenas em A Pagar');
    assert.equal(cc3.totalConsumed, 10000);
  });

  it('simula estouro de verba ao criar nova Ordem de Compra', () => {
    const sim = simulatePurchaseOrderBudgetImpact({
      costCenterId: 'cc3',
      orderAmount: 45000,
      yearMonth: '2026-10',
      costCenters: SAMPLE_CENTERS,
      transactions: [],
      purchaseOrders: []
    });

    assert.equal(sim.budget, 40000);
    assert.equal(sim.projectedConsumed, 45000);
    assert.equal(sim.projectedOverrun, 5000);
    assert.equal(sim.projectedStatus, 'ESTOURO');
  });
});
