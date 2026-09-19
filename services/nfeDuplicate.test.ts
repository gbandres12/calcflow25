import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OrderStatus, SaleOrder, SaleOrderLinkedNfe } from '../types';
import { buildNfeDuplicateDraft, mapPaymentMethodForDuplicate } from './nfeDuplicate';

const order = (overrides: Partial<SaleOrder> = {}): SaleOrder => ({
  id: 'ord-1',
  reference: 'PED-2026-0010',
  customerId: 'cust-fazenda',
  sellerName: 'Gabriel',
  date: '2026-09-18',
  items: [{
    productId: 'moido',
    productCode: '001',
    productName: 'Calcario Agricola',
    unit: 'TON',
    quantity: 20,
    unitPrice: 180,
    discount: 0,
    total: 3600,
    ncm: '2517.10.00',
    cfop: '5101',
    cst: '40'
  }],
  subtotal: 3600,
  discount: 0,
  shipping: 150,
  total: 3750,
  status: OrderStatus.FINALIZED,
  paymentMethod: 'PIX',
  payments: [],
  nfeNumero: '88',
  nfeChave: '41260912345678000199550010000000881234567890',
  nfeId: 'inv-88',
  nfeProtocolo: '123456',
  nfeNaturezaOperacao: 'Venda de producao do estabelecimento',
  nfeInfCpl: 'Pedido 10',
  frete: { modalidade: 0, valor: 150, veiculo: { placa: 'QDA4E90', uf: 'PA' } },
  ...overrides
});

describe('duplicar nota fiscal', () => {
  it('copia destinatário, itens, CFOP e frete sem reutilizar chave ou número', () => {
    const nfe: SaleOrderLinkedNfe = {
      id: 'nfp-1',
      tipo: 'pedido',
      reference: 'PED-2026-0010',
      items: order().items,
      subtotal: 3600,
      discount: 0,
      shipping: 150,
      total: 3750,
      frete: { modalidade: 0, valor: 150, veiculo: { placa: 'QDA4E90', uf: 'PA' } },
      nfeStatus: 'autorizada',
      nfeId: 'inv-88',
      nfeChave: '41260912345678000199550010000000881234567890',
      nfeNumero: '88',
      nfeProtocolo: '123456',
      nfeNaturezaOperacao: 'Venda de producao do estabelecimento',
      nfeInfCpl: 'Pedido 10',
      createdAt: '2026-09-18T12:00:00.000Z'
    };
    const draft = buildNfeDuplicateDraft(order(), nfe);
    assert.equal(draft.customerId, 'cust-fazenda');
    assert.equal(draft.items[0].cfop, '5101');
    assert.equal(draft.items[0].quantity, 20);
    assert.equal(draft.frete.modalidade, 0);
    assert.equal(draft.frete.veiculo?.placa, 'QDA4E90');
    assert.equal(draft.sourceNumero, '88');
    assert.equal((draft as any).nfeChave, undefined);
    assert.equal((draft as any).nfeId, undefined);
    assert.equal((draft as any).nfeProtocolo, undefined);
  });

  it('usa os itens da NF-e vinculada quando o pedido tem saldo diferente', () => {
    const nfe: SaleOrderLinkedNfe = {
      id: 'nfa-1',
      tipo: 'avulsa',
      reference: 'PED-2026-0010#AV#nfa-1',
      items: [{
        productId: 'moido',
        productCode: '001',
        productName: 'Calcario Agricola',
        unit: 'TON',
        quantity: 8,
        unitPrice: 180,
        discount: 0,
        total: 1440,
        cfop: '5102'
      }],
      subtotal: 1440,
      discount: 0,
      shipping: 0,
      total: 1440,
      nfeStatus: 'autorizada',
      nfeNumero: '91',
      createdAt: '2026-09-18T12:00:00.000Z'
    };
    const draft = buildNfeDuplicateDraft(order(), nfe);
    assert.equal(draft.items[0].quantity, 8);
    assert.equal(draft.items[0].cfop, '5102');
    assert.equal(draft.paymentMethod, 'PIX');
  });

  it('transferência e devolução saem sem cobrança', () => {
    assert.equal(mapPaymentMethodForDuplicate('PIX', 'transferencia'), 'Sem Pagamento');
    assert.equal(mapPaymentMethodForDuplicate('Boleto', 'devolucao'), 'Sem Pagamento');
    assert.equal(mapPaymentMethodForDuplicate('Transferência Bancária'), 'Transferência');
  });
});
