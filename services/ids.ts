export const newId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const nextOrderReference = (orders: { reference?: string }[], year = new Date().getFullYear()): string => {
  const prefix = `PED-${year}-`;
  let max = 0;
  for (const order of orders) {
    const ref = order.reference || '';
    if (!ref.startsWith(prefix)) continue;
    const n = parseInt(ref.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${(max + 1).toString().padStart(4, '0')}`;
};

export const nextAvulsaReference = (orders: { reference?: string }[], year = new Date().getFullYear()): string => {
  const prefix = `NFA-${year}-`;
  let max = 0;
  for (const order of orders) {
    const ref = order.reference || '';
    if (!ref.startsWith(prefix)) continue;
    const n = parseInt(ref.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${(max + 1).toString().padStart(4, '0')}`;
};

export const nextQuoteReference = (orders: { reference?: string }[], year = new Date().getFullYear()): string => {
  const prefix = `ORC-${year}-`;
  let max = 0;
  for (const order of orders) {
    const ref = order.reference || '';
    if (!ref.startsWith(prefix)) continue;
    const n = parseInt(ref.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${(max + 1).toString().padStart(4, '0')}`;
};

export const nextTransferCode = (transfers: { code?: string }[], year = new Date().getFullYear()): string => {
  const prefix = `TRF-${year}-`;
  let max = 0;
  for (const transfer of transfers) {
    const code = transfer.code || '';
    if (!code.startsWith(prefix)) continue;
    const n = parseInt(code.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${(max + 1).toString().padStart(3, '0')}`;
};
