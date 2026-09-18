import { InventoryItem, SaleOrder } from '../types';

export type OrderLineDraft = {
  lineId: string;
  productId: string;
  productDescription: string;
  quantity: string;
  unitPrice: string;
};

export type SaleOrderLineItem = SaleOrder['items'][number];

export const DEFAULT_PRODUCT_SHEET = {
  title: 'Calcário dolomítico',
  body:
    'PRNT mínimo garantido: 80%\n' +
    'MgO mínimo garantido: 14%\n' +
    'Valores sujeitos a variação conforme lote e análise laboratorial.'
};

export function productSheetFromInventory(item?: InventoryItem | null): { title: string; body: string } {
  if (!item) return { ...DEFAULT_PRODUCT_SHEET };

  const title =
    item.name.includes('(') ? item.name.split('(')[0].trim() : item.name.trim() || DEFAULT_PRODUCT_SHEET.title;

  const lines: string[] = [];
  if (item.observacoesFiscais?.trim()) lines.push(item.observacoesFiscais.trim());
  if (item.informacoesComplementares?.trim()) lines.push(item.informacoesComplementares.trim());

  if (lines.length === 0) {
    const lower = item.name.toLowerCase();
    if (lower.includes('dolomít') || item.id === 'dolomitico') {
      return { ...DEFAULT_PRODUCT_SHEET };
    }
    lines.push('Especificação conforme ficha técnica do produto e análise de lote.');
  }

  return { title, body: lines.join('\n') };
}

export function inventoryProductCode(item: InventoryItem, index: number): string {
  if (item.code?.trim()) return item.code.trim();
  const map: Record<string, string> = { moido: '001', britado: '002', dolomitico: '003', ensacado: '004' };
  return map[item.id] || String(index + 1).padStart(3, '0');
}

export function sellableInventoryItems(inventory: InventoryItem[]): InventoryItem[] {
  return (Array.isArray(inventory) ? inventory : [])
    .filter((item): item is InventoryItem => Boolean(item && typeof item === 'object' && item.id && item.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function newOrderLineDraft(sellableProducts: InventoryItem[], productId?: string): OrderLineDraft {
  const prod =
    sellableProducts.find(p => p.id === (productId || 'moido')) || sellableProducts[0];
  return {
    lineId: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productId: String(prod?.id || 'moido'),
    productDescription: prod?.name || '',
    quantity: '',
    unitPrice: String(Number(prod?.unitPrice) || 0)
  };
}

export function orderItemsToDrafts(items: SaleOrder['items'] | undefined): OrderLineDraft[] {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  return list.map((it, idx) => ({
    lineId: `line-edit-${idx}-${it.productId}`,
    productId: String(it.productId || 'moido'),
    productDescription: String(it.productDescription?.trim() || it.productName || ''),
    quantity: String(Number(it.quantity) || 0),
    unitPrice: String(Number(it.unitPrice) || 0)
  }));
}

export function lineDraftSubtotal(line: OrderLineDraft): number {
  return (parseFloat(line.quantity) || 0) * (parseFloat(line.unitPrice) || 0);
}

export function sumLineDrafts(lines: OrderLineDraft[]): number {
  return lines.reduce((acc, line) => acc + lineDraftSubtotal(line), 0);
}

export function resolveInventoryProduct(
  productId: string,
  sellableProducts: InventoryItem[],
  inventory: InventoryItem[]
): InventoryItem | undefined {
  return (
    sellableProducts.find(p => p.id === productId) ||
    inventory.find(p => p.id === productId)
  );
}

export function draftToSaleOrderItem(
  line: OrderLineDraft,
  sellableProducts: InventoryItem[],
  inventory: InventoryItem[],
  isInterestadual: boolean
): SaleOrderLineItem | null {
  const qty = parseFloat(line.quantity) || 0;
  const unitPrice = parseFloat(line.unitPrice) || 0;
  if (qty <= 0 || unitPrice <= 0) return null;

  const prod = resolveInventoryProduct(line.productId, sellableProducts, inventory);
  const prodIndex = sellableProducts.findIndex(p => p.id === (prod?.id || line.productId));
  const lineDescription = line.productDescription.trim() || prod?.name || 'Produto';
  const lineTotal = qty * unitPrice;

  return {
    productId: String(prod?.id || line.productId || 'moido'),
    productCode: prod ? inventoryProductCode(prod, prodIndex >= 0 ? prodIndex : 0) : '001',
    productName: prod?.name || lineDescription,
    productDescription: lineDescription,
    unit: (prod?.unit || 'TON').toUpperCase(),
    quantity: qty,
    unitPrice,
    discount: 0,
    total: lineTotal,
    ncm: prod?.ncm || '2517.10.00',
    cfop: prod?.cfop || (isInterestadual ? '6101' : '5101'),
    cst: prod?.cst || '102',
    cClassTrib: prod?.cClassTrib,
    aliquotaIbs: prod?.aliquotaIbs,
    aliquotaCbs: prod?.aliquotaCbs,
    aliquotaIs: prod?.aliquotaIs,
    informacoesComplementares: prod?.informacoesComplementares
  };
}

export function buildItemsFromDrafts(
  lines: OrderLineDraft[],
  sellableProducts: InventoryItem[],
  inventory: InventoryItem[],
  isInterestadual: boolean
): SaleOrderLineItem[] {
  return lines
    .map(line => draftToSaleOrderItem(line, sellableProducts, inventory, isInterestadual))
    .filter((item): item is SaleOrderLineItem => item != null);
}
