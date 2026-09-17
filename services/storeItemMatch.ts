import { StoreItem } from '../types';

export const digitsOnly = (value?: string | null) => (value || '').replace(/\D/g, '');

export const normalizeName = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const isMineralNcm = (ncm?: string) => {
  const n = digitsOnly(ncm).slice(0, 4);
  return n === '2517' || n === '2518' || n === '2521' || n === '2522';
};

export const matchStoreItem = (
  storeItems: StoreItem[],
  query: { cProd?: string; ncm?: string; name?: string; supplierCnpj?: string }
): StoreItem | undefined => {
  const list = Array.isArray(storeItems) ? storeItems : [];
  const cProd = (query.cProd || '').trim();
  const cnpj = digitsOnly(query.supplierCnpj);
  if (cProd && cnpj) {
    const bySku = list.find(
      (item) => digitsOnly(item.supplierCnpj) === cnpj && (item.supplierSku || '').trim() === cProd
    );
    if (bySku) return bySku;
  }
  const name = normalizeName(query.name);
  const ncm = digitsOnly(query.ncm);
  if (ncm && name) {
    const byNcmName = list.find(
      (item) => digitsOnly(item.ncm) === ncm && normalizeName(item.name) === name
    );
    if (byNcmName) return byNcmName;
  }
  if (name) {
    return list.find((item) => normalizeName(item.name) === name);
  }
  return undefined;
};

export type StoreIntegrationIncoming = {
  name: string;
  category: StoreItem['category'];
  quantity: number;
  unit: string;
  productId?: string;
  cProd?: string;
  ncm?: string;
  supplierCnpj?: string;
  unitCost?: number;
  nfNumber?: string;
  nfeChave?: string;
};

export const applyStoreIntegration = (
  current: StoreItem[],
  incoming: StoreIntegrationIncoming,
  newId: string,
  companyId?: string
): { items: StoreItem[]; created: boolean; touched: StoreItem } => {
  const match =
    (incoming.productId ? current.find((item) => item.id === incoming.productId) : undefined) ||
    matchStoreItem(current, {
      cProd: incoming.cProd,
      ncm: incoming.ncm,
      name: incoming.name,
      supplierCnpj: incoming.supplierCnpj
    });

  const qty = Number(incoming.quantity || 0);
  if (match) {
    let touched = match;
    const items = current.map((item) => {
      if (item.id !== match.id) return item;
      touched = {
        ...item,
        quantity: Number(item.quantity || 0) + qty,
        unit: incoming.unit || item.unit,
        category: incoming.category || item.category,
        ncm: incoming.ncm || item.ncm,
        supplierSku: incoming.cProd || item.supplierSku,
        supplierCnpj: incoming.supplierCnpj || item.supplierCnpj,
        unitCost: incoming.unitCost ?? item.unitCost,
        lastNfNumber: incoming.nfNumber || item.lastNfNumber,
        lastNfeChave: incoming.nfeChave || item.lastNfeChave,
        status: 'ativo' as const
      };
      return touched;
    });
    return { items, created: false, touched };
  }

  const createdItem: StoreItem = {
    id: newId,
    name: incoming.name,
    category: incoming.category || 'Peças',
    quantity: qty,
    unit: incoming.unit || 'UN',
    minStock: 2,
    companyId,
    ncm: incoming.ncm,
    supplierSku: incoming.cProd,
    supplierCnpj: incoming.supplierCnpj,
    unitCost: incoming.unitCost,
    lastNfNumber: incoming.nfNumber,
    lastNfeChave: incoming.nfeChave,
    status: 'ativo'
  };
  return { items: [...current, createdItem], created: true, touched: createdItem };
};
