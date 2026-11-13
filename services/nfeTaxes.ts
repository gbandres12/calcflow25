/**
 * Cálculo de ICMS e IPI por item e totais da NF-e (destaque de impostos).
 *
 * Regras (MOC SEFAZ / leiaute 4.00):
 * - BC ICMS = valor do produto - desconto + frete rateado (quando o frete compõe a base) - redução (pRedBC).
 * - vICMS  = BC ICMS × pICMS / 100.
 * - BC IPI = valor do produto - desconto.
 * - vIPI   = BC IPI × pIPI / 100.
 * - vNF    = vProd - vDesc + vFrete + vIPI.
 */
import { SaleOrderItem } from '../types';

/** CSTs de ICMS (regime normal) que destacam base e valor do imposto próprio. */
export const CST_ICMS_TRIBUTADOS = ['00', '10', '20', '51', '70', '90'];
/** CSOSN do Simples com destaque de ICMS (com redução/crédito por fora). */
export const CSOSN_ICMS_TRIBUTADOS = ['900'];
/** CSTs de IPI tributados (grupo IPITrib). Os demais vão em IPINT. */
export const CST_IPI_TRIBUTADOS = ['00', '49', '50', '99'];
export const CST_ICMS_COM_REDUCAO = ['20', '70'];

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function normalizeCst(cst?: string): { cst: string; origem: number } {
  const raw = String(cst || '').trim();
  if (raw.length === 3) {
    const orig = parseInt(raw[0], 10);
    return {
      origem: Number.isFinite(orig) ? orig : 0,
      cst: raw.slice(1),
    };
  }
  return {
    origem: 0,
    cst: raw.length === 1 ? `0${raw}` : raw,
  };
}

export function isIcmsTributado(cst?: string): boolean {
  const c = String(cst || '').trim();
  const norm = normalizeCst(c).cst;
  return CST_ICMS_TRIBUTADOS.includes(c) || CST_ICMS_TRIBUTADOS.includes(norm) || CSOSN_ICMS_TRIBUTADOS.includes(c);
}

export function isIpiTributado(cst?: string): boolean {
  return CST_IPI_TRIBUTADOS.includes(String(cst || '').trim());
}

export interface ItemTaxes {
  cst: string;
  origem?: number;
  icmsTributado: boolean;
  aliquotaIcms: number;
  reducaoBcIcms: number;
  baseCalculoIcms: number;
  valorIcms: number;
  freteRateado: number;
  destacarIpi: boolean;
  cstIpi?: string;
  cEnqIpi?: string;
  ipiTributado: boolean;
  aliquotaIpi: number;
  baseCalculoIpi: number;
  valorIpi: number;
}

export interface NfeTaxTotals {
  baseCalculoIcms: number;
  valorIcms: number;
  baseCalculoIpi: number;
  valorIpi: number;
  valorProdutos: number;
  valorDesconto: number;
  valorFrete: number;
  valorTotalNota: number;
}

export interface TaxDefaults {
  cstIcmsPadrao?: string;
  aliquotaIcmsPadrao?: number;
  freteCompoeBcIcms?: boolean;
  cstIpiPadrao?: string;
  aliquotaIpiPadrao?: number;
  cEnqIpiPadrao?: string;
}

const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Valor líquido do item (produto - desconto). `total` já é líquido no CalcFlow. */
export function itemNetValue(it: Pick<SaleOrderItem, 'total' | 'quantity' | 'unitPrice' | 'discount'>): number {
  const total = num(it.total);
  if (total !== undefined) return round2(total);
  return round2((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0) - (Number(it.discount) || 0));
}

/** Rateia o frete proporcionalmente ao valor de cada item (último item absorve o arredondamento). */
export function rateioFrete(items: Pick<SaleOrderItem, 'total' | 'quantity' | 'unitPrice' | 'discount'>[], frete: number): number[] {
  const f = round2(Math.max(0, Number(frete) || 0));
  if (!items.length || f <= 0) return items.map(() => 0);
  const values = items.map(itemNetValue);
  const sum = values.reduce((s, v) => s + v, 0);
  if (sum <= 0) return items.map((_, i) => (i === items.length - 1 ? f : 0));
  let acc = 0;
  return values.map((v, i) => {
    if (i === values.length - 1) return round2(f - acc);
    const part = round2((f * v) / sum);
    acc += part;
    return part;
  });
}

export function computeItemTaxes(
  it: SaleOrderItem,
  defaults: TaxDefaults = {},
  freteRateado = 0
): ItemTaxes {
  const rawCst = String(it.cst || it.csosn || defaults.cstIcmsPadrao || '40').trim();
  const { cst, origem } = normalizeCst(rawCst);
  const icmsTributado = isIcmsTributado(rawCst);
  const net = itemNetValue(it);

  let aliquotaIcms = 0;
  let reducaoBcIcms = 0;
  let baseCalculoIcms = 0;
  let valorIcms = 0;
  const fr = defaults.freteCompoeBcIcms === false ? 0 : round2(freteRateado);

  if (icmsTributado) {
    aliquotaIcms = num(it.aliquotaIcms) || num(defaults.aliquotaIcmsPadrao) || 0;
    reducaoBcIcms = CST_ICMS_COM_REDUCAO.includes(cst) || cst === '90' ? (num(it.reducaoBcIcms) ?? 0) : 0;
    const bcAuto = round2((net + fr) * (1 - reducaoBcIcms / 100));
    baseCalculoIcms = round2(num(it.baseCalculoIcms) ?? bcAuto);
    valorIcms = round2(num(it.valorIcms) ?? (baseCalculoIcms * aliquotaIcms) / 100);
  }

  const destacarIpi = Boolean(it.destacarIpi);
  let cstIpi: string | undefined;
  let cEnqIpi: string | undefined;
  let ipiTributado = false;
  let aliquotaIpi = 0;
  let baseCalculoIpi = 0;
  let valorIpi = 0;
  if (destacarIpi) {
    cstIpi = String(it.cstIpi || defaults.cstIpiPadrao || '50').trim();
    cEnqIpi = String(it.cEnqIpi || defaults.cEnqIpiPadrao || '999').replace(/\D/g, '').slice(0, 3) || '999';
    ipiTributado = isIpiTributado(cstIpi);
    if (ipiTributado) {
      aliquotaIpi = num(it.aliquotaIpi) || num(defaults.aliquotaIpiPadrao) || 0;
      baseCalculoIpi = round2(num(it.baseCalculoIpi) ?? net);
      valorIpi = round2(num(it.valorIpi) ?? (baseCalculoIpi * aliquotaIpi) / 100);
    }
  }

  return {
    cst,
    origem,
    icmsTributado,
    aliquotaIcms,
    reducaoBcIcms,
    baseCalculoIcms,
    valorIcms,
    freteRateado: fr,
    destacarIpi,
    cstIpi,
    cEnqIpi,
    ipiTributado,
    aliquotaIpi,
    baseCalculoIpi,
    valorIpi,
  };
}

export function computeOrderTaxes(
  items: SaleOrderItem[],
  opts: { frete?: number; desconto?: number; defaults?: TaxDefaults } = {}
): { items: ItemTaxes[]; totals: NfeTaxTotals } {
  const frete = round2(Math.max(0, Number(opts.frete) || 0));
  const rateio = rateioFrete(items, frete);
  const taxes = items.map((it, i) => computeItemTaxes(it, opts.defaults, rateio[i]));
  const valorProdutos = round2(items.reduce((s, it) => s + itemNetValue(it), 0));
  const valorDesconto = round2(Number(opts.desconto) || 0);
  const totals: NfeTaxTotals = {
    baseCalculoIcms: round2(taxes.reduce((s, t) => s + t.baseCalculoIcms, 0)),
    valorIcms: round2(taxes.reduce((s, t) => s + t.valorIcms, 0)),
    baseCalculoIpi: round2(taxes.reduce((s, t) => s + t.baseCalculoIpi, 0)),
    valorIpi: round2(taxes.reduce((s, t) => s + t.valorIpi, 0)),
    valorProdutos,
    valorDesconto,
    valorFrete: frete,
    valorTotalNota: 0,
  };
  totals.valorTotalNota = round2(valorProdutos - valorDesconto + frete + totals.valorIpi);
  return { items: taxes, totals };
}
