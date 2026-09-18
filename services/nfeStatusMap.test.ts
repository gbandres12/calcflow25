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
      },
    });

    assert.equal(merged.nfeStatus, 'autorizada');
    assert.equal(merged.nfeNumero, '7038');
    assert.equal(merged.nfeSerie, '3');
    assert.equal(merged.nfeChave, '41260512345678000195550010000000421234567890');
    assert.equal(merged.nfeProtocolo, '141260000012345');
  });
});
