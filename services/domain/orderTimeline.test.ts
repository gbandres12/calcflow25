import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OrderStatus, SaleOrder } from '../../types';
import { buildOrderTimeline } from './orderTimeline';
import { explainNfeRejection } from './nfeRejection';

const order = {
  id: 'o1',
  reference: 'PED-2026-0102',
  customerId: 'c',
  sellerName: 'Mariana',
  date: '2026-09-20',
  items: [],
  subtotal: 9200,
  discount: 0,
  shipping: 0,
  total: 9200,
  status: OrderStatus.FINALIZED,
  payments: [],
  withdrawals: [
    { id: 'w2', orderId: 'o1', date: '2026-09-22', driverName: 'Jose', plateNumber: 'RYY7J36', quantityWithdrawn: 46.85, nfeNumero: '7047' },
    { id: 'w1', orderId: 'o1', date: '2026-09-21', driverName: 'Carlos', plateNumber: 'NRZ1C00', quantityWithdrawn: 46.23, transporterName: 'CBA' }
  ],
  receipts: [
    { id: 'r1', customerId: 'c', customerName: 'x', amount: 1000, date: '2026-09-21', paymentMethod: 'PIX', description: '', type: 'ABATIMENTO' }
  ]
} as SaleOrder;

describe('linha do tempo do pedido', () => {
  const events = buildOrderTimeline(order);

  it('põe tudo em ordem de data, e no mesmo dia a carga vem antes do pagamento', () => {
    assert.deepEqual(events.map((e) => e.id), ['created-o1', 'loading-w1', 'receipt-r1', 'loading-w2']);
  });

  it('mostra tonelada fracionada, placa, motorista, transportador e NF', () => {
    assert.equal(events[1].detail, '46,23 t · NRZ1C00 · Carlos · CBA');
    assert.equal(events[3].title, 'Carregamento · NF-e 7047');
    assert.equal(events[2].title, 'Abatimento');
  });
});

describe('rejeição da SEFAZ em linguagem de escritório', () => {
  it('reconhece pelo código', () => {
    assert.equal(explainNfeRejection('Rejeição 539: Duplicidade de NF-e com diferença na Chave de Acesso')?.title, 'Número de nota já usado');
    assert.equal(explainNfeRejection('cStat 778 - Informado NCM inexistente')?.title, 'NCM do produto inválido');
  });

  it('reconhece pelo texto quando não vem código', () => {
    assert.equal(explainNfeRejection('Certificado digital vencido')?.title, 'Problema no certificado digital');
  });

  it('não inventa explicação pra erro desconhecido', () => {
    assert.equal(explainNfeRejection('Timeout na API'), null);
    assert.equal(explainNfeRejection(''), null);
  });
});
