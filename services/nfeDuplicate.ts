import { FreteInfo, SaleOrder, SaleOrderItem, SaleOrderLinkedNfe, SaleNfeTipo } from '../types';
import { findLinkedNfe, listOrderNfes } from './saleNfe';

export type NfeDuplicatePaymentMethod = 'PIX' | 'Boleto' | 'Dinheiro' | 'Transferência' | 'Sem Pagamento';

export interface NfeDuplicateDraftItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  ncm: string;
  cfop: string;
  cst: string;
  cClassTrib?: string;
  aliquotaIbs?: number;
  aliquotaCbs?: number;
  aliquotaIs?: number;
  informacoesComplementares?: string;
  infAdProd?: string;
}

export interface NfeDuplicateDraft {
  sourceNumero?: string;
  sourceTipo?: SaleNfeTipo;
  customerId: string;
  naturezaOperacao?: string;
  infCpl?: string;
  paymentMethod: NfeDuplicatePaymentMethod;
  frete: FreteInfo;
  items: NfeDuplicateDraftItem[];
}

function cloneItem(item: SaleOrderItem): NfeDuplicateDraftItem {
  const quantity = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  const discount = Number(item.discount) || 0;
  return {
    productId: item.productId || 'custom',
    productCode: item.productCode || '',
    productName: item.productName || 'Item',
    unit: item.unit || 'TON',
    quantity,
    unitPrice,
    discount,
    total: Number(item.total) || Math.max(0, quantity * unitPrice - discount),
    ncm: item.ncm || '',
    cfop: item.cfop || '',
    cst: item.cst || item.csosn || '',
    cClassTrib: item.cClassTrib,
    aliquotaIbs: item.aliquotaIbs,
    aliquotaCbs: item.aliquotaCbs,
    aliquotaIs: item.aliquotaIs,
    informacoesComplementares: item.informacoesComplementares,
    infAdProd: item.infAdProd
  };
}

export function mapPaymentMethodForDuplicate(raw?: string, tipo?: SaleNfeTipo): NfeDuplicatePaymentMethod {
  if (tipo === 'transferencia' || tipo === 'devolucao') return 'Sem Pagamento';
  const t = (raw || '').toLowerCase();
  if (t.includes('pix')) return 'PIX';
  if (t.includes('boleto')) return 'Boleto';
  if (t.includes('dinheiro') || t.includes('especie') || t.includes('espécie')) return 'Dinheiro';
  if (t.includes('transf') || t.includes('ted') || t.includes('doc')) return 'Transferência';
  if (t.includes('sem pagamento') || t.includes('outros')) return 'Sem Pagamento';
  return 'PIX';
}

export function resolveNfeForDuplicate(order: SaleOrder, linkedNfeId?: string): SaleOrderLinkedNfe | undefined {
  const linked = findLinkedNfe(order, linkedNfeId);
  if (linked) return linked;
  const all = listOrderNfes(order);
  return all.find((n) => n.nfeStatus === 'autorizada') || all[all.length - 1];
}

/** Monta rascunho de uma nota nova. Número, chave e protocolo da original não entram. */
export function buildNfeDuplicateDraft(order: SaleOrder, nfe?: SaleOrderLinkedNfe): NfeDuplicateDraft {
  const sourceItems = nfe?.items?.length ? nfe.items : (order.items || []);
  const freteSource = nfe?.frete || order.frete || { modalidade: 9, valor: 0 };
  return {
    sourceNumero: nfe?.nfeNumero || order.nfeNumero,
    sourceTipo: nfe?.tipo,
    customerId: order.customerId,
    naturezaOperacao: nfe?.nfeNaturezaOperacao || order.nfeNaturezaOperacao,
    infCpl: nfe?.nfeInfCpl || order.nfeInfCpl,
    paymentMethod: mapPaymentMethodForDuplicate(order.paymentMethod, nfe?.tipo),
    frete: {
      modalidade: freteSource.modalidade ?? 9,
      valor: Number(freteSource.valor) || 0,
      transportadorId: freteSource.transportadorId,
      transportadora: freteSource.transportadora ? { ...freteSource.transportadora } : undefined,
      veiculo: freteSource.veiculo ? { ...freteSource.veiculo } : undefined,
      volumes: freteSource.volumes ? { ...freteSource.volumes } : undefined
    },
    items: sourceItems.map(cloneItem)
  };
}
