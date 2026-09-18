import {
  applyNfeStatusPatch,
  avulsaExternalRef,
  baseOrderReference,
  invoicedQuantityByProduct,
  remainingQuantityByProduct,
  saleItemKey,
  upsertLinkedNfe,
  listDraftNfes,
  isDraftNfe,
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

const withDraft = upsertLinkedNfe(order, {
  id: 'nfp-draft-1',
  tipo: 'pedido',
  reference: order.reference,
  items: order.items,
  subtotal: order.subtotal,
  discount: 0,
  shipping: 0,
  total: order.total,
  nfeStatus: 'rascunho',
  nfeNaturezaOperacao: 'Venda',
  createdAt: '2026-09-18T12:00:00.000Z',
});
if (!isDraftNfe(withDraft.nfes![0])) throw new Error('Draft nao marcado como rascunho');
if (listDraftNfes(withDraft).length !== 1) throw new Error('listDraftNfes falhou');
const draftInvoiced = invoicedQuantityByProduct(withDraft).get(saleItemKey(order.items[0])) || 0;
if (draftInvoiced !== 0) throw new Error(`Rascunho nao pode faturar qty, veio ${draftInvoiced}`);
if (withDraft.nfeStatus !== 'rascunho') throw new Error('Header deveria ficar rascunho no pedido');

console.log('saleNfe.selftest ok');
