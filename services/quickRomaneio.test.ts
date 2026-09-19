import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TransferShipment } from '../types';
import {
  cloneTransferAsQuickRomaneio,
  guessStoreCategory,
  parseQuickRomaneioLine,
  parseQuickRomaneioLines
} from './quickRomaneio';

describe('romaneio rápido Santarém → fazenda', () => {
  it('lê quantidade, unidade e nome em uma linha', () => {
    const a = parseQuickRomaneioLine('10 Correia B-120');
    assert.equal(a?.quantitySent, 10);
    assert.equal(a?.productName, 'Correia B-120');
    assert.equal(a?.unit, 'UN');
    assert.equal(a?.category, 'Peças');

    const b = parseQuickRomaneioLine('2 UN Óleo 68');
    assert.equal(b?.quantitySent, 2);
    assert.equal(b?.unit, 'UN');
    assert.equal(b?.category, 'Lubrificantes');

    const c = parseQuickRomaneioLine('Graxa especial x 5 kg');
    assert.equal(c?.quantitySent, 5);
    assert.equal(c?.unit, 'KG');
    assert.equal(c?.productName, 'Graxa especial');
  });

  it('ignora linhas vazias e empilha várias peças', () => {
    const items = parseQuickRomaneioLines('10 Correia B-120\n\n4 Luva nitrílica\n');
    assert.equal(items.length, 2);
    assert.equal(items[1].category, 'EPI');
  });

  it('duplica a remessa sem levar conferência nem chave da NF de compra', () => {
    const source: TransferShipment = {
      id: 'trf-1',
      code: 'TRF-2026-003',
      originLocation: 'Polo de Compras Santarém (Av. Mendonça Furtado)',
      destinationLocation: 'Fazenda Usina Matriz (Zona Rural / Rodovia)',
      dateSent: '2026-09-10',
      sentBy: 'Gabriel Santarém',
      carrierOrDriver: 'Antônio Ferreira',
      vehiclePlate: 'OBX-8819',
      notes: 'Peças frágeis',
      status: 'CONFERIDO_E_RECEBIDO',
      receivedBy: 'Carlos',
      stockIntegrated: true,
      nfeChave: '3510',
      nfeNumero: '1420',
      items: [{
        id: 'item-1',
        productName: 'Rolamento 6312',
        category: 'Peças',
        quantitySent: 4,
        quantityReceived: 4,
        unit: 'UN',
        conferido: true,
        divergenceNotes: 'ok'
      }]
    };
    const clone = cloneTransferAsQuickRomaneio(source, [source], { id: 'u1', name: 'Cassia' } as any);
    assert.equal(clone.status, 'EM_TRANSITO');
    assert.equal(clone.stockIntegrated, false);
    assert.equal(clone.nfeChave, undefined);
    assert.equal(clone.receivedBy, undefined);
    assert.equal(clone.carrierOrDriver, 'Antônio Ferreira');
    assert.equal(clone.items[0].conferido, false);
    assert.equal(clone.items[0].quantityReceived, 0);
    assert.notEqual(clone.items[0].id, 'item-1');
    assert.equal(clone.originLocation.includes('Santarém'), true);
    assert.equal(clone.destinationLocation.toLowerCase().includes('fazenda'), true);
  });

  it('classifica lubrificante e EPI pelo nome', () => {
    assert.equal(guessStoreCategory('Óleo hidráulico 68'), 'Lubrificantes');
    assert.equal(guessStoreCategory('Bota de segurança'), 'EPI');
  });
});
