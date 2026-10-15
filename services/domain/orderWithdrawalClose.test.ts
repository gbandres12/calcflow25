import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeOrderWithdrawals, adjustOrderForOverWithdrawal } from './orderWithdrawalClose';
import { OrderStatus, SaleOrder, Transaction, TransactionStatus, TransactionType } from '../../types';

test('closeOrderWithdrawals: keep_contracted apenas marca retiradas como fechadas', () => {
  const order: SaleOrder = {
    id: 'ord-1',
    reference: 'PED-2026-0001',
    customerId: 'cust-1',
    sellerName: 'Vendedor',
    date: '15/10/2026',
    subtotal: 1440,
    discount: 0,
    shipping: 0,
    total: 1440,
    status: OrderStatus.FINALIZED,
    items: [{ productId: 'moido', productCode: '001', productName: 'Calcário Moído', unit: 'TON', quantity: 8, unitPrice: 180, discount: 0, total: 1440 }],
    payments: [],
    withdrawals: [{ id: 'w-1', orderId: 'ord-1', date: '15/10/2026', driverName: 'Carlos', plateNumber: 'ABC-1234', quantityWithdrawn: 7.85 }]
  };

  const result = closeOrderWithdrawals(order, [], {
    mode: 'keep_contracted',
    operatorName: 'Balança 1'
  });

  assert.equal(result.updatedOrder.withdrawalsClosed, true);
  assert.equal(result.updatedOrder.total, 1440);
  assert.equal(result.updatedOrder.items[0].quantity, 8);
  assert.equal(result.deltaMoney, 0);
  assert.equal(result.deltaQuantity, 0);
});

test('closeOrderWithdrawals: adjust_to_withdrawn reduz quantidade e corta parcelas pendentes sem tocar em pagas', () => {
  const order: SaleOrder = {
    id: 'ord-1',
    reference: 'PED-2026-0001',
    customerId: 'cust-1',
    sellerName: 'Vendedor',
    date: '15/10/2026',
    subtotal: 1440,
    discount: 0,
    shipping: 0,
    total: 1440,
    status: OrderStatus.FINALIZED,
    items: [{ productId: 'moido', productCode: '001', productName: 'Calcário Moído', unit: 'TON', quantity: 8, unitPrice: 180, discount: 0, total: 1440 }],
    payments: [],
    withdrawals: [{ id: 'w-1', orderId: 'ord-1', date: '15/10/2026', driverName: 'Carlos', plateNumber: 'ABC-1234', quantityWithdrawn: 7.85 }]
  };

  // 7.85t * 180 = 1413. Diferença = -27
  // Cliente já pagou 1000 no caixa (CONFIRMADO) e tem 440 a receber (PENDENTE)
  const transactions: Transaction[] = [
    {
      id: 'tx-1',
      date: '15/10/2026',
      description: 'Venda ord-1',
      category: 'Vendas',
      accountId: 'acc-1',
      type: TransactionType.SALE,
      status: TransactionStatus.CONFIRMADO,
      amount: 1000,
      paidAmount: 1000,
      orderId: 'ord-1'
    },
    {
      id: 'tx-2',
      date: '15/10/2026',
      description: 'Venda ord-1',
      category: 'Vendas',
      accountId: 'acc-1',
      type: TransactionType.SALE,
      status: TransactionStatus.PENDENTE,
      amount: 440,
      paidAmount: 0,
      orderId: 'ord-1'
    }
  ];

  const result = closeOrderWithdrawals(order, transactions, {
    mode: 'adjust_to_withdrawn',
    operatorName: 'Balança 1'
  });

  assert.equal(result.updatedOrder.withdrawalsClosed, true);
  assert.equal(result.updatedOrder.items[0].quantity, 7.85);
  assert.equal(result.updatedOrder.total, 1413);
  assert.equal(result.deltaQuantity, -0.15);
  assert.equal(result.deltaMoney, -27);

  // A transação tx-1 (paga de 1000) não pode ser tocada
  assert.equal(result.updatedTransactions.find(t => t.id === 'tx-1'), undefined);
  // A transação tx-2 (pendente de 440) foi reduzida de 27 para 413
  const updatedTx2 = result.updatedTransactions.find(t => t.id === 'tx-2');
  assert.ok(updatedTx2);
  assert.equal(updatedTx2.amount, 413);
});

test('adjustOrderForOverWithdrawal: ajusta carga excedente e gera transação pendente proporcional', () => {
  const order: SaleOrder = {
    id: 'ord-2',
    reference: 'PED-2026-0002',
    customerId: 'cust-1',
    sellerName: 'Vendedor',
    date: '15/10/2026',
    subtotal: 1440,
    discount: 0,
    shipping: 0,
    total: 1440,
    status: OrderStatus.FINALIZED,
    items: [{ productId: 'moido', productCode: '001', productName: 'Calcário Moído', unit: 'TON', quantity: 8, unitPrice: 180, discount: 0, total: 1440 }],
    payments: [],
    withdrawals: []
  };

  // Carregou 8.42 t (excedente de 0.42 t)
  const result = adjustOrderForOverWithdrawal(order, 8.42, 0.42, 'tx-new-over', '15/10/2026');

  assert.equal(result.exceededQuantity, 0.42);
  // 0.42 * 180 = 75.60
  assert.equal(result.additionalCost, 75.6);
  assert.equal(result.updatedOrder.items[0].quantity, 8.42);
  assert.equal(result.updatedOrder.total, 1515.6);
  assert.ok(result.newTransaction);
  assert.equal(result.newTransaction?.amount, 75.6);
  assert.equal(result.newTransaction?.status, TransactionStatus.PENDENTE);
});
