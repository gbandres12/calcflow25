import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OrderStatus, SaleOrder } from '../../types';
import { buildCommandIndex, searchCommands } from './commandSearch';

const index = buildCommandIndex({
  views: [{ id: 'loadings', label: 'Carregamentos' }, { id: 'orders', label: 'Vendas & Romaneios' }],
  customers: [{ id: 'c1', name: 'ALAIR CELESTINO', document: '123.456.789-00', email: '', phone: '', totalSpent: 0 }],
  orders: [{
    id: 'o1', reference: 'PED-2026-0101', customerId: 'c1', sellerName: '', date: '2026-09-14', items: [],
    subtotal: 0, discount: 0, shipping: 0, total: 0, status: OrderStatus.FINALIZED, payments: [],
    withdrawals: [{ id: 'w1', orderId: 'o1', date: '2026-09-14', driverName: 'Carlos Daniel', plateNumber: 'NRZ-1C00', quantityWithdrawn: 46.23, nfeNumero: '6997', transporterName: 'Lodi Transportes' }]
  } as SaleOrder]
});

describe('busca global (Ctrl+K)', () => {
  it('acha caminhão pela placa com ou sem traço', () => {
    assert.equal(searchCommands(index, 'nrz1c00')[0].kind, 'loading');
    assert.equal(searchCommands(index, 'NRZ-1C')[0].kind, 'loading');
  });

  it('acha pela NF e cai no pedido e no carregamento', () => {
    const kinds = searchCommands(index, '6997').map((i) => i.kind);
    assert.ok(kinds.includes('loading'));
  });

  it('acha cliente pelo CPF só com números e ignora acento', () => {
    assert.equal(searchCommands(index, '12345678900')[0].kind, 'customer');
    assert.equal(searchCommands(index, 'célestino')[0].label, 'ALAIR CELESTINO');
  });

  it('todas as palavras precisam bater', () => {
    assert.equal(searchCommands(index, 'alair lodi')[0].kind, 'loading');
    assert.equal(searchCommands(index, 'alair zzz').length, 0);
  });

  it('sem texto mostra as telas', () => {
    assert.deepEqual(searchCommands(index, '').map((i) => i.kind), ['view', 'view']);
  });
});
