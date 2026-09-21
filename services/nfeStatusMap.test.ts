import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapRemoteNfeStatus, mergeNfeConsulta } from './fiscalService';
import { OrderStatus, SaleOrder } from '../types';

describe('status NotaAs → ERP', () => {
  it('trata issued e cStat 100 como autorizada', () => {
    assert.equal(mapRemoteNfeStatus('issued'), 'autorizada');
    assert.equal(mapRemoteNfeStatus('queued', 200, 100), 'autorizada');
  });

  it('mantém queued/processing como processando', () => {
    assert.equal(mapRemoteNfeStatus('queued'), 'processando');
    assert.equal(mapRemoteNfeStatus('processing'), 'processando');
  });

  it('cancelamento ganha de cStat 100 da autorização original', () => {
    assert.equal(mapRemoteNfeStatus('cancelled', 200, 100), 'cancelada');
    assert.equal(mapRemoteNfeStatus('issued', 200, 101), 'cancelada');
    assert.equal(mapRemoteNfeStatus('issued', 200, 100, { event: 'invoice.canceled' }), 'cancelada');
    assert.equal(mapRemoteNfeStatus('issued', 200, 100, { cancelledAt: '2026-09-21T12:00:00Z' }), 'cancelada');
  });

  it('não reabre nota já cancelada no ERP se a consulta ainda devolver issued', () => {
    const order = {
      id: 'ord-1',
      reference: 'NFA-2026-0001',
      customerId: 'c1',
      sellerName: 'X',
      date: '2026-09-18',
      items: [],
      subtotal: 60960,
      discount: 0,
      shipping: 0,
      total: 60960,
      status: OrderStatus.FINALIZED,
      payments: [],
      nfeStatus: 'cancelada',
      nfeId: 'inv-7058',
    } as SaleOrder;

    const merged = mergeNfeConsulta(order, {
      success: true,
      status: 'autorizada',
      nfe: { invoiceId: 'inv-7058', status: 'autorizada', nNf: 7058 } as any,
    });
    assert.equal(merged.nfeStatus, 'cancelada');
  });

  it('grava chave e protocolo da consulta no pedido', () => {
    const order = {
      id: 'ord-1',
      reference: 'PED-1',
      customerId: 'c1',
      sellerName: 'X',
      date: '2026-09-18',
      items: [],
      subtotal: 0,
      discount: 0,
      shipping: 0,
      total: 0,
      status: OrderStatus.FINALIZED,
      payments: [],
      nfeStatus: 'processando',
      nfeId: 'inv-1',
    } as SaleOrder;

    const merged = mergeNfeConsulta(order, {
      success: true,
      status: 'autorizada',
      nfe: {
        invoiceId: 'inv-1',
        status: 'autorizada',
        chaveAcesso: '41260512345678000195550010000000421234567890',
        nProt: '141260000012345',
        nNf: 7038,
        serie: 3,
      } as any,
    });

    assert.equal(merged.nfeStatus, 'autorizada');
    assert.equal(merged.nfeNumero, '7038');
    assert.equal(merged.nfeSerie, '3');
    assert.equal(merged.nfeChave, '41260512345678000195550010000000421234567890');
    assert.equal(merged.nfeProtocolo, '141260000012345');
  });
});
