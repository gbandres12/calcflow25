import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { FiscalConfig, PurchaseAuthorization } from '../../types.js';

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

export interface PurchaseAuthorizationPdfInput {
  authorization: PurchaseAuthorization;
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

export async function generatePurchaseAuthorizationPdf(
  input: PurchaseAuthorizationPdfInput
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const auth = input.authorization;
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

  const left = MARGIN;
  const right = PAGE_W - MARGIN;
  const width = right - left;
  const footerH = 74;

  const textWidth = (t: string, size: number, face: PDFFont) =>
    face.widthOfTextAtSize(pdfSafe(t), size);

  const wrap = (text: string, max: number, size: number, face: PDFFont): string[] => {
    const words = pdfSafe(text).split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
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

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const draw = (t: string, x: number, yy: number, size: number, face: PDFFont, color = TEXT) =>
    page.drawText(pdfSafe(t), { x, y: yy, size, font: face, color });

  const drawRight = (t: string, xRight: number, yy: number, size: number, face: PDFFont, color = TEXT) =>
    draw(t, xRight - textWidth(t, size, face), yy, size, face, color);

  const drawCenter = (t: string, x: number, w: number, yy: number, size: number, face: PDFFont, color = TEXT) =>
    draw(t, x + (w - textWidth(t, size, face)) / 2, yy, size, face, color);

  const drawTracked = (
    t: string,
    x: number,
    yy: number,
    size: number,
    face: PDFFont,
    color = TEXT,
    tracking = 0.8
  ) => {
    let cx = x;
    for (const char of pdfSafe(t)) {
      page.drawText(char, { x: cx, y: yy, size, font: face, color });
      cx += face.widthOfTextAtSize(char, size) + tracking;
    }
  };

  const drawFooter = () => {
    page.drawLine({
      start: { x: left, y: footerH + 10 },
      end: { x: right, y: footerH + 10 },
      thickness: 1.2,
      color: NAVY
    });
    let fy = footerH - 4;
    draw(razao, left, fy, 9.5, bold, NAVY);
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
    drawRight(`Impresso em ${printed}`, right, footerH - 4, 7.5, font, MUTED);
  };

  // Header
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

  const title = 'AUTORIZAÇÃO DE COMPRA';
  const titleW = [...title].reduce((sum, char) => sum + textWidth(char, 14, bold) + 0.8, -0.8);
  drawTracked(title, right - titleW, y - 8, 14, bold, GREEN, 0.8);

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
  draw(dash(auth.number), badgeX + 36, badgeY + 5, 10, bold, TEXT);

  y = badgeY - 16;
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 1.5,
    color: NAVY
  });

  // Metadata box
  y -= 14;
  const metaRows = [
    { label: 'COMPRADOR AUTORIZADO', value: dash(auth.authorizedBuyer), label2: 'DATA', value2: formatDate(auth.date) },
    { label: 'AUTORIZADO POR', value: dash(auth.authorizedBy), label2: 'FORNECEDOR', value2: dash(auth.supplierName) }
  ];
  const metaH = metaRows.length * 32 + 12;
  page.drawRectangle({
    x: left,
    y: y - metaH,
    width,
    height: metaH,
    color: ROW_ALT,
    borderColor: BORDER,
    borderWidth: 1
  });

  let my = y - 16;
  const col2X = left + width * 0.58;
  metaRows.forEach((r) => {
    draw(r.label, left + 12, my, 7.5, bold, MUTED);
    draw(r.value, left + 12, my - 12, 10, bold, TEXT);
    draw(r.label2, col2X, my, 7.5, bold, MUTED);
    draw(r.value2, col2X, my - 12, 10, bold, TEXT);
    my -= 32;
  });

  y = y - metaH - 18;

  // Table header
  const colIdxW = 32;
  const colUnitW = 76;
  const colQtyW = 96;
  const colProdW = width - colIdxW - colUnitW - colQtyW;

  const drawTableHeader = (yy: number) => {
    page.drawRectangle({ x: left, y: yy - 22, width, height: 22, color: NAVY });
    drawCenter('#', left, colIdxW, yy - 15, 8.5, bold, WHITE);
    draw('PRODUTO / DESCRIÇÃO', left + colIdxW + 8, yy - 15, 8.5, bold, WHITE);
    drawCenter('UNIDADE', left + colIdxW + colProdW, colUnitW, yy - 15, 8.5, bold, WHITE);
    drawRight('QTD. AUTORIZADA', right - 10, yy - 15, 8.5, bold, WHITE);
    return yy - 22;
  };

  y = drawTableHeader(y);

  const items = auth.items || [];
  items.forEach((item, index) => {
    const descLines = wrap(item.productName || '-', colProdW - 16, 9.5, bold);
    const noteLines = item.notes ? wrap(`Obs: ${item.notes}`, colProdW - 16, 8, font) : [];
    const rowH = Math.max(24, descLines.length * 12 + noteLines.length * 10 + 10);

    if (y - rowH < footerH + 95) {
      drawFooter();
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      y = drawTableHeader(y);
    }

    if (index % 2 === 1) {
      page.drawRectangle({ x: left, y: y - rowH, width, height: rowH, color: ROW_ALT });
    }
    page.drawRectangle({
      x: left,
      y: y - rowH,
      width,
      height: rowH,
      borderColor: BORDER,
      borderWidth: 0.6
    });

    drawCenter(String(index + 1).padStart(2, '0'), left, colIdxW, y - 15, 9, font, MUTED);

    let ty = y - 14;
    descLines.forEach((line) => {
      draw(line, left + colIdxW + 8, ty, 9.5, bold, TEXT);
      ty -= 12;
    });
    noteLines.forEach((line) => {
      draw(line, left + colIdxW + 8, ty, 8, font, MUTED);
      ty -= 10;
    });

    drawCenter((item.unit || 'UN').toUpperCase(), left + colIdxW + colProdW, colUnitW, y - 15, 9, bold, TEXT);
    drawRight(formatQty(item.quantity), right - 10, y - 15, 9.5, bold, NAVY);

    y -= rowH;
  });

  // Notes block
  if (auth.notes && auth.notes.trim()) {
    const noteLines = wrap(auth.notes.trim(), width - 24, 9, font);
    const notesH = noteLines.length * 12 + 24;
    if (y - notesH < footerH + 80) {
      drawFooter();
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
    y -= 14;
    page.drawRectangle({
      x: left,
      y: y - notesH,
      width,
      height: notesH,
      color: ROW_ALT,
      borderColor: BORDER,
      borderWidth: 0.8
    });
    draw('OBSERVAÇÕES', left + 12, y - 14, 7.5, bold, MUTED);
    let ny = y - 26;
    noteLines.forEach((line) => {
      draw(line, left + 12, ny, 9, font, TEXT);
      ny -= 12;
    });
    y -= notesH;
  }

  // Signatures
  const sigY = Math.max(footerH + 42, y - 58);
  const sigW = (width - 40) / 2;
  page.drawLine({ start: { x: left, y: sigY }, end: { x: left + sigW, y: sigY }, thickness: 0.8, color: NAVY });
  drawCenter(dash(auth.authorizedBuyer), left, sigW, sigY - 12, 8.5, bold, TEXT);
  drawCenter('Comprador Autorizado', left, sigW, sigY - 22, 7.5, font, MUTED);

  const sig2X = left + sigW + 40;
  page.drawLine({ start: { x: sig2X, y: sigY }, end: { x: sig2X + sigW, y: sigY }, thickness: 0.8, color: NAVY });
  drawCenter(dash(auth.authorizedBy), sig2X, sigW, sigY - 12, 8.5, bold, TEXT);
  drawCenter('Autorizador / Responsável', sig2X, sigW, sigY - 22, 7.5, font, MUTED);

  drawFooter();
  return pdf.save();
}

export async function openPurchaseAuthorizationPdf(
  input: PurchaseAuthorizationPdfInput,
  targetWindow?: Window | null
): Promise<void> {
  const bytes = await generatePurchaseAuthorizationPdf(input);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  if (targetWindow && !targetWindow.closed) {
    targetWindow.location.href = url;
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function embedLogo(pdf: PDFDocument, dataUrl?: string) {
  const raw = String(dataUrl || '').trim();
  const match = raw.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!match) return null;
  try {
    let bytes: Uint8Array;
    if (typeof atob === 'function') {
      const bin = atob(match[2]);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = Buffer.from(match[2], 'base64');
    }
    return /png/i.test(match[1]) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}
