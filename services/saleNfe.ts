import { NfeStatus, SaleOrder, SaleOrderItem, SaleOrderLinkedNfe, SaleNfeTipo } from '../types';

export const AVULSA_REF_SEP = '#AV#';

export function saleItemKey(item: Pick<SaleOrderItem, 'productId' | 'productCode' | 'productName'>): string {
  return String(item.productId || item.productCode || item.productName || '').trim();
}

export function avulsaExternalRef(orderReference: string, linkedId: string): string {
  return `${orderReference}${AVULSA_REF_SEP}${linkedId}`;
}

export function baseOrderReference(reference?: string): string {
  if (!reference) return '';
  const av = reference.indexOf(AVULSA_REF_SEP);
  if (av >= 0) return reference.slice(0, av);
  return reference;
}

export function linkedIdFromAvulsaRef(reference?: string): string | undefined {
  if (!reference || !reference.includes(AVULSA_REF_SEP)) return undefined;
  return reference.split(AVULSA_REF_SEP)[1] || undefined;
}

export function isDraftNfe(nfe: Pick<SaleOrderLinkedNfe, 'nfeStatus'> | null | undefined): boolean {
  return nfe?.nfeStatus === 'rascunho';
}

function nfeCountsTowardInvoiced(nfe: SaleOrderLinkedNfe): boolean {
  if (nfe.tipo === 'devolucao') return false;
  // Rascunhos não reservam quantidade — só notas em processamento ou autorizadas.
  return nfe.nfeStatus === 'autorizada' || nfe.nfeStatus === 'processando';
}

export function listDraftNfes(order: SaleOrder): SaleOrderLinkedNfe[] {
  return listOrderNfes(order).filter(isDraftNfe);
}

export function findDraftNfe(
  order: SaleOrder,
  tipo?: SaleNfeTipo
): SaleOrderLinkedNfe | undefined {
  return listDraftNfes(order).find((n) => (tipo ? n.tipo === tipo : true));
}

export function removeLinkedNfe(order: SaleOrder, linkedId: string): SaleOrder {
  const nfes = (order.nfes || []).filter((n) => n.id !== linkedId && n.nfeId !== linkedId);
  const removed = (order.nfes || []).find((n) => n.id === linkedId || n.nfeId === linkedId);
  const next: SaleOrder = { ...order, nfes };
  if (removed && removed.tipo !== 'avulsa' && order.nfeStatus === 'rascunho') {
    return {
      ...next,
      nfeStatus: 'nao_emitida',
      nfeId: undefined,
      nfeChave: undefined,
      nfeNumero: undefined,
      nfeSerie: undefined,
      nfeProtocolo: undefined,
      nfeDanfeUrl: undefined,
      nfeXmlUrl: undefined,
      nfeEmissao: undefined,
      nfeErro: undefined,
      nfeNaturezaOperacao: undefined,
      nfeInfCpl: undefined,
      nfePayload: undefined,
      nfeRawResponse: undefined,
    };
  }
  return next;
}

function linkedFromLegacyHeader(order: SaleOrder): SaleOrderLinkedNfe | null {
  if (!order.nfeStatus || order.nfeStatus === 'nao_emitida') return null;
  const existing = order.nfes || [];
  if (order.nfeId && existing.some((n) => n.nfeId === order.nfeId)) return null;
  if (order.nfeNumero && existing.some((n) => n.tipo !== 'avulsa' && n.nfeNumero === order.nfeNumero)) return null;
  if (!order.nfeId && !order.nfeNumero && !order.nfeChave) return null;
  return {
    id: order.nfeId || `legacy-${order.id}`,
    tipo: order.isAvulsa ? 'avulsa' : 'pedido',
    reference: order.nfeReferenciaExterna || order.reference,
    items: order.items || [],
    subtotal: order.subtotal,
    discount: order.discount || 0,
    shipping: order.shipping || 0,
    total: order.total,
    frete: order.frete,
    nfeStatus: order.nfeStatus,
    nfeId: order.nfeId,
    nfeChave: order.nfeChave,
    nfeNumero: order.nfeNumero,
    nfeSerie: order.nfeSerie,
    nfeProtocolo: order.nfeProtocolo,
    nfeDanfeUrl: order.nfeDanfeUrl,
    nfeXmlUrl: order.nfeXmlUrl,
    nfeEmissao: order.nfeEmissao,
    nfeErro: order.nfeErro,
    nfeNaturezaOperacao: order.nfeNaturezaOperacao,
    nfeInfCpl: order.nfeInfCpl,
    createdAt: order.nfeEmissao || order.date,
  };
}

export function listOrderNfes(order: SaleOrder): SaleOrderLinkedNfe[] {
  const stored = [...(order.nfes || [])];
  const legacy = linkedFromLegacyHeader(order);
  if (legacy) return [legacy, ...stored];
  return stored;
}

export function findLinkedNfe(order: SaleOrder, linkedId?: string): SaleOrderLinkedNfe | undefined {
  if (!linkedId) return undefined;
  return listOrderNfes(order).find((n) => n.id === linkedId || n.nfeId === linkedId);
}

export function invoicedQuantityByProduct(order: SaleOrder): Map<string, number> {
  const map = new Map<string, number>();
  for (const nfe of listOrderNfes(order)) {
    if (!nfeCountsTowardInvoiced(nfe)) continue;
    for (const item of nfe.items || []) {
      const key = saleItemKey(item);
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + (Number(item.quantity) || 0));
    }
  }
  return map;
}

export function remainingQuantityByProduct(order: SaleOrder): Map<string, number> {
  const invoiced = invoicedQuantityByProduct(order);
  const remaining = new Map<string, number>();
  for (const item of order.items || []) {
    const key = saleItemKey(item);
    const ordered = Number(item.quantity) || 0;
    const used = invoiced.get(key) || 0;
    remaining.set(key, Math.max(0, ordered - used));
  }
  return remaining;
}

export function totalRemainingQuantity(order: SaleOrder): number {
  let sum = 0;
  remainingQuantityByProduct(order).forEach((qty) => {
    sum += qty;
  });
  return sum;
}

export function overlayNfeFields(order: SaleOrder, nfe: SaleOrderLinkedNfe): SaleOrder {
  return {
    ...order,
    nfeStatus: nfe.nfeStatus,
    nfeId: nfe.nfeId,
    nfeChave: nfe.nfeChave,
    nfeNumero: nfe.nfeNumero,
    nfeSerie: nfe.nfeSerie,
    nfeProtocolo: nfe.nfeProtocolo,
    nfeDanfeUrl: nfe.nfeDanfeUrl,
    nfeXmlUrl: nfe.nfeXmlUrl,
    nfeEmissao: nfe.nfeEmissao,
    nfeErro: nfe.nfeErro,
    nfeNaturezaOperacao: nfe.nfeNaturezaOperacao,
    nfeInfCpl: nfe.nfeInfCpl,
    nfeReferenciaExterna: nfe.reference,
    nfePayload: nfe.nfePayload ?? order.nfePayload,
    nfeRawResponse: nfe.nfeRawResponse ?? order.nfeRawResponse,
  };
}

function extractHeaderNfe(order: SaleOrder): Partial<SaleOrderLinkedNfe> {
  return {
    nfeStatus: order.nfeStatus,
    nfeId: order.nfeId,
    nfeChave: order.nfeChave,
    nfeNumero: order.nfeNumero,
    nfeSerie: order.nfeSerie,
    nfeProtocolo: order.nfeProtocolo,
    nfeDanfeUrl: order.nfeDanfeUrl,
    nfeXmlUrl: order.nfeXmlUrl,
    nfeEmissao: order.nfeEmissao,
    nfeErro: order.nfeErro,
    nfeNaturezaOperacao: order.nfeNaturezaOperacao,
    nfeInfCpl: order.nfeInfCpl,
    nfePayload: order.nfePayload,
    nfeRawResponse: order.nfeRawResponse,
    reference: order.nfeReferenciaExterna || order.reference,
  };
}

export function upsertLinkedNfe(order: SaleOrder, linked: SaleOrderLinkedNfe): SaleOrder {
  const nfes = [...(order.nfes || [])];
  const idx = nfes.findIndex((n) => n.id === linked.id || (linked.nfeId && n.nfeId === linked.nfeId));
  const preservedCreatedAt = idx >= 0 ? nfes[idx].createdAt : linked.createdAt;
  const merged: SaleOrderLinkedNfe = {
    ...(idx >= 0 ? nfes[idx] : {}),
    ...linked,
    createdAt: preservedCreatedAt || linked.createdAt || new Date().toISOString(),
  };
  if (idx >= 0) nfes[idx] = merged;
  else nfes.push(merged);

  const next: SaleOrder = { ...order, nfes };
  if (linked.tipo !== 'avulsa') {
    return {
      ...next,
      nfeStatus: linked.nfeStatus,
      nfeId: linked.nfeId,
      nfeChave: linked.nfeChave,
      nfeNumero: linked.nfeNumero,
      nfeSerie: linked.nfeSerie,
      nfeProtocolo: linked.nfeProtocolo,
      nfeDanfeUrl: linked.nfeDanfeUrl,
      nfeXmlUrl: linked.nfeXmlUrl,
      nfeEmissao: linked.nfeEmissao,
      nfeErro: linked.nfeErro,
      nfeNaturezaOperacao: linked.nfeNaturezaOperacao,
      nfeInfCpl: linked.nfeInfCpl,
      nfePayload: linked.nfePayload ?? order.nfePayload,
      nfeReferenciaExterna: linked.reference || order.nfeReferenciaExterna,
    };
  }
  return next;
}

export function commitLinkedNfeSync(
  sourceOrder: SaleOrder,
  syncedOverlay: SaleOrder,
  linkedNfeId?: string
): SaleOrder {
  if (!linkedNfeId) {
    const header = extractHeaderNfe(syncedOverlay);
    const matching = (sourceOrder.nfes || []).find(
      (n) => (header.nfeId && n.nfeId === header.nfeId) || n.tipo === 'pedido'
    );
    if (matching) {
      return upsertLinkedNfe(syncedOverlay, {
        ...matching,
        ...header,
        id: matching.id,
        tipo: matching.tipo,
        items: matching.items,
        subtotal: matching.subtotal,
        discount: matching.discount,
        shipping: matching.shipping,
        total: matching.total,
        createdAt: matching.createdAt,
      });
    }
    return syncedOverlay;
  }

  const current = findLinkedNfe(sourceOrder, linkedNfeId);
  if (!current) return sourceOrder;
  const header = extractHeaderNfe(syncedOverlay);
  return upsertLinkedNfe(sourceOrder, {
    ...current,
    ...header,
    id: current.id,
    tipo: current.tipo,
    items: current.items,
    subtotal: current.subtotal,
    discount: current.discount,
    shipping: current.shipping,
    total: current.total,
    createdAt: current.createdAt,
    reference: current.reference,
  });
}

function mapPatchToLinked(patch: Record<string, any>): Partial<SaleOrderLinkedNfe> {
  const next: Partial<SaleOrderLinkedNfe> = {};
  if (patch.nfeStatus) next.nfeStatus = patch.nfeStatus as NfeStatus;
  if (patch.nfeId) next.nfeId = patch.nfeId;
  if (patch.nfeChave) next.nfeChave = patch.nfeChave;
  if (patch.nfeProtocolo) next.nfeProtocolo = patch.nfeProtocolo;
  if (patch.nfeDanfeUrl) next.nfeDanfeUrl = patch.nfeDanfeUrl;
  if (patch.nfeXmlUrl) next.nfeXmlUrl = patch.nfeXmlUrl;
  if (patch.nfeNumero) next.nfeNumero = patch.nfeNumero;
  if (patch.nfeSerie) next.nfeSerie = patch.nfeSerie;
  if (patch.nfeErro !== undefined) next.nfeErro = patch.nfeErro;
  if (patch.nfeEmissao) next.nfeEmissao = patch.nfeEmissao;
  return next;
}

export function applyNfeStatusPatch(
  orderData: SaleOrder,
  patch: Record<string, any>,
  match: { invoiceId?: string; reference?: string }
): SaleOrder {
  const nfes = [...(orderData.nfes || [])];
  let idx = -1;
  if (match.invoiceId) idx = nfes.findIndex((n) => n.nfeId === match.invoiceId);
  if (idx < 0 && match.reference) {
    const linkedId = linkedIdFromAvulsaRef(match.reference);
    idx = nfes.findIndex(
      (n) => n.reference === match.reference || (linkedId && n.id === linkedId)
    );
  }

  if (idx >= 0) {
    nfes[idx] = { ...nfes[idx], ...mapPatchToLinked(patch) };
    const next = { ...orderData, nfes };
    const shouldTouchHeader =
      (orderData.nfeId && match.invoiceId && orderData.nfeId === match.invoiceId) ||
      nfes[idx].tipo !== 'avulsa';
    return shouldTouchHeader ? { ...next, ...patch } : next;
  }

  return { ...orderData, ...patch };
}

export function buildLinkedNfe(params: {
  id: string;
  tipo: SaleNfeTipo;
  reference: string;
  order: SaleOrder;
  items: SaleOrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  nfeStatus: NfeStatus;
  nfeId?: string;
  nfeChave?: string;
  nfeNumero?: string;
  nfeSerie?: string;
  nfeProtocolo?: string;
  nfeDanfeUrl?: string;
  nfeXmlUrl?: string;
  nfeEmissao?: string;
  nfeErro?: string;
  nfeNaturezaOperacao?: string;
  nfeInfCpl?: string;
  nfePayload?: any;
  nfeRawResponse?: any;
}): SaleOrderLinkedNfe {
  return {
    id: params.id,
    tipo: params.tipo,
    reference: params.reference,
    items: params.items,
    subtotal: params.subtotal,
    discount: params.discount,
    shipping: params.shipping,
    total: params.total,
    frete: params.order.frete,
    nfeStatus: params.nfeStatus,
    nfeId: params.nfeId,
    nfeChave: params.nfeChave,
    nfeNumero: params.nfeNumero,
    nfeSerie: params.nfeSerie,
    nfeProtocolo: params.nfeProtocolo,
    nfeDanfeUrl: params.nfeDanfeUrl,
    nfeXmlUrl: params.nfeXmlUrl,
    nfeEmissao: params.nfeEmissao,
    nfeErro: params.nfeErro,
    nfeNaturezaOperacao: params.nfeNaturezaOperacao,
    nfeInfCpl: params.nfeInfCpl,
    nfePayload: params.nfePayload,
    nfeRawResponse: params.nfeRawResponse,
    createdAt: new Date().toISOString(),
  };
}

export function hasAuthorizedFiscalDocument(order: SaleOrder): boolean {
  if (order.nfeStatus === 'autorizada') return true;
  return listOrderNfes(order).some((n) => n.nfeStatus === 'autorizada');
}
