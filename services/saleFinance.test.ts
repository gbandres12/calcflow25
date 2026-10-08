import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isFiscalOnlyOrder, orderReceiptsPaid } from './saleNfe';

describe('NF-e não vira venda recebida', () => {
  it('avulsa e NFA são só documento fiscal', () => {
    assert.equal(isFiscalOnlyOrder({ isAvulsa: true, reference: 'PED-2026-0101' }), true);
    assert.equal(isFiscalOnlyOrder({ reference: 'NFA-8821' }), true);
    assert.equal(isFiscalOnlyOrder({ reference: 'PED-2026-0101#AV#nfa-1' }), true);
    assert.equal(isFiscalOnlyOrder({ reference: 'PED-2026-0101' }), false);
  });

  it('recebido no financeiro conta só recibo, não parcela marcada nem nota', () => {
    assert.equal(orderReceiptsPaid({ receipts: [] }), 0);
    assert.equal(
      orderReceiptsPaid({
        receipts: [
          { amount: 1000 },
          { amount: 250.5 }
        ]
      } as any),
      1250.5
    );
  });
});

describe('inativação e cancelamento de pedidos de venda', () => {
  it('pedido cancelado zera saldo devedor e retorna status CANCELADO', async () => {
    const { calculateOrderPayment } = await import('../components/SalesOrders');
    const { OrderStatus } = await import('../types');

    const cancelledOrder: any = {
      id: 'ped-cancelled-1',
      reference: 'PED-2026-0043',
      total: 5000,
      status: OrderStatus.CANCELLED,
      receipts: []
    };

    const payment = calculateOrderPayment(cancelledOrder);
    assert.equal(payment.paymentStatus, 'CANCELADO');
    assert.equal(payment.remainingDebt, 0);
    assert.equal(payment.financialProgress, 0);
  });

  it('bloqueia inativação/cancelamento se houver NF-e autorizada vinculada', async () => {
    const { hasAuthorizedFiscalDocument } = await import('./saleNfe');
    const orderWithAuthorizedNfe: any = {
      id: 'ped-auth-1',
      reference: 'PED-2026-0044',
      nfeStatus: 'autorizada',
      nfes: [{ id: 'nfe-1', tipo: 'pedido', nfeStatus: 'autorizada' }]
    };
    assert.equal(hasAuthorizedFiscalDocument(orderWithAuthorizedNfe), true);

    const orderWithoutAuthNfe: any = {
      id: 'ped-draft-1',
      reference: 'PED-2026-0045',
      nfeStatus: 'rascunho',
      nfes: [{ id: 'nfe-2', tipo: 'pedido', nfeStatus: 'rascunho' }]
    };
    assert.equal(hasAuthorizedFiscalDocument(orderWithoutAuthNfe), false);
  });
});

