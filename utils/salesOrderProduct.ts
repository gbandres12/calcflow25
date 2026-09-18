import { InventoryItem } from '../types';

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
