import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildOrderReceipt,
  isNonCashPaymentMethod,
  isNonCashTransactionFallback,
  isReceiptNonCashDeduction,
  openOrdersForReceipt,
  openReceivables,
  orderOpenBalance,
  settleReceivable
} from './receiptLink';
import { OrderStatus, TransactionStatus, TransactionType } from '../types';

const order = (over: any = {}) => ({
  id: 'o1', reference: 'VENDA-1', customerId: 'c1', date: '2026-09-01',
  total: 1000, status: OrderStatus.FINALIZED, receipts: [], items: [], ...over
}) as any;

describe('vínculo de recebimento com venda/conta', () => {
  it('lista só vendas confirmadas com saldo e ignora orçamento, quitada e avulsa fiscal', () => {
    const list = openOrdersForReceipt([
      order({ id: 'a' }),
      order({ id: 'b', status: OrderStatus.BUDGET }),
      order({ id: 'c', receipts: [{ amount: 1000 }] }),
      order({ id: 'd', reference: 'PED-1#AV#x', isAvulsa: true }),
      order({ id: 'e', status: OrderStatus.CANCELLED })
    ]);
    assert.deepEqual(list.map(o => o.id), ['a']);
  });

  it('recibo: primeiro é ENTRADA, depois ABATIMENTO, e calcula saldo sem marcar PIX como desconto sem caixa', () => {
    const r1 = buildOrderReceipt(order(), undefined, { amount: 400, date: '2026-10-05', paymentMethod: 'PIX', accountId: 'acc' });
    assert.equal(r1.type, 'ENTRADA');
    assert.equal(r1.remainingDebt, 600);
    assert.equal(r1.totalPaidSoFar, 400);
    assert.equal(r1.isDiscountOrDeduction, false);
    assert.equal(isReceiptNonCashDeduction(r1), false);
    const o2 = order({ receipts: [r1] });
    assert.equal(orderOpenBalance(o2), 600);
    const r2 = buildOrderReceipt(o2, undefined, { amount: 600, date: '2026-10-06', paymentMethod: 'PIX', accountId: 'acc' });
    assert.equal(r2.type, 'ABATIMENTO');
    assert.equal(r2.remainingDebt, 0);
    // 2º pagamento parcial via PIX tem type === 'ABATIMENTO', mas movimenta caixa normalmente
    assert.equal(r2.isDiscountOrDeduction, false);
    assert.equal(isReceiptNonCashDeduction(r2), false);

    // Quando o meio de pagamento é realmente sem caixa (desconto/devolução/permuta), marca isDiscountOrDeduction = true
    const r3 = buildOrderReceipt(order(), undefined, {
      amount: 100,
      date: '2026-10-06',
      paymentMethod: 'Abatimento / Desconto / Permuta (Sem Caixa)',
      accountId: 'acc'
    });
    assert.equal(r3.isDiscountOrDeduction, true);
    assert.equal(isReceiptNonCashDeduction(r3), true);
  });

  it('isNonCashTransactionFallback não confunde descrição "Abatimento Pedido #..." paga via PIX com desconto sem caixa', () => {
    assert.equal(isNonCashPaymentMethod('PIX'), false);
    assert.equal(isNonCashPaymentMethod('Transferência / TED'), false);
    assert.equal(isNonCashPaymentMethod('Abatimento / Devolução'), true);

    const cashTxWithAbatimentoDesc = {
      id: 'tx-1',
      description: 'Abatimento Pedido #PED-2026-0059 - Cliente X',
      category: 'Recebimento de Clientes',
      paymentMethod: 'PIX',
      discount: 0
    };
    assert.equal(isNonCashTransactionFallback(cashTxWithAbatimentoDesc), false);

    const trueNonCashTx = {
      id: 'tx-2',
      description: 'Abatimento concedido por avaria',
      category: 'Abatimentos e Descontos Concedidos',
      paymentMethod: 'Abatimento / Desconto',
      discount: 150
    };
    assert.equal(isNonCashTransactionFallback(trueNonCashTx), true);
  });

  it('contas a receber: só avulsas com saldo (as de venda entram pela venda)', () => {
    const tx = (over: any) => ({ id: 't', type: TransactionType.SALE, amount: 500, paidAmount: 0, status: TransactionStatus.PENDENTE, date: '2026-09-01', ...over }) as any;
    const list = openReceivables([
      tx({ id: 'a' }),
      tx({ id: 'b', orderId: 'o1' }),
      tx({ id: 'c', paidAmount: 500 }),
      tx({ id: 'd', type: TransactionType.EXPENSE })
    ]);
    assert.deepEqual(list.map(t => t.id), ['a']);
  });

  it('baixa parcial vira PARCIAL e total vira PAGO, guardando o histórico', () => {
    const base = { id: 't1', type: TransactionType.SALE, amount: 500, paidAmount: 0, status: TransactionStatus.PENDENTE, date: '2026-09-01', accountId: 'a' } as any;
    const input = { amount: 200, date: '2026-10-05', paymentMethod: 'PIX', accountId: 'acc' };
    const p = settleReceivable(base, input);
    assert.equal(p.status, TransactionStatus.PARCIAL);
    assert.equal(p.paidAmount, 200);
    assert.equal(p.payments?.length, 1);
    assert.equal(p.payments?.[0].isDiscountOrDeduction, false);
    const f = settleReceivable(p, { ...input, amount: 300 });
    assert.equal(f.status, TransactionStatus.PAGO);
    assert.equal(f.paidAmount, 500);
    assert.equal(f.payments?.length, 2);
  });

  it('baixa com abatimento/desconto marca isDiscountOrDeduction como true', () => {
    const base = { id: 't2', type: TransactionType.SALE, amount: 500, paidAmount: 0, status: TransactionStatus.PENDENTE, date: '2026-09-01', accountId: 'a' } as any;
    const input = { amount: 150, date: '2026-10-05', paymentMethod: 'Abatimento / Devolução', accountId: 'acc', isDeduction: true };
    const res = settleReceivable(base, input);
    assert.equal(res.status, TransactionStatus.PARCIAL);
    assert.equal(res.paidAmount, 150);
    assert.equal(res.payments?.[0].isDiscountOrDeduction, true);
  });
});

