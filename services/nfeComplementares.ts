import { InventoryItem, SaleOrder } from '../types';

export const INF_CPL_MAX = 5000;
export const INF_ADPROD_MAX = 500;

export function uniqueNonEmptyTexts(parts: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const text = (part || '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function joinInfCplParts(parts: Array<string | undefined | null>, max = INF_CPL_MAX): string {
  const joined = uniqueNonEmptyTexts(parts).join(' | ');
  return joined.length > max ? joined.slice(0, max) : joined;
}

export function assembleAutoInfCpl(
  observacoesEmpresa?: string,
  items?: Array<{ informacoesComplementares?: string } | null | undefined>
): string {
  const productClauses = (items || []).map(it => it?.informacoesComplementares);
  return joinInfCplParts([observacoesEmpresa, ...productClauses]);
}

export function appendOperationalInfCpl(
  baseInfCpl: string,
  extras: Array<string | undefined | null>
): string {
  return joinInfCplParts([baseInfCpl, ...extras]);
}

/**
 * infCpl enviado à SEFAZ.
 * Se o modal já definiu o texto (inclusive vazio), usa só esse texto.
 * Se nfeInfCpl for omitido, monta com observações da empresa + cláusulas cadastradas nos produtos.
 */
export function buildNfeInfCpl(input: {
  nfeInfCpl?: string | null;
  observacoesFiscaisPadrao?: string;
  items?: Array<{ informacoesComplementares?: string } | null | undefined>;
  extras?: Array<string | undefined | null>;
}): string {
  const hasCustom = typeof input.nfeInfCpl === 'string';
  const base = hasCustom
    ? (input.nfeInfCpl || '').trim()
    : assembleAutoInfCpl(input.observacoesFiscaisPadrao, input.items);
  return appendOperationalInfCpl(base, input.extras || []);
}

export type SaleOrderItem = SaleOrder['items'][number];

export function hydrateSaleItemsFromCatalog(
  items: SaleOrderItem[],
  inventory: InventoryItem[] | undefined,
  fallback: { cfop: string; cst: string }
): SaleOrderItem[] {
  return (items || []).map(it => {
    const prod = inventory?.find(p => p.id === it.productId);
    if (!prod) {
      return {
        ...it,
        cfop: it.cfop || fallback.cfop,
        cst: it.cst || it.csosn || fallback.cst
      };
    }
    return {
      ...it,
      productCode: it.productCode || prod.code || it.productCode,
      productName: it.productName || prod.name,
      unit: it.unit || prod.unit || it.unit,
      ncm: it.ncm || prod.ncm,
      cfop: it.cfop || prod.cfop || fallback.cfop,
      cst: it.cst || it.csosn || prod.cst || fallback.cst,
      aliquotaIcms: it.aliquotaIcms ?? prod.aliquotaIcms,
      aliquotaPis: it.aliquotaPis ?? prod.aliquotaPis,
      aliquotaCofins: it.aliquotaCofins ?? prod.aliquotaCofins,
      cClassTrib: it.cClassTrib || prod.cClassTrib,
      informacoesComplementares: prod.informacoesComplementares || it.informacoesComplementares,
      infAdProd: (it.infAdProd || prod.infAdProd || '').slice(0, INF_ADPROD_MAX)
    };
  });
}

export function applyCatalogProductToItem(
  item: SaleOrderItem,
  prod: InventoryItem | undefined,
  fallback: { cfop: string; cst: string }
): SaleOrderItem {
  if (!prod) return item;
  const quantity = item.quantity > 0 ? item.quantity : 1;
  const unitPrice = prod.unitPrice ?? item.unitPrice;
  const discount = item.discount || 0;
  return {
    ...item,
    productId: prod.id,
    productCode: prod.code || item.productCode,
    productName: prod.name,
    unit: prod.unit || item.unit,
    unitPrice,
    total: Math.max(0, quantity * unitPrice - discount),
    ncm: prod.ncm || item.ncm,
    cfop: prod.cfop || fallback.cfop,
    cst: prod.cst || fallback.cst,
    aliquotaIcms: prod.aliquotaIcms,
    aliquotaPis: prod.aliquotaPis,
    aliquotaCofins: prod.aliquotaCofins,
    cClassTrib: prod.cClassTrib,
    informacoesComplementares: prod.informacoesComplementares,
    infAdProd: (prod.infAdProd || '').slice(0, INF_ADPROD_MAX)
  };
}
