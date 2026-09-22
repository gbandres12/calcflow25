import assert from 'node:assert/strict';
import { assembleAutoInfCpl, buildNfeInfCpl, hydrateSaleItemsFromCatalog, joinInfCplParts } from './nfeComplementares';
import { fiscalService } from './fiscalService';
import { DEFAULT_FISCAL_CONFIG } from '../constants';
import { Customer, SaleOrder } from '../types';

const companyPadrao = 'ICMS isento (CST 40).';
const moidoClause = 'Convênio ICMS 100/97 calcítico.';
const doloClause = 'Diferimento RICMS/PA dolomítico.';

assert.equal(
  assembleAutoInfCpl(companyPadrao, [
    { informacoesComplementares: moidoClause },
    { informacoesComplementares: doloClause },
    { informacoesComplementares: moidoClause }
  ]),
  `${companyPadrao} | ${moidoClause} | ${doloClause}`
);

assert.equal(
  joinInfCplParts([companyPadrao, companyPadrao, 'Pedido: PV-1']),
  `${companyPadrao} | Pedido: PV-1`
);

const hydrated = hydrateSaleItemsFromCatalog(
  [
    { productId: 'dolomitico', productCode: '', productName: 'x', unit: 'TON', quantity: 10, unitPrice: 100, discount: 0, total: 1000 },
    { productId: 'moido', productCode: '', productName: 'y', unit: 'TON', quantity: 5, unitPrice: 90, discount: 0, total: 450 }
  ],
  [
    { id: 'moido', name: 'Moído', quantity: 1, unitPrice: 98, minStock: 1, informacoesComplementares: moidoClause, infAdProd: 'PRNT > 85%' },
    { id: 'dolomitico', name: 'Dolomítico', quantity: 1, unitPrice: 105, minStock: 1, informacoesComplementares: doloClause, infAdProd: 'Dolomítico agrícola' }
  ],
  { cfop: '5101', cst: '40' }
);

assert.equal(hydrated[0].informacoesComplementares, doloClause);
assert.equal(hydrated[0].infAdProd, 'Dolomítico agrícola');
assert.equal(hydrated[1].informacoesComplementares, moidoClause);

const order = {
  id: 'o1',
  reference: 'PV-100',
  customerId: 'c1',
  sellerName: 'Gabriel',
  date: '2026-09-18',
  items: [
    {
      productId: 'dolomitico',
      productCode: '002',
      productName: 'Calcário Dolomítico',
      unit: 'TON',
      quantity: 7.5,
      unitPrice: 110,
      discount: 0,
      total: 825,
      ncm: '25181000',
      cfop: '6101',
      cst: '41',
      informacoesComplementares: doloClause,
      infAdProd: 'Linha dolomítico editada'
    }
  ],
  subtotal: 825,
  discount: 0,
  shipping: 0,
  total: 825,
  status: 'FINALIZADO',
  payments: [],
  nfeInfCpl: 'Texto editado no modal prevalece'
} as unknown as SaleOrder;

const customer: Customer = {
  id: 'c1',
  name: 'Fazenda Teste',
  document: '12894541000188',
  email: 'a@b.com',
  phone: '93',
  totalSpent: 0,
  city: 'Santarém',
  state: 'PA',
  ibgeCode: '1506807',
  zipCode: '68000000'
};

const payload = fiscalService.montarPayloadNotaAs(order, customer, DEFAULT_FISCAL_CONFIG);
assert.equal(payload.items[0].quantidade, 7.5);
assert.equal(payload.items[0].cfop, '6101');
assert.equal(payload.items[0].cst, '41');
assert.equal(payload.items[0].infAdProd, 'Linha dolomítico editada');
assert.ok(payload.infCpl?.startsWith('Texto editado no modal prevalece'));
assert.ok(!payload.infCpl?.includes(doloClause), 'não deve concatenar de novo a cláusula do produto se o modal já definiu o infCpl');

assert.equal(payload.transporte?.modalidadeFrete, 9);
assert.equal(payload.transporte?.volumes, undefined);

const withFreight = fiscalService.montarPayloadNotaAs(
  {
    ...order,
    shipping: 800,
    frete: { modalidade: 0, valor: 800, volumes: { quantidade: 1, especie: 'GRANEL', pesoLiquido: 7500 } }
  } as SaleOrder,
  customer,
  DEFAULT_FISCAL_CONFIG
);
assert.equal(withFreight.transporte?.modalidadeFrete, 0);
assert.equal(withFreight.transporte?.volumes?.[0]?.quantidade, 1);
assert.equal(withFreight.transporte?.volumes?.[0]?.especie, 'GRANEL');
assert.equal(withFreight.transporte?.volumes?.[0]?.pesoLiquido, 7500);
assert.ok(Number.isInteger(withFreight.transporte?.volumes?.[0]?.quantidade));

const fobWithCarrier = fiscalService.montarPayloadNotaAs(
  {
    ...order,
    shipping: 0,
    frete: {
      modalidade: 1,
      valor: 0,
      transportadora: { documento: '11222333000144', nome: 'Trans FOB Ltda' },
      veiculo: { placa: 'ABC1D23', uf: 'PA' },
    },
  } as SaleOrder,
  customer,
  DEFAULT_FISCAL_CONFIG
);
assert.equal(fobWithCarrier.transporte?.modalidadeFrete, 1);
assert.equal(fobWithCarrier.transporte?.transportadora, undefined, 'FOB com CNPJ de transportadora não vai no XML');
assert.equal(fobWithCarrier.transporte?.veiculo?.placa, 'ABC1D23');
assert.ok(fobWithCarrier.infCpl?.includes('Trans FOB Ltda'), 'nome do frete pode ir em infCpl');

const fobMotorista = fiscalService.montarPayloadNotaAs(
  {
    ...order,
    shipping: 0,
    frete: {
      modalidade: 1,
      valor: 0,
      transportadora: {
        documento: '67706983900',
        nome: 'PAULO SERGIO GUARIENTI',
        endereco: 'ZONA RURAL',
        cidade: 'RUROPOLIS',
        uf: 'PA',
      },
      veiculo: { placa: 'QIA1E13', uf: 'PA' },
    },
  } as SaleOrder,
  customer,
  DEFAULT_FISCAL_CONFIG
);
assert.equal(fobMotorista.transporte?.modalidadeFrete, 1);
assert.equal(fobMotorista.transporte?.transportadora?.documento, '67706983900');
assert.equal(fobMotorista.transporte?.transportadora?.nome, 'PAULO SERGIO GUARIENTI');
assert.equal(fobMotorista.transporte?.veiculo?.placa, 'QIA1E13');
assert.equal(fobMotorista.valorFrete, undefined);

const fobComValorIgnorado = fiscalService.montarPayloadNotaAs(
  {
    ...order,
    shipping: 500,
    frete: {
      modalidade: 1,
      valor: 500,
      transportadora: { documento: '67706983900', nome: 'PAULO SERGIO GUARIENTI' },
    },
  } as SaleOrder,
  customer,
  DEFAULT_FISCAL_CONFIG
);
assert.equal(fobComValorIgnorado.valorFrete, undefined, 'FOB nunca envia valorFrete');
assert.equal(fobComValorIgnorado.transporte?.modalidadeFrete, 1);

const numericNcmOrder = {
  ...order,
  items: [{
    ...order.items[0],
    ncm: 25181000 as unknown as string,
    cfop: 5101 as unknown as string,
    cst: 40 as unknown as string
  }]
} as SaleOrder;
const numericPayload = fiscalService.montarPayloadNotaAs(numericNcmOrder, customer, DEFAULT_FISCAL_CONFIG);
assert.equal(numericPayload.items[0].ncm, '25181000');
assert.equal(numericPayload.items[0].cfop, '5101');

assert.equal(
  buildNfeInfCpl({
    observacoesFiscaisPadrao: companyPadrao,
    items: [{ informacoesComplementares: doloClause }]
  }),
  `${companyPadrao} | ${doloClause}`
);

const autoPayload = fiscalService.montarPayloadNotaAs(
  { ...order, nfeInfCpl: undefined } as SaleOrder,
  customer,
  DEFAULT_FISCAL_CONFIG
);
assert.ok(autoPayload.infCpl?.includes(doloClause), 'sem texto no modal, usa a cláusula cadastrada no produto');
assert.ok(autoPayload.infCpl?.includes('Pedido: PV-100'));

const avulsaPayload = fiscalService.montarPayloadNotaAs(
  { ...order, isAvulsa: true, reference: 'NFA-4455', nfeInfCpl: undefined } as SaleOrder,
  customer,
  DEFAULT_FISCAL_CONFIG
);
assert.ok(avulsaPayload.infCpl?.includes(doloClause), 'NFA deve levar a cláusula do produto');
assert.ok(!avulsaPayload.infCpl?.includes('NFA-4455'), 'não imprimir o código NFA nos dados adicionais');
assert.ok(!/avulsa/i.test(avulsaPayload.infCpl || ''), 'não imprimir o rótulo de nota avulsa nos dados adicionais');
assert.ok(!avulsaPayload.infCpl?.includes('Pedido:'));

const avulsaCleared = fiscalService.montarPayloadNotaAs(
  { ...order, isAvulsa: true, reference: 'NFA-4455', nfeInfCpl: '' } as SaleOrder,
  customer,
  DEFAULT_FISCAL_CONFIG
);
assert.equal(avulsaCleared.infCpl, '');

const avulsaEdited = fiscalService.montarPayloadNotaAs(
  { ...order, isAvulsa: true, reference: 'NFA-4455', nfeInfCpl: doloClause } as SaleOrder,
  customer,
  DEFAULT_FISCAL_CONFIG
);
assert.equal(avulsaEdited.infCpl, doloClause);

console.log('nfeComplementares tests ok');
