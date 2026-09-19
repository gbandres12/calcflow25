import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OrderStatus, SaleOrder } from '../../types';
import {
  applyEmitToOrder,
  buildNfePayload,
  emitNfeOnNotaAs,
  remainingItemsForNfe,
  setTelegramNfeTransport,
  validateFiscalForEmit
} from './telegramNfe';

const customer = {
  id: 'cust-1',
  name: 'Fazenda Boa Vista',
  document: '12345678000190',
  city: 'Santarém',
  state: 'PA',
  street: 'Rodovia PA',
  neighborhood: 'Zona Rural',
  zipCode: '68000000',
  ibgeCode: '1506807'
};

const order = {
  id: 'ord-1',
  reference: 'PED-2026-0001',
  customerId: 'cust-1',
  sellerName: 'Gabriel',
  date: '2026-09-19',
  items: [
    {
      productId: 'moido',
      productCode: 'moido',
      productName: 'Calcário Agrícola Moído (Granel)',
      unit: 'Ton',
      quantity: 10,
      unitPrice: 180,
      discount: 0,
      total: 1800,
      ncm: '25171000',
      cfop: '5102'
    }
  ],
  subtotal: 1800,
  discount: 0,
  shipping: 0,
  total: 1800,
  status: OrderStatus.FINALIZED,
  payments: []
} as SaleOrder;

const config = {
  id: 'fiscal-1',
  apiKey: 'ntaas_test',
  environment: 'sandbox' as const,
  cnpjEmitente: '00000000000000',
  inscricaoEstadual: 'ISENTO',
  razaoSocial: 'CBA',
  nomeFantasia: 'CBA',
  regimeTributario: '1' as const,
  serieNFe: '1',
  proxNumeroNFe: 1042,
  naturezaOperacaoPadrao: 'Venda de producao do estabelecimento',
  cfopPadraoEstadual: '5101',
  cfopPadraoInterestadual: '6101',
  cstIcmsPadrao: '40',
  ufEmitente: 'PA',
  cidadeEmitente: 'Santarém'
};

describe('telegram NF-e: validação e payload', () => {
  it('bloqueia destinatário sem CPF/CNPJ', () => {
    const validation = validateFiscalForEmit(order, { ...customer, document: '123' });
    assert.equal(validation.valid, false);
    assert.match(validation.errors.join(' '), /CPF ou CNPJ/);
  });

  it('monta destinatário CNPJ e item com NCM do pedido', () => {
    const payload = buildNfePayload(order, customer as any, config);
    assert.equal(payload.dest.cnpj, '12345678000190');
    assert.equal(payload.items[0].ncm, '25171000');
    assert.equal(payload.items[0].cfop, '5102');
    assert.equal(payload.referenciaExterna, 'PED-2026-0001');
  });

  it('desconta quantidade já autorizada do que ainda falta faturar', () => {
    const invoiced = {
      ...order,
      nfes: [
        {
          id: 'nfp-1',
          tipo: 'pedido',
          reference: order.reference,
          items: [{ ...order.items[0], quantity: 4, total: 720 }],
          subtotal: 720,
          discount: 0,
          shipping: 0,
          total: 720,
          nfeStatus: 'autorizada'
        }
      ]
    } as SaleOrder;
    const remaining = remainingItemsForNfe(invoiced);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].quantity, 6);
    assert.equal(remaining[0].total, 1080);
  });
});

describe('telegram NF-e: emissão via transport injetado', () => {
  it('autoriza, persiste a nota ligada e não chama SEFAZ de verdade', async () => {
    setTelegramNfeTransport({
      async request({ url }) {
        if (String(url).includes('/emitir')) {
          return {
            status: 200,
            data: {
              status: 'issued',
              invoiceId: 'inv-1',
              chaveAcesso: '1'.repeat(44),
              nNf: 1042,
              nProt: 'prot-1'
            }
          };
        }
        return { status: 404, data: {} };
      },
      async sleep() {}
    });

    try {
      const result = await emitNfeOnNotaAs({ order, customer: customer as any, config });
      assert.equal(result.success, true);
      assert.equal(result.nfeStatus, 'autorizada');
      assert.equal(result.nfeId, 'inv-1');

      const saved = applyEmitToOrder({ order, items: order.items, tipo: 'pedido', result });
      assert.equal(saved.nfeStatus, 'autorizada');
      assert.equal(saved.nfeNumero, '1042');
      assert.equal(saved.nfes?.[0].tipo, 'pedido');
    } finally {
      setTelegramNfeTransport(null);
    }
  });
});
