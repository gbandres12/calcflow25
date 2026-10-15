import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildThermalTicketHtml, ThermalTicketInput } from './thermalTicket';
import { yardService, bargeDischargeService } from '../dataService';
import { StockYard, BargeDischargeOperation } from '../../types';
import { INITIAL_STOCK_YARDS } from '../../constants';

describe('Balança e Pátios: Suporte a Descarga de Balsa e Transbordo', () => {
  it('gera ticket térmico para transbordo direto balsa ➔ caminhão com assinaturas', () => {
    const input: ThermalTicketInput = {
      companyName: 'CALCARIOFLOW MINERAÇÃO',
      companyCity: 'Santarém-PA',
      ticketNumber: 'PES-778899',
      date: '2026-10-15',
      operationType: 'TRANSBORDO DIRETO BALSA ➔ CAMINHÃO',
      bargeName: 'Balsa Tapajós IV',
      originLocation: 'Porto Fluvial de Santarém',
      productName: 'Calcário Agrícola Calcítico Moído',
      customerName: 'Agropecuária Fazenda Nova',
      customerDocument: '12.345.678/0001-90',
      orderReference: 'PED-2026-0042',
      transporterName: 'Expresso Tapajós',
      driverName: 'Sebastião Moreira',
      driverCpf: '123.456.789-00',
      plateNumber: 'JRT-4A20',
      quantity: 48.50,
      grossWeight: 68.20,
      tareWeight: 19.70,
      netWeight: 48.50,
      operatorName: 'José Balança',
      notes: 'Descarga direta balsa berço 01'
    };

    const html = buildThermalTicketHtml(input);

    assert.ok(html.includes('TRANSBORDO DIRETO BALSA ➔ CAMINHÃO'));
    assert.ok(html.includes('Balsa Tapajós IV'));
    assert.ok(html.includes('Porto Fluvial de Santarém'));
    assert.ok(html.includes('JRT-4A20'));
    assert.ok(html.includes('Sebastião Moreira'));
    assert.ok(html.includes('48,50 t'));
    assert.ok(html.includes('68,20 t'));
    assert.ok(html.includes('19,70 t'));
    assert.ok(html.includes('ASSINATURA DO MOTORISTA'));
    assert.ok(html.includes('ASSINATURA DO OPERADOR'));
    assert.ok(html.includes('José Balança'));
  });

  it('gera ticket térmico para descarga em pátio de estoque fluvial', () => {
    const input: ThermalTicketInput = {
      companyName: 'CALCARIOFLOW MINERAÇÃO',
      companyCity: 'Santarém-PA',
      ticketNumber: 'YARD-1029',
      date: '2026-10-15',
      operationType: 'DESCARGA EM PÁTIO',
      bargeName: 'Balsa Guajará 02',
      originLocation: 'Berço Norte',
      yardName: 'Pátio Santarém (Fluvial)',
      productName: 'Calcário Dolomítico Moído',
      quantity: 1200.0,
      netWeight: 1200.0,
      operatorName: 'Carlos Porto'
    };

    const html = buildThermalTicketHtml(input);

    assert.ok(html.includes('DESCARGA EM PÁTIO'));
    assert.ok(html.includes('Balsa Guajará 02'));
    assert.ok(html.includes('Pátio Santarém (Fluvial)'));
    assert.ok(!html.includes('ASSINATURA DO MOTORISTA')); // sem motorista informado
    assert.ok(html.includes('ASSINATURA DO OPERADOR'));
    assert.ok(html.includes('Carlos Porto'));
  });

  it('verifica sementes e métodos de yardService', async () => {
    assert.equal(INITIAL_STOCK_YARDS.length >= 2, true);
    const santarem = INITIAL_STOCK_YARDS.find(y => y.locationType === 'FLUVIAL');
    const usina = INITIAL_STOCK_YARDS.find(y => y.locationType === 'USINA');
    assert.ok(santarem, 'Deveria ter pátio fluvial de Santarém');
    assert.ok(usina, 'Deveria ter pátio da Usina Matriz');

    assert.equal(typeof yardService.getYards, 'function');
    assert.equal(typeof yardService.saveYard, 'function');
    assert.equal(typeof yardService.deleteYard, 'function');
    assert.equal(typeof bargeDischargeService.getDischarges, 'function');
    assert.equal(typeof bargeDischargeService.saveDischarge, 'function');
  });
});
