import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Customer, SaleOrder } from '../../types.js';
import { formatBRL, formatDateBR } from './telegramWrites.js';

const NAVY = rgb(0.043, 0.122, 0.29);
const GREEN = rgb(0.118, 0.42, 0.227);
const MUTED = rgb(0.357, 0.396, 0.451);
const LINE = rgb(0.773, 0.804, 0.847);
const TEXT = rgb(0.102, 0.137, 0.196);

const pdfSafe = (value: string): string =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '');

export interface SalesOrderPdfInput {
  order: SaleOrder;
  customer: Customer;
  companyName?: string;
  companyDocument?: string;
  companyPhone?: string;
  companyCity?: string;
}

const dash = (value?: string | number | null): string => {
  if (value === undefined || value === null || String(value).trim() === '') return '-';
  return String(value);
};

/**
 * PDF A4 do pedido, para baixar no Telegram e encaminhar no WhatsApp.
 * Helvetica (WinAnsi) para acentos do pt-BR sem fonte extra.
 */
export async function buildSalesOrderPdf(input: SalesOrderPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const left = 40;
  const right = width - 40;
  let y = height - 46;

  const draw = (text: string, x: number, yy: number, size: number, face = font, color = TEXT) => {
    page.drawText(pdfSafe(text || ''), { x, y: yy, size, font: face, color });
  };

  page.drawRectangle({ x: 0, y: height - 78, width, height: 78, color: NAVY });
  draw('CBA MINERACAO', left, height - 40, 16, bold, rgb(1, 1, 1));
  draw('PEDIDO DE VENDA', right - 170, height - 36, 14, bold, GREEN);
  draw(`N. ${input.order.reference}`, right - 170, height - 54, 11, bold, rgb(1, 1, 1));

  y = height - 100;
  const company = input.companyName || 'CBA Mineracao';
  draw(company, left, y, 10, bold);
  y -= 14;
  draw(
    [input.companyDocument ? `CNPJ ${input.companyDocument}` : '', input.companyCity, input.companyPhone]
      .filter(Boolean)
      .join('  |  ') || 'Calcário dolomítico',
    left,
    y,
    8,
    font,
    MUTED
  );

  y -= 22;
  page.drawRectangle({ x: left, y: y - 4, width: right - left, height: 16, color: NAVY });
  draw('DADOS DO CLIENTE', left + 8, y, 8, bold, rgb(1, 1, 1));
  y -= 22;
  draw(`Razao social: ${dash(input.customer?.name)}`, left, y, 9, bold);
  draw(`CNPJ/CPF: ${dash(input.customer?.document)}`, left + 280, y, 9);
  y -= 14;
  const address = [input.customer?.street, input.customer?.number, input.customer?.neighborhood]
    .filter(Boolean)
    .join(', ');
  draw(`Endereco: ${dash(address)}`, left, y, 9);
  y -= 14;
  draw(`Municipio/UF: ${[input.customer?.city, input.customer?.state].filter(Boolean).join(' / ') || '-'}`, left, y, 9);
  draw(`Telefone: ${dash(input.customer?.phone)}`, left + 280, y, 9);

  y -= 22;
  page.drawRectangle({ x: left, y: y - 4, width: right - left, height: 16, color: NAVY });
  draw('DADOS DO PEDIDO', left + 8, y, 8, bold, rgb(1, 1, 1));
  y -= 22;
  draw(`Emissao: ${formatDateBR(input.order.date)}`, left, y, 9);
  draw(`Vendedor: ${dash(input.order.sellerName)}`, left + 180, y, 9);
  draw(`Pagamento: ${dash(input.order.paymentMethod)}`, left + 360, y, 9);

  y -= 22;
  page.drawRectangle({ x: left, y: y - 4, width: right - left, height: 16, color: NAVY });
  draw('Item', left + 6, y, 8, bold, rgb(1, 1, 1));
  draw('Produto', left + 40, y, 8, bold, rgb(1, 1, 1));
  draw('Qtde', left + 300, y, 8, bold, rgb(1, 1, 1));
  draw('Un', left + 350, y, 8, bold, rgb(1, 1, 1));
  draw('Unitario', left + 390, y, 8, bold, rgb(1, 1, 1));
  draw('Total', left + 470, y, 8, bold, rgb(1, 1, 1));

  for (const [index, item] of (input.order.items || []).entries()) {
    y -= 18;
    if (y < 120) break;
    if (index % 2) {
      page.drawRectangle({ x: left, y: y - 4, width: right - left, height: 16, color: rgb(0.969, 0.976, 0.988) });
    }
    page.drawLine({ start: { x: left, y: y - 4 }, end: { x: right, y: y - 4 }, thickness: 0.4, color: LINE });
    draw(String(index + 1).padStart(2, '0'), left + 6, y, 8, bold);
    draw((item.productName || item.productCode || '').slice(0, 36), left + 40, y, 8);
    draw(String(item.quantity), left + 300, y, 8, bold);
    draw(item.unit || 'Ton', left + 350, y, 8);
    draw(formatBRL(item.unitPrice), left + 390, y, 8);
    draw(formatBRL(item.total), left + 470, y, 8, bold);
  }

  y -= 36;
  page.drawRectangle({ x: left + 280, y: y - 8, width: right - left - 280, height: 28, color: GREEN });
  draw('TOTAL', left + 292, y, 10, bold, rgb(1, 1, 1));
  draw(formatBRL(input.order.total), left + 400, y, 12, bold, rgb(1, 1, 1));

  if (input.order.notes) {
    y -= 28;
    draw(`Obs.: ${String(input.order.notes).slice(0, 120)}`, left, y, 8, font, MUTED);
  }

  page.drawLine({ start: { x: left, y: 64 }, end: { x: right, y: 64 }, thickness: 0.6, color: LINE });
  draw('Documento gerado pelo CalcárioFlow. Baixe e encaminhe no WhatsApp ao cliente.', left, 48, 8, font, MUTED);
  draw(`Pedido ${input.order.reference}  ·  ${dash(input.customer?.name)}`, left, 34, 8, bold, NAVY);

  return pdf.save();
}
