import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OrderStatus, SaleOrder } from '../types';
import { attachParsedNfeToOrder, findBestOrderForNfe } from './nfeRecover';

const order = (overrides: Partial<SaleOrder> = {}): SaleOrder => ({
  id: 'ord-1',
  reference: 'PED-2026-0009',
  customerId: 'cust-1',
  sellerName: 'Cassia',
  date: '2026-09-18',
  items: [{
    productId: 'moido',
    productCode: '001',
    productName: 'Calcario',
    unit: 'TON',
    quantity: 20,
    unitPrice: 180,
    discount: 0,
    total: 3600
  }],
  subtotal: 3600,
  discount: 0,
  shipping: 0,
  total: 3600,
  status: OrderStatus.FINALIZED,
  payments: [],
  ...overrides
});

describe('recuperar NF-e no pedido da CBA', () => {
  it('casa o XML com o cliente e anexa a chave autorizada', () => {
    const parsed = {
      source: 'xml' as const,
      accessKey: '41260912345678000199550010000000421234567890',
      nfNumber: '42',
      series: '1',
      destDocument: '12345678000199',
      issuedAt: '2026-09-18',
      vNF: 3600,
      items: []
    };
    const customers = [{ id: 'cust-1', name: 'Fazenda', document: '12.345.678/0001-99', email: '', phone: '', totalSpent: 0 }];
    const found = findBestOrderForNfe([order()], parsed, customers as any);
    assert.equal(found?.id, 'ord-1');
    const linked = attachParsedNfeToOrder(found!, parsed);
    assert.equal(linked.nfeStatus, 'autorizada');
    assert.equal(linked.nfeChave, parsed.accessKey);
    assert.equal(linked.nfeNumero, '42');
  });
});
