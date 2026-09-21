import {
  applyNfeStatusPatch,
  avulsaExternalRef,
  baseOrderReference,
  dedupeEmittedNfeRows,
  invoicedQuantityByProduct,
  listOrderNfes,
  remainingQuantityByProduct,
  saleItemKey,
  upsertLinkedNfe,
} from './saleNfe';
import { OrderStatus, SaleOrder } from '../types';

const order: SaleOrder = {
  id: 'ord-1',
  reference: 'PED-2026-0001',
  customerId: 'c1',
  sellerName: 'Teste',
  date: '2026-09-18',
  items: [
    {
      productId: 'moido',
      productCode: '001',
      productName: 'Calcario',
      unit: 'TON',
      quantity: 100,
      unitPrice: 180,
      discount: 0,
      total: 18000,
    },
  ],
  subtotal: 18000,
  discount: 0,
  shipping: 0,
  total: 18000,
  status: OrderStatus.FINALIZED,
  payments: [],
};

const withAvulsa = upsertLinkedNfe(order, {
  id: 'nfa-1',
  tipo: 'avulsa',
  reference: avulsaExternalRef(order.reference, 'nfa-1'),
  items: [{ ...order.items[0], quantity: 20, total: 3600 }],
  subtotal: 3600,
  discount: 0,
  shipping: 0,
  total: 3600,
  nfeStatus: 'autorizada',
  nfeId: 'inv-av-1',
  createdAt: '2026-09-18T12:00:00.000Z',
});

const remaining = remainingQuantityByProduct(withAvulsa).get(saleItemKey(order.items[0]));
const invoiced = invoicedQuantityByProduct(withAvulsa).get(saleItemKey(order.items[0]));
if (withAvulsa.nfeStatus === 'autorizada') throw new Error('Avulsa nao pode marcar NF do pedido');
if (invoiced !== 20) throw new Error(`Invoiced esperado 20, veio ${invoiced}`);
if (remaining !== 80) throw new Error(`Saldo esperado 80, veio ${remaining}`);
if (baseOrderReference(avulsaExternalRef('PED-2026-0001', 'nfa-1')) !== 'PED-2026-0001') {
  throw new Error('baseOrderReference falhou');
}

const patched = applyNfeStatusPatch(withAvulsa, { nfeStatus: 'cancelada', nfeChave: '3510' }, { invoiceId: 'inv-av-1' });
if (patched.nfes?.[0].nfeStatus !== 'cancelada') throw new Error('Webhook avulsa nao atualizou nfes[]');
if (patched.nfeStatus === 'cancelada') throw new Error('Webhook avulsa nao pode cancelar o header do pedido');

const pedWithHeaderAndAvulsa: SaleOrder = {
  ...withAvulsa,
  nfeStatus: 'autorizada',
  nfeNumero: '7048',
  nfeId: 'inv-av-1',
  nfes: [{
    ...(withAvulsa.nfes?.[0] as any),
    nfeNumero: '7048',
    nfeId: 'inv-av-1'
  }]
};
if (listOrderNfes(pedWithHeaderAndAvulsa).length !== 1) {
  throw new Error('header legado nao pode duplicar NF-e avulsa do mesmo pedido');
}

const pedRow = {
  order: { ...order, reference: 'PED-2026-0022' } as SaleOrder,
  nfe: { id: 'nfa-1', tipo: 'avulsa' as const, reference: 'PED-2026-0022', items: [], subtotal: 7443.2, discount: 0, shipping: 0, total: 7443.2, nfeStatus: 'autorizada' as const, nfeNumero: '7048', nfeId: 'inv-7048', createdAt: '2026-09-21' }
};
const nfaRow = {
  order: { ...order, id: 'ord-nfa', reference: 'NFA-7449', isAvulsa: true } as SaleOrder,
  nfe: { id: 'legacy-nfa', tipo: 'avulsa' as const, reference: 'NFA-7449', items: [], subtotal: 7443.2, discount: 0, shipping: 0, total: 7443.2, nfeStatus: 'autorizada' as const, nfeNumero: '7048', nfeId: 'inv-7048', createdAt: '2026-09-21' }
};
const deduped = dedupeEmittedNfeRows([nfaRow, pedRow]);
if (deduped.length !== 1) throw new Error('lista fiscal deve mostrar uma linha por NF-e');
if (deduped[0].order.reference !== 'PED-2026-0022') throw new Error('deve preferir o pedido PED e esconder o clone NFA');

console.log('saleNfe.selftest ok');
