import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  Customer,
  InventoryItem,
  OrderStatus,
  SaleOrder,
  Transaction,
  TransactionStatus,
  TransactionType
} from '../../types';
import {
  DEDUCTION_METHOD,
  appendReceiptToOrder,
  applyPaymentToTransaction,
  applySaleStock,
  buildBudgetOrder,
  buildOpenSaleTransaction,
  buildPaymentReceipt,
  buildSaleOrder,
  listOpenInstallments,
  reconcileReceiptsAgainstPayments
} from './telegramWrites';

const baseTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1',
  accountId: 'acc-1',
  date: '2026-09-01',
  dueDate: '2026-09-10',
  type: TransactionType.SALE,
  status: TransactionStatus.PENDENTE,
  description: 'Parcela 1/2 - Pedido PED-2026-0001',
  category: 'Venda Calcário Moído Granel',
  amount: 10000,
  paidAmount: 0,
  orderId: 'ord-1',
  customerId: 'cust-1',
  ...overrides
});

const baseOrder = (overrides: Partial<SaleOrder> = {}): SaleOrder => ({
  id: 'ord-1',
  reference: 'PED-2026-0001',
  customerId: 'cust-1',
  sellerName: 'Vendedor',
  date: '2026-09-01',
  items: [],
  subtotal: 20000,
  discount: 0,
  shipping: 0,
  total: 20000,
  status: OrderStatus.FINALIZED,
  payments: [],
  receipts: [],
  ...overrides
});

describe('telegram: baixa e abatimento na parcela escolhida', () => {
  it('baixa parcial soma ao pago e deixa a parcela em PARCIAL', () => {
    const updated = applyPaymentToTransaction(baseTransaction(), {
      amount: 4000,
      kind: 'PAGAMENTO',
      date: '2026-09-18',
      accountId: 'acc-1',
      paymentMethod: 'PIX',
      receiptId: 'REC-2026-1234'
    });

    assert.equal(updated.paidAmount, 4000);
    assert.equal(updated.status, TransactionStatus.PARCIAL);
    assert.equal(updated.payments?.length, 1);
    assert.equal(updated.payments?.[0].amount, 4000);
    assert.equal(updated.payments?.[0].isDiscountOrDeduction, false);
  });

  it('quitação exata fecha a parcela como PAGO', () => {
    const updated = applyPaymentToTransaction(baseTransaction({ paidAmount: 6000 }), {
      amount: 4000,
      kind: 'PAGAMENTO',
      date: '2026-09-18',
      accountId: 'acc-1'
    });

    assert.equal(updated.paidAmount, 10000);
    assert.equal(updated.status, TransactionStatus.PAGO);
  });

  it('recusa valor maior que o saldo em aberto da parcela', () => {
    assert.throws(
      () =>
        applyPaymentToTransaction(baseTransaction({ paidAmount: 9000 }), {
          amount: 2000,
          kind: 'PAGAMENTO',
          date: '2026-09-18',
          accountId: 'acc-1'
        }),
      /maior que o saldo em aberto/
    );
  });

  it('recusa valor zerado ou negativo', () => {
    assert.throws(
      () =>
        applyPaymentToTransaction(baseTransaction(), {
          amount: 0,
          kind: 'PAGAMENTO',
          date: '2026-09-18',
          accountId: 'acc-1'
        }),
      /maior que zero/
    );
  });

  it('abatimento usa o método que o relatório diário reconhece', () => {
    const updated = applyPaymentToTransaction(baseTransaction(), {
      amount: 500,
      kind: 'ABATIMENTO',
      date: '2026-09-18',
      accountId: 'acc-1',
      paymentMethod: 'PIX'
    });

    assert.equal(updated.payments?.[0].paymentMethod, DEDUCTION_METHOD);
    assert.equal(updated.payments?.[0].isDiscountOrDeduction, true);
    assert.ok(DEDUCTION_METHOD.toLowerCase().includes('abatimento'));
  });

  it('grava o receiptId na parcela, que é o que impede o app de lançar de novo', () => {
    const updated = applyPaymentToTransaction(baseTransaction(), {
      amount: 1000,
      kind: 'PAGAMENTO',
      date: '2026-09-18',
      accountId: 'acc-1',
      receiptId: 'REC-2026-4321'
    });

    assert.equal(updated.receiptId, 'REC-2026-4321');
  });
});

describe('telegram: parcelas em aberto', () => {
  it('lista só venda com saldo, da mais antiga para a mais nova', () => {
    const transactions = [
      baseTransaction({ id: 'tx-2', dueDate: '2026-10-10', amount: 5000, paidAmount: 0 }),
      baseTransaction({ id: 'tx-1', dueDate: '2026-09-10', amount: 5000, paidAmount: 0 }),
      baseTransaction({ id: 'tx-3', dueDate: '2026-08-10', amount: 5000, paidAmount: 5000 }),
      baseTransaction({ id: 'tx-4', type: TransactionType.EXPENSE, dueDate: '2026-07-10' })
    ];

    const open = listOpenInstallments(transactions, { orderId: 'ord-1' });
    assert.deepEqual(
      open.map((item) => item.transactionId),
      ['tx-1', 'tx-2']
    );
    assert.equal(open[0].outstanding, 5000);
  });
});

describe('telegram: recibo no pedido', () => {
  it('monta recibo de abatimento com saldo devedor recalculado', () => {
    const order = baseOrder({
      receipts: [
        {
          id: 'REC-2026-0001',
          customerId: 'cust-1',
          customerName: 'Fazenda Boa Vista',
          amount: 5000,
          date: '2026-09-10',
          paymentMethod: 'PIX',
          description: 'Entrada',
          type: 'ENTRADA'
        }
      ]
    });

    const receipt = buildPaymentReceipt({
      order,
      customer: { id: 'cust-1', name: 'Fazenda Boa Vista' } as Customer,
      amount: 3000,
      kind: 'ABATIMENTO',
      date: '2026-09-18',
      accountId: 'acc-1'
    });

    assert.equal(receipt.type, 'ABATIMENTO');
    assert.equal(receipt.totalPaidSoFar, 8000);
    assert.equal(receipt.remainingDebt, 12000);
    assert.equal(receipt.paymentMethod, DEDUCTION_METHOD);
  });

  it('não duplica o mesmo recibo no pedido', () => {
    const order = baseOrder();
    const receipt = buildPaymentReceipt({
      order,
      customer: { id: 'cust-1', name: 'Fazenda Boa Vista' } as Customer,
      amount: 1000,
      kind: 'PAGAMENTO',
      date: '2026-09-18',
      accountId: 'acc-1',
      receiptId: 'REC-2026-9999'
    });

    const once = appendReceiptToOrder(order, receipt);
    const twice = appendReceiptToOrder(once, receipt);
    assert.equal(twice.receipts?.length, 1);
  });
});

describe('telegram: orçamento', () => {
  const inventory: InventoryItem[] = [
    {
      id: 'moido',
      name: 'Calcário Agrícola Moído (Granel)',
      quantity: 500,
      unitPrice: 180,
      minStock: 200,
      unit: 'Ton',
      observacoesFiscais: 'Peneira 50 e peneira 10 conforme análise.',
      informacoesComplementares: 'PRNT mínimo garantido: 80%. MgO mínimo garantido: 14%.'
    }
  ];

  it('cria pedido em Orçamento, que não dispara estoque nem financeiro no app', () => {
    const order = buildBudgetOrder({
      companyId: 'comp-1',
      customer: { id: 'cust-1', name: 'Fazenda Boa Vista' } as Customer,
      items: [{ productId: 'moido', quantity: 30 }],
      inventory,
      existingOrders: [{ reference: 'ORC-2026-0003' } as SaleOrder]
    });

    assert.equal(order.status, OrderStatus.BUDGET);
    assert.equal(order.reference, 'ORC-2026-0004');
    assert.equal(order.total, 5400);
    assert.equal(order.items[0].unit, 'Ton');
    assert.deepEqual(order.payments, []);
  });

  it('pedido de venda usa PED, baixa estoque e abre parcela', () => {
    const order = buildSaleOrder({
      companyId: 'comp-1',
      customer: { id: 'cust-1', name: 'Gabriel Lima Andres' } as Customer,
      items: [{ productId: 'moido', quantity: 50, unitPrice: 160 }],
      inventory,
      existingOrders: [{ reference: 'PED-2026-0012' } as SaleOrder],
      accountId: 'acc-1'
    });

    assert.equal(order.status, OrderStatus.FINALIZED);
    assert.equal(order.reference, 'PED-2026-0013');
    assert.equal(order.total, 8000);
    assert.equal(order.productSheetTitle, 'Calcário Agrícola Moído');
    assert.equal(order.productSheetBody, '');
    assert.equal(order.payments[0].status, TransactionStatus.PENDENTE);
    assert.equal(order.payments[0].amount, 8000);

    const nextStock = applySaleStock(inventory, order.items);
    assert.equal(nextStock[0].quantity, 450);

    const tx = buildOpenSaleTransaction(order, 'acc-1', '2026-09-19');
    assert.equal(tx.type, TransactionType.SALE);
    assert.equal(tx.amount, 8000);
    assert.equal(tx.paidAmount, 0);
    assert.equal(tx.orderId, order.id);
  });

  it('recusa produto fora do estoque cadastrado', () => {
    assert.throws(
      () =>
        buildBudgetOrder({
          companyId: 'comp-1',
          customer: { id: 'cust-1', name: 'Fazenda' } as Customer,
          items: [{ productId: 'inexistente', quantity: 10 }],
          inventory,
          existingOrders: []
        }),
      /não encontrado no estoque/
    );
  });
});

describe('telegram: conferência de recibos contra pagamentos', () => {
  it('aponta pedido cujo recibo não virou baixa', () => {
    const orders = [
      baseOrder({
        receipts: [
          {
            id: 'REC-2026-0001',
            customerId: 'cust-1',
            customerName: 'Fazenda',
            amount: 5000,
            date: '2026-09-18',
            paymentMethod: 'PIX',
            description: 'Parcela',
            type: 'PARCELA'
          }
        ]
      })
    ];

    const issues = reconcileReceiptsAgainstPayments(orders, [baseTransaction()]);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].difference, 5000);
  });

  it('fica em silêncio quando recibo e pagamento batem', () => {
    const transaction = applyPaymentToTransaction(baseTransaction(), {
      amount: 5000,
      kind: 'PAGAMENTO',
      date: '2026-09-18',
      accountId: 'acc-1',
      receiptId: 'REC-2026-0001'
    });

    const orders = [
      baseOrder({
        receipts: [
          {
            id: 'REC-2026-0001',
            customerId: 'cust-1',
            customerName: 'Fazenda',
            amount: 5000,
            date: '2026-09-18',
            paymentMethod: 'PIX',
            description: 'Parcela',
            type: 'PARCELA'
          }
        ]
      })
    ];

    assert.deepEqual(reconcileReceiptsAgainstPayments(orders, [transaction]), []);
  });
});
