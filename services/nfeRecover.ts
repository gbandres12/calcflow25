import { Customer, OrderStatus, SaleOrder, SaleOrderItem } from '../types';
import { ParsedNfDocument } from './nfeDocumentParser';
import { buildLinkedNfe, upsertLinkedNfe } from './saleNfe';

export const onlyDigits = (value?: string | null) => String(value || '').replace(/\D/g, '');

export function findBestOrderForNfe(
  orders: SaleOrder[],
  parsed: ParsedNfDocument,
  customers: Customer[] = []
): SaleOrder | null {
  const chave = String(parsed.accessKey || '').replace(/\D/g, '');
  if (chave.length === 44) {
    const already = orders.find((order) =>
      order.nfeChave === chave || (order.nfes || []).some((nfe) => nfe.nfeChave === chave)
    );
    if (already) return already;
  }

  const dest = onlyDigits(parsed.destDocument);
  const numero = String(parsed.nfNumber || '').replace(/^0+/, '');
  const issued = parsed.issuedAt ? parsed.issuedAt.slice(0, 10) : '';

  const scored = orders
    .filter((order) => order.status === OrderStatus.FINALIZED || order.status === OrderStatus.BUDGET)
    .map((order) => {
      const customer = customers.find((item) => item.id === order.customerId);
      const customerDoc = onlyDigits(customer?.document);
      let score = 0;
      if (dest && customerDoc && (dest === customerDoc || dest.slice(-11) === customerDoc.slice(-11))) score += 5;
      if (numero && String(order.nfeNumero || '').replace(/^0+/, '') === numero) score += 4;
      if (issued && String(order.date || '').slice(0, 10) === issued) score += 2;
      if (order.nfeStatus === 'autorizada' || order.nfeChave) score -= 3;
      return { order, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.order || null;
}

export function attachParsedNfeToOrder(order: SaleOrder, parsed: ParsedNfDocument): SaleOrder {
  const chave = String(parsed.accessKey || '').replace(/\D/g, '') || undefined;
  const items: SaleOrderItem[] = (parsed.items || []).length
    ? parsed.items.map((item, index) => ({
        productId: item.cProd || order.items[index]?.productId || `nf-${index + 1}`,
        productCode: item.cProd || order.items[index]?.productCode || '',
        productName: item.productName || order.items[index]?.productName || `Item ${index + 1}`,
        unit: item.unit || order.items[index]?.unit || 'UN',
        quantity: Number(item.quantitySent) || order.items[index]?.quantity || 1,
        unitPrice: Number(item.unitCost) || order.items[index]?.unitPrice || 0,
        discount: 0,
        total: Number(item.totalCost) || 0,
        ncm: item.ncm,
        cfop: item.cfop
      }))
    : order.items;

  const linked = buildLinkedNfe({
    id: chave || order.nfeId || `nfr-${order.id}`,
    tipo: 'pedido',
    reference: order.nfeReferenciaExterna || order.reference,
    order,
    items,
    subtotal: parsed.vProd || order.subtotal,
    discount: order.discount || 0,
    shipping: parsed.vFrete || order.shipping || 0,
    total: parsed.vNF || order.total,
    nfeStatus: 'autorizada',
    nfeChave: chave,
    nfeNumero: parsed.nfNumber ? String(parsed.nfNumber) : order.nfeNumero,
    nfeSerie: parsed.series ? String(parsed.series) : order.nfeSerie,
    nfeEmissao: parsed.issuedAt || order.nfeEmissao,
    nfeNaturezaOperacao: parsed.nature || order.nfeNaturezaOperacao
  });

  return upsertLinkedNfe(order, linked);
}
