import assert from 'node:assert/strict';
import { assembleAutoInfCpl, hydrateSaleItemsFromCatalog, joinInfCplParts } from './nfeComplementares';
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

console.log('nfeComplementares tests ok');
