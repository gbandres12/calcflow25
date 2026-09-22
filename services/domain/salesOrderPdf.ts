import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { Customer, FiscalConfig, SaleOrder } from '../../types.js';
import { sanitizeSalesOrderSheetBody } from '../../utils/salesOrderProduct.js';
import { formatBRL } from './telegramWrites.js';

const NAVY = rgb(11 / 255, 31 / 255, 74 / 255);
const GREEN = rgb(30 / 255, 107 / 255, 58 / 255);
const BORDER = rgb(197 / 255, 205 / 255, 216 / 255);
const ROW_ALT = rgb(247 / 255, 249 / 255, 252 / 255);
const TEXT = rgb(26 / 255, 35 / 255, 50 / 255);
const MUTED = rgb(91 / 255, 101 / 255, 115 / 255);
const WHITE = rgb(1, 1, 1);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 32;

const pdfSafe = (value: string): string =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\u2014|\u2013/g, '-')
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '');

export interface SalesOrderPdfInput {
  order: SaleOrder;
  customer: Customer;
  brand?: Partial<FiscalConfig> | null;
  printedAt?: string;
  companyName?: string;
  companyDocument?: string;
  companyPhone?: string;
  companyCity?: string;
}

const dash = (value?: string | number | null): string => {
  if (value === undefined || value === null || String(value).trim() === '') return '-';
  return String(value);
};

const formatQty = (value: number): string =>
  (value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

const formatDate = (value?: string): string => {
  if (!value) return '-';
  const raw = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [year, month, day] = raw.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('pt-BR');
};

/**
 * PDF A4 do pedido no mesmo layout do ERP (SalesOrderPrintDocument).
 * Helvetica (WinAnsi) para acentos do pt-BR sem fonte extra.
 */
export async function buildSalesOrderPdf(input: SalesOrderPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const left = MARGIN;
  const right = PAGE_W - MARGIN;
  const width = right - left;
  let y = PAGE_H - 28;

  const draw = (
    text: string,
    x: number,
    yy: number,
    size: number,
    face = font,
    color = TEXT,
    target: PDFPage = page
  ) => {
    target.drawText(pdfSafe(text || ''), { x, y: yy, size, font: face, color });
  };

  const textWidth = (text: string, size: number, face: PDFFont = font) =>
    face.widthOfTextAtSize(pdfSafe(text || ''), size);

  const drawRight = (text: string, xRight: number, yy: number, size: number, face = font, color = TEXT) => {
    draw(text, xRight - textWidth(text, size, face), yy, size, face, color);
  };

  const drawCenter = (text: string, x: number, boxW: number, yy: number, size: number, face = font, color = TEXT) => {
    draw(text, x + (boxW - textWidth(text, size, face)) / 2, yy, size, face, color);
  };

  const drawTracked = (
    text: string,
    x: number,
    yy: number,
    size: number,
    face: PDFFont,
    color: ReturnType<typeof rgb>,
    tracking = 0.8
  ) => {
    let cursor = x;
    for (const char of pdfSafe(text)) {
      draw(char, cursor, yy, size, face, color);
      cursor += textWidth(char, size, face) + tracking;
    }
    return cursor;
  };

  const fit = (text: string, size: number, max: number, face: PDFFont = font): string => {
    const safe = pdfSafe(text || '');
    if (face.widthOfTextAtSize(safe, size) <= max) return safe;
    let cut = safe;
    while (cut.length && face.widthOfTextAtSize(`${cut}...`, size) > max) cut = cut.slice(0, -1);
    return `${cut}...`;
  };

  const wrap = (text: string, size: number, max: number, face: PDFFont = font): string[] => {
    const words = pdfSafe(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (face.widthOfTextAtSize(next, size) <= max) current = next;
      else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  const brand = input.brand || {};
  const razao = brand.razaoSocial || brand.nomeFantasia || input.companyName || 'CBA Mineração';
  const cnpjEmp = brand.cnpjEmitente || input.companyDocument || '';
  const endEmp = [
    [brand.logradouroEmitente, brand.numeroEmitente, brand.bairroEmitente].filter(Boolean).join(', '),
    brand.cidadeEmitente && brand.ufEmitente
      ? `${brand.cidadeEmitente} - ${brand.ufEmitente}`
      : input.companyCity,
    brand.cepEmitente ? `CEP: ${brand.cepEmitente}` : ''
  ].filter(Boolean);
  const phones = [brand.telefoneEmitente, input.companyPhone].filter(Boolean);
  const items = input.order.items || [];
  const multiItem = items.length > 1;
  const sheetTitle =
    input.order.productSheetTitle?.trim() ||
    (multiItem ? 'Informações complementares do pedido' : items[0]?.productName || '');
  const sheetLines = sanitizeSalesOrderSheetBody(input.order.productSheetBody)
    .split('\n')
    .map((line) => line.replace(/^\*+\s*/, '').trim())
    .filter(Boolean);

  const logo = await embedLogo(pdf, brand.logoDataUrl);
  if (logo) {
    const maxW = 105;
    const maxH = 51;
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, { x: left, y: y - h + 6, width: w, height: h });
  } else {
    draw('CB', left, y - 22, 26, bold, NAVY);
    draw('A', left + textWidth('CB', 26, bold), y - 22, 26, bold, GREEN);
    drawTracked('MINERAÇÃO', left, y - 34, 7, bold, NAVY, 1.6);
  }

  const title = 'PEDIDO DE VENDA';
  const titleW = [...title].reduce((sum, char) => sum + textWidth(char, 15, bold) + 0.9, -0.9);
  drawTracked(title, right - titleW, y - 8, 15, bold, GREEN, 0.9);
  const badgeW = 168;
  const badgeH = 18;
  const badgeX = right - badgeW;
  const badgeY = y - 36;
  page.drawRectangle({ x: badgeX, y: badgeY, width: 28, height: badgeH, color: NAVY });
  page.drawRectangle({
    x: badgeX + 28,
    y: badgeY,
    width: badgeW - 28,
    height: badgeH,
    borderColor: NAVY,
    borderWidth: 1.6
  });
  drawCenter('Nº', badgeX, 28, badgeY + 5, 9, bold, WHITE);
  draw(input.order.reference, badgeX + 36, badgeY + 5, 10, bold, TEXT);

  y = badgeY - 18;
  const pills = ['Calcário dolomítico', 'Alto PRNT e qualidade', 'Produtividade no campo', 'Responsabilidade ambiental'];
  const gap = 5;
  const pillW = (width - gap * 3) / 4;
  const pillH = 20;
  pills.forEach((label, index) => {
    const x = left + index * (pillW + gap);
    page.drawRectangle({ x, y: y - pillH, width: pillW, height: pillH, borderColor: BORDER, borderWidth: 0.8 });
    drawCenter(label, x, pillW, y - 14, 6.5, bold, NAVY);
  });

  y -= pillH + 16;
  const sectionBar = (title: string) => {
    page.drawRectangle({ x: left, y: y - 15, width, height: 16, color: NAVY });
    draw(title, left + 8, y - 11, 8, bold, WHITE);
    y -= 15;
  };

  sectionBar('DADOS DO CLIENTE');
  const customerH = 62;
  page.drawRectangle({ x: left, y: y - customerH, width, height: customerH, borderColor: BORDER, borderWidth: 0.8 });
  const col2 = left + width / 2 + 8;
  let cy = y - 14;
  draw(`Razão social: ${dash(input.customer?.name)}`, left + 8, cy, 8, bold);
  draw(`CNPJ/CPF: ${dash(input.customer?.document)}`, col2, cy, 8);
  cy -= 13;
  const address = [input.customer?.street, input.customer?.number, input.customer?.neighborhood]
    .filter(Boolean)
    .join(', ');
  draw(fit(`Endereço: ${dash(address)}`, 8, width - 16, bold), left + 8, cy, 8);
  cy -= 13;
  draw(
    `Município/UF: ${[input.customer?.city, input.customer?.state].filter(Boolean).join(' / ') || '-'}`,
    left + 8,
    cy,
    8
  );
  draw(`Telefone: ${dash(input.customer?.phone)}`, col2, cy, 8);
  cy -= 13;
  draw(`E-mail: ${dash(input.customer?.email)}`, left + 8, cy, 8);
  y -= customerH + 10;

  sectionBar('DADOS DO PEDIDO');
  const orderH = 28;
  const cellW = width / 4;
  page.drawRectangle({ x: left, y: y - orderH, width, height: orderH, borderColor: BORDER, borderWidth: 0.8 });
  const orderCells = [
    { label: 'DATA DO PEDIDO', value: formatDate(input.order.date) },
    { label: 'PREVISÃO DE ENTREGA', value: formatDate(input.order.deliveryDate) },
    { label: 'COND. DE PAGAMENTO', value: dash(input.order.paymentMethod) },
    { label: 'VENDEDOR', value: dash(input.order.sellerName) }
  ];
  orderCells.forEach((cell, index) => {
    const x = left + index * cellW;
    if (index) page.drawLine({ start: { x, y }, end: { x, y: y - orderH }, thickness: 0.6, color: BORDER });
    draw(cell.label, x + 6, y - 10, 6, bold, MUTED);
    draw(fit(cell.value, 8, cellW - 12, bold), x + 6, y - 22, 8, bold);
  });
  y -= orderH + 10;

  const cols = [
    { key: 'item', x: left, w: 28, align: 'left' as const },
    { key: 'code', x: left + 28, w: 70, align: 'left' as const },
    { key: 'desc', x: left + 98, w: 168, align: 'left' as const },
    { key: 'qty', x: left + 266, w: 48, align: 'right' as const },
    { key: 'unit', x: left + 314, w: 36, align: 'center' as const },
    { key: 'unitPrice', x: left + 350, w: 84, align: 'right' as const },
    { key: 'total', x: left + 434, w: width - 434, align: 'right' as const }
  ];

  const drawTableHeader = () => {
    page.drawRectangle({ x: left, y: y - 16, width, height: 16, color: NAVY });
    const headers = [
      { text: 'Item', col: cols[0] },
      { text: 'Produto', col: cols[1] },
      { text: 'Descrição', col: cols[2] },
      { text: 'Qtde.', col: cols[3] },
      { text: 'Unid.', col: cols[4] },
      { text: 'Valor unit.', col: cols[5] },
      { text: 'Valor total', col: cols[6] }
    ];
    headers.forEach(({ text, col }) => {
      if (col.align === 'right') drawRight(text, col.x + col.w - 4, y - 11, 7, bold, WHITE);
      else if (col.align === 'center') drawCenter(text, col.x, col.w, y - 11, 7, bold, WHITE);
      else draw(text, col.x + 4, y - 11, 7, bold, WHITE);
    });
    y -= 16;
  };

  drawTableHeader();
  for (const [index, item] of items.entries()) {
    const rowH = 16;
    if (index % 2) page.drawRectangle({ x: left, y: y - rowH, width, height: rowH, color: ROW_ALT });
    page.drawLine({ start: { x: left, y: y - rowH }, end: { x: right, y: y - rowH }, thickness: 0.4, color: BORDER });
    const values = [
      { text: String(index + 1).padStart(2, '0'), col: cols[0], face: bold },
      { text: fit(item.productCode || item.productName || '', 8, cols[1].w - 8, bold), col: cols[1], face: bold },
      { text: fit(item.productDescription?.trim() || item.productName || '', 8, cols[2].w - 8), col: cols[2], face: font },
      { text: formatQty(item.quantity), col: cols[3], face: bold },
      { text: item.unit || 'Ton', col: cols[4], face: font },
      { text: formatBRL(item.unitPrice), col: cols[5], face: font },
      { text: formatBRL(item.total), col: cols[6], face: bold }
    ];
    values.forEach(({ text, col, face }) => {
      if (col.align === 'right') drawRight(text, col.x + col.w - 4, y - 11, 8, face);
      else if (col.align === 'center') drawCenter(text, col.x, col.w, y - 11, 8, face);
      else draw(text, col.x + 4, y - 11, 8, face);
    });
    y -= rowH;
  }

  y -= 12;
  const half = (width - 10) / 2;
  const sheetTop = y;
  page.drawRectangle({ x: left, y: y - 78, width: half, height: 78, borderColor: BORDER, borderWidth: 0.8 });
  draw('PRODUTO', left + 8, y - 12, 6.5, bold, MUTED);
  draw(fit(sheetTitle, 9, half - 16, bold), left + 8, y - 26, 9, bold, NAVY);
  let sy = y - 40;
  sheetLines.slice(0, 4).forEach((line) => {
    const italicLook = line.toLowerCase().includes('sujeito');
    draw(fit(line, 7.5, half - 16), left + 8, sy, 7.5, font, italicLook ? MUTED : TEXT);
    sy -= 11;
  });

  const summaryX = left + half + 10;
  page.drawRectangle({ x: summaryX, y: y - 16, width: half, height: 16, color: NAVY });
  draw('RESUMO DO PEDIDO', summaryX + 8, y - 11, 8, bold, WHITE);
  const rows = [
    { label: 'Subtotal', value: formatBRL(input.order.subtotal) },
    { label: 'Frete', value: formatBRL(input.order.shipping || 0) },
    { label: 'Desconto', value: formatBRL(input.order.discount || 0) }
  ];
  let ry = y - 16;
  rows.forEach((row) => {
    page.drawRectangle({ x: summaryX, y: ry - 16, width: half, height: 16, borderColor: BORDER, borderWidth: 0.6 });
    draw(row.label, summaryX + 8, ry - 11, 8);
    drawRight(row.value, summaryX + half - 8, ry - 11, 8, bold);
    ry -= 16;
  });
  page.drawRectangle({ x: summaryX, y: ry - 18, width: half, height: 18, color: GREEN });
  draw('Total geral', summaryX + 8, ry - 12, 9, bold, WHITE);
  drawRight(formatBRL(input.order.total), summaryX + half - 8, ry - 12, 10, bold, WHITE);
  y = Math.min(sheetTop - 78, ry - 18) - 12;

  const blockH = 68;
  page.drawRectangle({ x: left, y: y - 16, width: half, height: 16, color: NAVY });
  draw('OBSERVAÇÕES', left + 8, y - 11, 8, bold, WHITE);
  page.drawRectangle({ x: left, y: y - blockH, width: half, height: blockH - 16, borderColor: BORDER, borderWidth: 0.8 });
  const notes = wrap(String(input.order.notes || ''), 8, half - 16);
  notes.slice(0, 4).forEach((line, index) => draw(line, left + 8, y - 28 - index * 11, 8));

  const signX = left + half + 10;
  page.drawRectangle({ x: signX, y: y - blockH, width: half, height: blockH, borderColor: BORDER, borderWidth: 0.8 });
  page.drawLine({
    start: { x: signX + 16, y: y - 28 },
    end: { x: signX + half - 16, y: y - 28 },
    thickness: 0.6,
    color: BORDER
  });
  drawCenter('ASSINATURA DO CLIENTE', signX, half, y - 42, 7.5, bold, NAVY);
  drawCenter('Data: ____ / ____ / ________', signX, half, y - 56, 8, font, MUTED);
  const footerH = 70;
  page.drawLine({
    start: { x: left, y: footerH },
    end: { x: right, y: footerH },
    thickness: 1.2,
    color: NAVY
  });
  let fy = footerH - 16;
  draw(razao, left, fy, 10, bold, NAVY);
  fy -= 11;
  if (cnpjEmp) {
    draw(`CNPJ ${cnpjEmp}`, left, fy, 8, font, NAVY);
    fy -= 10;
  }
  endEmp.forEach((line) => {
    draw(line, left, fy, 8, font, NAVY);
    fy -= 10;
  });
  phones.forEach((phone) => {
    draw(String(phone), left, fy, 8, font, NAVY);
    fy -= 10;
  });
  const printed = input.printedAt || new Date().toLocaleString('pt-BR');
  drawRight(`Impresso em ${printed}`, right, footerH - 16, 7, font, MUTED);

  return pdf.save();
}

async function embedLogo(pdf: PDFDocument, dataUrl?: string) {
  const raw = String(dataUrl || '').trim();
  const match = raw.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!match) return null;
  try {
    const bytes = Buffer.from(match[2], 'base64');
    return /png/i.test(match[1]) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}
