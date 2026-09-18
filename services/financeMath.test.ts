import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appliedAmount,
  canonicalTitleStatus,
  cashFromPayments,
  cashOnDate,
  isHomologFinanceSkip,
  orderRemainingDebt,
  orderSettledFromReceipts,
  payrollOriginKey,
  receiptAlreadyPosted,
  recurringOriginKey,
  titleBalance,
} from './financeMath';
import { OrderStatus, TransactionStatus, TransactionType } from '../types';

describe('financeMath', () => {
  it('não trata título pendente como caixa', () => {
    const openSale = {
      id: 'tx-open',
      accountId: 'acc-1',
      date: '2026-09-01',
      type: TransactionType.SALE,
      status: TransactionStatus.PENDENTE,
      description: 'Venda',
      category: 'Venda',
      amount: 1000,
      paidAmount: 0,
      payments: [],
    };
    assert.equal(cashFromPayments(openSale), 0);
    assert.equal(titleBalance(openSale), 1000);
    assert.equal(canonicalTitleStatus(openSale, '2026-09-18'), TransactionStatus.PENDENTE);
  });

  it('abatimento reduz saldo e não entra no caixa', () => {
    const partial = {
      id: 'tx-open',
      accountId: 'acc-1',
      date: '2026-09-01',
      type: TransactionType.SALE,
      status: TransactionStatus.PARCIAL,
      description: 'Venda',
      category: 'Venda',
      amount: 1000,
      paidAmount: 300,
      payments: [
        { id: 'p1', transactionId: 'tx-open', amount: 200, paymentDate: '2026-09-10', accountId: 'acc-1', paymentMethod: 'PIX' },
        { id: 'p2', transactionId: 'tx-open', amount: 100, paymentDate: '2026-09-12', accountId: 'acc-1', paymentMethod: 'Abatimento', isDiscountOrDeduction: true, receiptId: 'REC-1' },
      ],
    };
    assert.equal(cashFromPayments(partial), 200);
    assert.equal(appliedAmount(partial), 300);
    assert.equal(titleBalance(partial), 700);
    assert.equal(cashOnDate([partial], '2026-09-12').deductions, 100);
    assert.equal(receiptAlreadyPosted([partial], 'REC-1'), true);
  });

  it('pedido pago só por recibos, não pela agenda', () => {
    assert.equal(orderSettledFromReceipts({
      id: 'o',
      reference: 'P',
      customerId: 'c',
      sellerName: 's',
      date: '2026-09-01',
      items: [],
      subtotal: 1000,
      discount: 0,
      shipping: 0,
      total: 1000,
      status: OrderStatus.FINALIZED,
      payments: [{ id: 'pay', amount: 1000, date: '2026-09-01', status: TransactionStatus.CONFIRMADO, accountId: 'acc-1' }],
      receipts: [{ id: 'r', customerId: 'c', customerName: 'C', amount: 150, date: '2026-09-01', paymentMethod: 'PIX', description: 'e', type: 'ENTRADA' }],
    }), 150);
    assert.equal(orderRemainingDebt({
      id: 'o',
      reference: 'P',
      customerId: 'c',
      sellerName: 's',
      date: '2026-09-01',
      items: [],
      subtotal: 1000,
      discount: 0,
      shipping: 0,
      total: 1000,
      status: OrderStatus.FINALIZED,
      payments: [],
      receipts: [
        { id: 'r', customerId: 'c', customerName: 'C', amount: 150, date: '2026-09-01', paymentMethod: 'PIX', description: 'e', type: 'ENTRADA' },
        { id: 'a', customerId: 'c', customerName: 'C', amount: 50, date: '2026-09-02', paymentMethod: 'Abatimento', description: 'a', type: 'ABATIMENTO' },
      ],
    }), 800);
  });

  it('homologação e chaves de competência', () => {
    assert.equal(isHomologFinanceSkip({ nfeAmbiente: 'sandbox', nfes: [] }), true);
    assert.equal(recurringOriginKey('c1', 'bill-1', '2026-09'), 'recurring:c1:bill-1:2026-09');
    assert.equal(payrollOriginKey('c1', 'emp-1', '2026-09'), 'payroll:c1:emp-1:2026-09');
  });
});
