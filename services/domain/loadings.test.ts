import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OrderStatus, SaleOrder } from '../../types';
import {
  buildLoadingRows,
  filterLoadingRows,
  loadingsToCsv,
  openOrdersForLoading,
  orderLoadingProgress,
  summarizeLoadings
} from './loadings';
import { buildThermalTicketHtml } from './thermalTicket';

const order = (overrides: Partial<SaleOrder>): SaleOrder => ({
  id: 'ord-1',
  reference: 'PED-2026-0101',
  customerId: 'cli-alair',
  sellerName: 'x',
  date: '2026-09-14',
  items: [{ productId: 'moido', productCode: 'M', productName: 'CALC. EM PÓ', unit: 'Ton', quantity: 500, unitPrice: 100, discount: 0, total: 50000 }],
  subtotal: 50000,
  discount: 0,
  shipping: 0,
  total: 50000,
  status: OrderStatus.FINALIZED,
  payments: [],
  ...overrides
});

const alair = order({
  withdrawals: [
    { id: 'w1', orderId: 'ord-1', date: '2026-09-14', driverName: 'CARLOS DANIEL', plateNumber: 'nrz1c00', quantityWithdrawn: 46.23, netWeight: 50.98, transporterName: 'CBA', nfeNumero: '6997' },
    { id: 'w2', orderId: 'ord-1', date: '2026-09-19', driverName: 'Jose Emiliano', plateNumber: 'RYY7J36', quantityWithdrawn: 46.85, netWeight: 47.94, transporterName: 'LODI TRANSPORTES', nfeNumero: '7047' }
  ]
});
const outro = order({ id: 'ord-2', reference: 'PED-2026-0102', customerId: 'cli-maeda', withdrawals: [
  { id: 'w3', orderId: 'ord-2', date: '2026-09-20', driverName: 'Paulo', plateNumber: 'JDG8I79', quantityWithdrawn: 46.23 }
] });
const orcamento = order({ id: 'orc', status: OrderStatus.BUDGET, withdrawals: [
  { id: 'w4', orderId: 'orc', date: '2026-09-20', driverName: 'x', plateNumber: 'x', quantityWithdrawn: 10 }
] });
const customers = [{ id: 'cli-alair', name: 'ALAIR CELESTINO' }, { id: 'cli-maeda', name: 'Grupo Maeda' }] as any;

describe('carregamentos: planilha a partir das retiradas dos pedidos', () => {
  const rows = buildLoadingRows([alair, outro, orcamento], customers);

  it('uma linha por caminhão, mais recente primeiro, sem orçamento', () => {
    assert.deepEqual(rows.map((r) => r.id), ['w3', 'w2', 'w1']);
    assert.equal(rows[2].customerName, 'ALAIR CELESTINO');
    assert.equal(rows[2].plateNumber, 'NRZ1C00');
  });

  it('guarda os pesos fracionados sem arredondar e soma sem lixo de float', () => {
    const summary = summarizeLoadings(filterLoadingRows(rows, { customerId: 'cli-alair' }));
    assert.equal(summary.totalQuantity, 93.08);
    assert.equal(summary.totalNetWeight, 98.92);
    assert.equal(summary.trips, 2);
  });

  it('peso líquido ausente não conta como zero', () => {
    const summary = summarizeLoadings(filterLoadingRows(rows, { customerId: 'cli-maeda' }));
    assert.equal(summary.netWeightTrips, 0);
    assert.equal(rows[0].netWeight, null);
  });

  it('busca por transportador ou placa ignora acento e maiúscula', () => {
    assert.deepEqual(filterLoadingRows(rows, { search: 'lodi' }).map((r) => r.id), ['w2']);
    assert.deepEqual(filterLoadingRows(rows, { search: 'jdg8' }).map((r) => r.id), ['w3']);
    assert.deepEqual(filterLoadingRows(rows, { from: '2026-09-15', to: '2026-09-19' }).map((r) => r.id), ['w2']);
  });

  it('saldo do pedido abate a quantidade da nota', () => {
    const progress = orderLoadingProgress(alair);
    assert.equal(progress.loaded, 93.08);
    assert.equal(progress.remaining, 406.92);
    assert.equal(openOrdersForLoading([alair, outro, orcamento], 'cli-alair').length, 1);
  });

  it('CSV abre no Excel BR: ponto e vírgula, vírgula decimal, data dd/mm/aaaa', () => {
    const csv = loadingsToCsv(filterLoadingRows(rows, { customerId: 'cli-alair' }));
    const lines = csv.replace('﻿', '').split('\r\n');
    assert.equal(lines.length, 3);
    assert.ok(lines[2].includes('"14/09/2026"'));
    assert.ok(lines[2].includes('"46,23";"50,98"'));
  });
});

describe('ticket térmico', () => {
  it('escapa texto digitado na balança', () => {
    const html = buildThermalTicketHtml({
      companyName: 'CBA', ticketNumber: 'PES-1', date: '2026-09-24', customerName: '<script>x</script>',
      orderReference: 'PED-1', productName: 'Calcário', driverName: 'A', plateNumber: 'B', quantity: 46.23, netWeight: 50.98
    });
    assert.ok(!html.includes('<script>x'));
    assert.ok(html.includes('46,23 t'));
    assert.ok(html.includes('size: 80mm'));
  });
});
