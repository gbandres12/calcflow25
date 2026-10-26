export const formatBRL = (val: number) =>
  (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatQty = (val: number) =>
  (val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

export const formatDate = (value?: string) => {
  if (!value) return '—';
  const raw = value.trim();
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [y, m, d] = raw.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('pt-BR');
};

export const dash = (value?: string | number | null) => {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
};

const sanitizeFilenamePart = (value: string) =>
  value
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const buildOrderPdfTitle = (
  order: {
    reference?: string;
    customerName?: string;
    items?: Array<{ quantity?: number; unit?: string }>;
  },
  customer?: { name?: string } | null
): string => {
  const customerName = sanitizeFilenamePart(
    customer?.name || order?.customerName || 'Cliente'
  );
  const items = Array.isArray(order?.items) ? order.items : [];
  const totalQty = items.reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0);
  const rawUnit = sanitizeFilenamePart(items[0]?.unit || 'TON').toUpperCase() || 'TON';
  const qtyPart = `${formatQty(totalQty)} ${rawUnit}`;
  const refPart = sanitizeFilenamePart(order?.reference || '');

  return [customerName, qtyPart, refPart].filter(Boolean).join(' - ');
};

