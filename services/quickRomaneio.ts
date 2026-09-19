import { StoreItem, StoreItemCategory, TransferItem, TransferShipment, User } from '../types';
import { nextTransferCode } from './ids';

export const QUICK_ROMANEIO_ORIGIN = 'Polo de Compras Santarém (Av. Mendonça Furtado)';
export const QUICK_ROMANEIO_DESTINATION = 'Fazenda Usina Matriz (Zona Rural / Rodovia)';

const UNIT_ALIASES: Record<string, string> = {
  un: 'UN',
  und: 'UN',
  unid: 'UN',
  unidade: 'UN',
  pc: 'UN',
  pç: 'UN',
  pcs: 'UN',
  kg: 'KG',
  kgs: 'KG',
  kilo: 'KG',
  l: 'L',
  lt: 'L',
  litro: 'L',
  litros: 'L',
  cx: 'CX',
  caixa: 'CX',
  t: 'TON',
  ton: 'TON',
  toneladas: 'TON',
  m: 'M',
  mt: 'M'
};

export interface QuickRomaneioLine {
  productName: string;
  quantitySent: number;
  unit: string;
  category: StoreItemCategory;
  productId?: string;
}

function normalizeUnit(raw?: string): string {
  const key = (raw || '').trim().toLowerCase().replace(/\./g, '');
  if (!key) return 'UN';
  return UNIT_ALIASES[key] || raw!.trim().toUpperCase();
}

export function guessStoreCategory(name: string): StoreItemCategory {
  const n = name.toLowerCase();
  if (/óleo|oleo|graxa|lubrific|fluido/.test(n)) return 'Lubrificantes';
  if (/luva|bota|capacete|epi|máscara|mascara|óculos|oculos|protetor/.test(n)) return 'EPI';
  if (/chave|alicate|martelo|ferramenta|furadeira/.test(n)) return 'Ferramentas';
  if (/cimento|areia|cal hidrat|adubo|insumo/.test(n)) return 'Insumos';
  return 'Peças';
}

export function matchStoreItem(name: string, storeItems: StoreItem[] = []): StoreItem | undefined {
  const n = name.toLowerCase().trim();
  if (!n) return undefined;
  return storeItems.find((s) => (s.name || '').toLowerCase() === n)
    || storeItems.find((s) => {
      const sn = (s.name || '').toLowerCase();
      return sn.includes(n) || n.includes(sn);
    });
}

const UNIT_TOKEN = 'un|und|unid|kg|kgs|l|lt|cx|pc|pç|pcs|ton|t|m|mt';

/** Aceita "10 Correia B-120", "10 UN Óleo 68" ou "Graxa x 2 kg". */
export function parseQuickRomaneioLine(raw: string, storeItems: StoreItem[] = []): QuickRomaneioLine | null {
  const line = raw.replace(/\s+/g, ' ').trim();
  if (!line) return null;

  const qtyFirst = line.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(?:${UNIT_TOKEN})?\\s*[x×]?\\s+(.+)$`, 'i'));
  const nameFirst = line.match(new RegExp(`^(.+?)\\s+[x×]\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_TOKEN})?$`, 'i'));

  let productName = line;
  let quantitySent = 1;
  let unit = 'UN';

  if (qtyFirst) {
    quantitySent = parseFloat(qtyFirst[1].replace(',', '.')) || 1;
    const rest = qtyFirst[2].trim();
    const restUnit = rest.match(new RegExp(`^(${UNIT_TOKEN})\\s+(.+)$`, 'i'));
    if (restUnit) {
      unit = normalizeUnit(restUnit[1]);
      productName = restUnit[2].trim();
    } else {
      productName = rest;
    }
  } else if (nameFirst) {
    productName = nameFirst[1].trim();
    quantitySent = parseFloat(nameFirst[2].replace(',', '.')) || 1;
    unit = normalizeUnit(nameFirst[3]);
  }

  if (!productName) return null;
  const store = matchStoreItem(productName, storeItems);
  return {
    productName: store?.name || productName,
    quantitySent,
    unit: store?.unit || unit,
    category: (store?.category as StoreItemCategory) || guessStoreCategory(productName),
    productId: store?.id
  };
}

export function parseQuickRomaneioLines(text: string, storeItems: StoreItem[] = []): QuickRomaneioLine[] {
  return (text || '')
    .split(/\n+/)
    .map((line) => parseQuickRomaneioLine(line, storeItems))
    .filter((line): line is QuickRomaneioLine => Boolean(line));
}

export function toTransferItem(line: QuickRomaneioLine, index = 0): TransferItem {
  return {
    id: `qtr-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    productId: line.productId,
    productName: line.productName,
    category: line.category,
    quantitySent: line.quantitySent,
    quantityReceived: 0,
    unit: line.unit,
    conferido: false
  };
}

export function cloneTransferItems(items: TransferItem[] = []): TransferItem[] {
  return items.map((item, index) => ({
    ...item,
    id: `qtr-clone-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    quantityReceived: 0,
    conferido: false,
    divergenceNotes: undefined
  }));
}

export function cloneTransferAsQuickRomaneio(
  source: TransferShipment,
  transfers: TransferShipment[],
  currentUser?: User
): Omit<TransferShipment, 'id'> {
  return {
    code: nextTransferCode(transfers),
    originLocation: QUICK_ROMANEIO_ORIGIN,
    destinationLocation: QUICK_ROMANEIO_DESTINATION,
    dateSent: new Date().toISOString().split('T')[0],
    sentBy: currentUser?.name ? `${currentUser.name} (Compras Santarém)` : (source.sentBy || 'Compras / Expedição Santarém'),
    carrierOrDriver: source.carrierOrDriver,
    vehiclePlate: source.vehiclePlate,
    notes: source.notes,
    items: cloneTransferItems(source.items),
    status: 'EM_TRANSITO',
    stockIntegrated: false,
    createdAt: new Date().toISOString()
  };
}

export function buildBlankQuickRomaneio(
  transfers: TransferShipment[],
  currentUser?: User
): Omit<TransferShipment, 'id'> {
  return {
    code: nextTransferCode(transfers),
    originLocation: QUICK_ROMANEIO_ORIGIN,
    destinationLocation: QUICK_ROMANEIO_DESTINATION,
    dateSent: new Date().toISOString().split('T')[0],
    sentBy: currentUser?.name ? `${currentUser.name} (Compras Santarém)` : 'Compras / Expedição Santarém',
    carrierOrDriver: '',
    vehiclePlate: '',
    notes: '',
    items: [],
    status: 'EM_TRANSITO',
    stockIntegrated: false,
    createdAt: new Date().toISOString()
  };
}

export function recentRomaneioDrivers(transfers: TransferShipment[], limit = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of transfers) {
    const name = (t.carrierOrDriver || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

export function recentRomaneioPlates(transfers: TransferShipment[], limit = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of transfers) {
    const plate = (t.vehiclePlate || '').trim();
    if (!plate) continue;
    const key = plate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(plate);
    if (out.length >= limit) break;
  }
  return out;
}

export function frequentRomaneioItems(transfers: TransferShipment[], limit = 8): QuickRomaneioLine[] {
  const counts = new Map<string, QuickRomaneioLine & { uses: number }>();
  for (const t of transfers) {
    for (const item of t.items || []) {
      const name = (item.productName || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const prev = counts.get(key);
      if (prev) {
        prev.uses += 1;
        continue;
      }
      counts.set(key, {
        productName: name,
        quantitySent: Number(item.quantitySent) || 1,
        unit: item.unit || 'UN',
        category: item.category || 'Peças',
        productId: item.productId,
        uses: 1
      });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.uses - a.uses)
    .slice(0, limit)
    .map(({ uses: _uses, ...line }) => line);
}
