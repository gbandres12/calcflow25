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
