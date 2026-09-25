import { Customer, OrderStatus, SaleOrder } from '../../types.js';

/** Uma linha da planilha de carregamentos: um caminhão que saiu da balança. */
export interface LoadingRow {
  id: string;
  orderId: string;
  orderReference: string;
  customerId: string;
  customerName: string;
  date: string;
  transporterName: string;
  driverName: string;
  plateNumber: string;
  productName: string;
  nfeNumero: string;
  weighTicketNumber: string;
  quantity: number;
  netWeight: number | null;
}

export interface LoadingFilter {
  customerId?: string;
  orderId?: string;
  from?: string;
  to?: string;
  search?: string;
}

// Toneladas vêm fracionadas (46,23 t) e somar float acumula lixo tipo 0,30000000004.
export const roundTons = (value: number): number => Math.round((Number(value) || 0) * 1000) / 1000;

export const sumTons = (values: number[]): number =>
  roundTons(values.reduce((sum, value) => sum + (Number(value) || 0), 0));

export function buildLoadingRows(orders: SaleOrder[], customers: Customer[]): LoadingRow[] {
  const nameById = new Map((customers || []).map((c) => [c.id, c.name]));
  const rows: LoadingRow[] = [];
  for (const order of orders || []) {
    if (!order || order.status === OrderStatus.BUDGET) continue;
    for (const w of order.withdrawals || []) {
      if (!w) continue;
      rows.push({
        id: w.id,
        orderId: order.id,
        orderReference: order.reference,
        customerId: order.customerId,
        customerName: nameById.get(order.customerId) || 'Cliente',
        date: w.date || '',
        transporterName: (w.transporterName || '').trim(),
        driverName: (w.driverName || '').trim(),
        plateNumber: (w.plateNumber || '').trim().toUpperCase(),
        productName: w.productName || order.items?.[0]?.productName || '',
        nfeNumero: w.nfeNumero || '',
        weighTicketNumber: w.weighTicketNumber || '',
        quantity: roundTons(w.quantityWithdrawn),
        netWeight: w.netWeight == null || Number.isNaN(Number(w.netWeight)) ? null : roundTons(w.netWeight)
      });
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterLoadingRows(rows: LoadingRow[], filter: LoadingFilter): LoadingRow[] {
  const term = normalize((filter.search || '').trim());
  return rows.filter((row) => {
    if (filter.customerId && row.customerId !== filter.customerId) return false;
    if (filter.orderId && row.orderId !== filter.orderId) return false;
    if (filter.from && row.date < filter.from) return false;
    if (filter.to && row.date > filter.to) return false;
    if (term) {
      const haystack = normalize([
        row.customerName, row.transporterName, row.driverName, row.plateNumber,
        row.nfeNumero, row.orderReference, row.weighTicketNumber
      ].join(' '));
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

export function summarizeLoadings(rows: LoadingRow[]) {
  const weighed = rows.filter((row) => row.netWeight != null);
  return {
    trips: rows.length,
    totalQuantity: sumTons(rows.map((row) => row.quantity)),
    totalNetWeight: sumTons(weighed.map((row) => row.netWeight as number)),
    netWeightTrips: weighed.length
  };
}

/** Contratado x carregado x saldo de um pedido — o que abate é a quantidade da nota. */
export function orderLoadingProgress(order: SaleOrder) {
  const contracted = sumTons((order.items || []).map((item) => item.quantity));
  const loaded = sumTons((order.withdrawals || []).map((w) => w.quantityWithdrawn));
  return {
    contracted,
    loaded,
    remaining: Math.max(0, roundTons(contracted - loaded)),
    trips: (order.withdrawals || []).length,
    percent: contracted > 0 ? Math.min(100, (loaded / contracted) * 100) : 0
  };
}

/** Pedidos que ainda podem receber carregamento (confirmados e com saldo). */
export function openOrdersForLoading(orders: SaleOrder[], customerId?: string): SaleOrder[] {
  return (orders || []).filter((order) =>
    order
    && order.status === OrderStatus.FINALIZED
    && (!customerId || order.customerId === customerId)
    && orderLoadingProgress(order).remaining > 0
  );
}

/** Data do dia no fuso do aparelho — toISOString() vira o dia seguinte depois das 21h no Brasil. */
export const localIsoDate = (date: Date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const formatTons = (value: number | null | undefined): string =>
  value == null ? '—' : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

const csvCell = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const brDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

/** CSV no formato que o Excel brasileiro abre direto: ponto e vírgula e vírgula decimal. */
export function loadingsToCsv(rows: LoadingRow[]): string {
  const header = ['Data', 'Cliente', 'Pedido', 'Transportador', 'Motorista', 'Produto', 'Placa', 'NF', 'Ticket', 'Quant. nota (t)', 'Peso líquido (t)'];
  const decimal = (value: number | null) => (value == null ? '' : String(value).replace('.', ','));
  const lines = rows.map((row) => [
    brDate(row.date), row.customerName, row.orderReference, row.transporterName, row.driverName,
    row.productName, row.plateNumber, row.nfeNumero, row.weighTicketNumber,
    decimal(row.quantity), decimal(row.netWeight)
  ].map(csvCell).join(';'));
  return '﻿' + [header.map(csvCell).join(';'), ...lines].join('\r\n');
}
