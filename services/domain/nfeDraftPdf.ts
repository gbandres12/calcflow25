import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import {
  Company,
  Customer,
  FiscalConfig,
  FRETE_MODALIDADES,
  SaleOrder,
  SaleOrderLinkedNfe,
} from '../../types.js';
import { overlayLinkedNfeDocument } from '../saleNfe.js';

const NAVY = rgb(11 / 255, 31 / 255, 74 / 255);
const TEXT = rgb(26 / 255, 35 / 255, 50 / 255);
const MUTED = rgb(91 / 255, 101 / 255, 115 / 255);
const BORDER = rgb(160 / 255, 168 / 255, 180 / 255);
const ROW_ALT = rgb(247 / 255, 249 / 255, 252 / 255);
const AMBER = rgb(180 / 255, 83 / 255, 9 / 255);
const AMBER_BG = rgb(255 / 255, 247 / 255, 237 / 255);
const WHITE = rgb(1, 1, 1);
const WATERMARK = rgb(200 / 255, 120 / 255, 30 / 255);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 28;

const pdfSafe = (value: string): string =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\u2014|\u2013/g, '-')
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '');

export interface NfeDraftPdfInput {
  order: SaleOrder;
  customer: Customer;
  config: FiscalConfig;
  company?: Company | null;
  linkedNfe?: SaleOrderLinkedNfe | null;
  printedAt?: string;
}

export function orderForDraftPdf(order: SaleOrder, linked?: SaleOrderLinkedNfe | null): SaleOrder {
  if (!linked) {
    return { ...order, nfeStatus: order.nfeStatus || 'rascunho' };
  }
  return overlayLinkedNfeDocument(order, linked);
}

export function draftPdfFileName(order: SaleOrder): string {
  const ref = String(order.nfeNumero || order.reference || 'rascunho')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 40);
  return `RASCUNHO_NFe_${ref}.pdf`;
}

const money = (value: number): string =>
  (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const qty = (value: number): string =>
  (Number(value) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const dash = (value?: string | number | null): string => {
  if (value === undefined || value === null || String(value).trim() === '') return '-';
  return String(value);
};

function bytesFromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function embedLogo(pdf: PDFDocument, dataUrl?: string) {
  const raw = String(dataUrl || '').trim();
  const match = raw.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!match) return null;
  try {
    const bytes = bytesFromBase64(match[2]);
    return /png/i.test(match[1]) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

function emitenteLines(config: FiscalConfig, company?: Company | null): {
  razao: string;
  fantasia: string;
  cnpj: string;
  ie: string;
  endereco: string[];
} {
  const razao = config.razaoSocial || company?.corporateName || company?.name || 'Emitente';
  const fantasia = config.nomeFantasia || company?.tradeName || '';
  const cnpj = config.cnpjEmitente || company?.cnpj || company?.document || '';
  const ie = config.inscricaoEstadual || company?.ie || company?.stateRegistration || '';
  const street = [config.logradouroEmitente, config.numeroEmitente, config.complementoEmitente]
    .filter(Boolean)
    .join(', ');
  const city = [config.bairroEmitente, config.cidadeEmitente, config.ufEmitente].filter(Boolean).join(' / ');
  const cep = config.cepEmitente ? `CEP ${config.cepEmitente}` : '';
  const phone = config.telefoneEmitente || company?.phone || '';
  return {
    razao,
    fantasia,
    cnpj,
    ie,
    endereco: [street, city, [cep, phone].filter(Boolean).join(' · ')].filter((l) => l && l.trim()),
  };
}

function destLines(customer: Customer): string[] {
  const addr = [customer.street, customer.number].filter(Boolean).join(', ');
  const city = [customer.neighborhood, customer.city, customer.state].filter(Boolean).join(' / ');
  const cep = customer.zipCode ? `CEP ${customer.zipCode}` : '';
  return [addr, city, cep, customer.email].filter((l) => l && String(l).trim());
}

function freteLabel(mod?: number): string {
  const found = FRETE_MODALIDADES.find((m) => m.value === mod);
  return found ? found.label : `${mod ?? 9} - Modalidade de frete`;
}

/**
 * PDF A4 de prévia da NF-e em rascunho.
 * Não é DANFE oficial: marca RASCUNHO / SEM VALOR FISCAL e não tem chave SEFAZ.
 */
export async function buildNfeDraftPdf(input: NfeDraftPdfInput): Promise<Uint8Array> {
  const order = orderForDraftPdf(input.order, input.linkedNfe);
  const customer = input.customer;
  const config = input.config;
  const emit = emitenteLines(config, input.company);
  const items = Array.isArray(order.items) ? order.items : [];
  const ambiente = config.environment === 'production' ? 'PRODUCAO' : 'HOMOLOGACAO';
  const numero = String(order.nfeNumero || config.proxNumeroNFe || '-');
  const serie = String(order.nfeSerie || config.serieNFe || '1');
  const natureza = order.nfeNaturezaOperacao || config.naturezaOperacaoPadrao || 'Venda';
  const printed = input.printedAt || new Date().toLocaleString('pt-BR');
  const infCpl = String(order.nfeInfCpl || '').trim();
  const frete = order.frete || {};
  const transp = frete.transportadora;
  const veiculo = frete.veiculo;
  const volumes = frete.volumes;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(pdf, config.logoDataUrl);

  const pages: PDFPage[] = [];
  const addPage = (): PDFPage => {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    return page;
  };

  let page = addPage();
  const left = MARGIN;
  const right = PAGE_W - MARGIN;
  const width = right - left;
  let y = PAGE_H - 22;

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
    let cur = '';
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (face.widthOfTextAtSize(next, size) <= max) {
        cur = next;
      } else {
        if (cur) lines.push(cur);
        cur = word;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const rect = (x: number, yy: number, w: number, h: number, fill?: ReturnType<typeof rgb>) => {
    page.drawRectangle({
      x,
      y: yy,
      width: w,
      height: h,
      borderColor: BORDER,
      borderWidth: 0.6,
      color: fill,
    });
  };

  const label = (text: string, x: number, yy: number) => draw(text, x, yy, 6, bold, MUTED);

  const ensure = (need: number) => {
    if (y - need < 56) {
      page = addPage();
      y = PAGE_H - 36;
    }
  };

  // --- Cabeçalho DANFE-like ---
  const headerH = 78;
  rect(left, y - headerH, width * 0.58, headerH, WHITE);
  rect(left + width * 0.58, y - headerH, width * 0.42, headerH, WHITE);

  if (logo) {
    const maxH = 36;
    const maxW = 56;
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    page.drawImage(logo, {
      x: left + 6,
      y: y - 42,
      width: logo.width * scale,
      height: logo.height * scale,
    });
    draw(fit(emit.razao, 8, width * 0.58 - 72, bold), left + 66, y - 18, 8, bold);
    if (emit.fantasia) draw(fit(emit.fantasia, 7, width * 0.58 - 72), left + 66, y - 30, 7, font, MUTED);
  } else {
    draw(fit(emit.razao, 9, width * 0.58 - 12, bold), left + 6, y - 16, 9, bold);
    if (emit.fantasia) draw(fit(emit.fantasia, 7, width * 0.58 - 12), left + 6, y - 28, 7, font, MUTED);
  }
  draw(`CNPJ ${dash(emit.cnpj)}  IE ${dash(emit.ie)}`, left + 6, y - 52, 7);
  emit.endereco.slice(0, 2).forEach((line, i) => {
    draw(fit(line, 6.5, width * 0.58 - 12), left + 6, y - 64 - i * 9, 6.5, font, MUTED);
  });

  const boxX = left + width * 0.58;
  draw('DANFE', boxX + 8, y - 16, 12, bold, NAVY);
  draw('Documento Auxiliar da NF-e', boxX + 8, y - 28, 7, font, MUTED);
  draw('1 - Retrato', boxX + 8, y - 40, 7);
  draw(`NF-e N. ${numero}  Serie ${serie}`, boxX + 8, y - 54, 8, bold);
  draw(`Ambiente: ${ambiente}`, boxX + 8, y - 66, 7, font, MUTED);
  y -= headerH + 8;

  rect(left, y - 22, width, 22, AMBER_BG);
  draw('RASCUNHO  -  SEM VALOR FISCAL', left + 8, y - 15, 10, bold, AMBER);
  drawRight('Previa interna. Nao substitui o DANFE oficial.', right - 8, y - 15, 7, font, AMBER);
  y -= 28;

  rect(left, y - 18, width, 18, ROW_ALT);
  label('CHAVE DE ACESSO', left + 4, y - 8);
  draw('Nao gerada  -  rascunho ainda nao transmitido a SEFAZ', left + 92, y - 13, 8, bold, MUTED);
  y -= 24;

  // Destinatário
  const destH = 52;
  rect(left, y - destH, width, destH);
  label('DESTINATARIO', left + 4, y - 9);
  draw(fit(customer.name || 'Cliente', 9, width - 16, bold), left + 4, y - 22, 9, bold);
  draw(`CNPJ/CPF ${dash(customer.document)}   IE ${customer.isentoIE ? 'ISENTO' : dash(customer.ie)}`, left + 4, y - 34, 7);
  destLines(customer).slice(0, 2).forEach((line, i) => {
    draw(fit(line, 7, width - 12), left + 4, y - 44 - i * 9, 7, font, MUTED);
  });
  y -= destH + 6;

  rect(left, y - 18, width * 0.62, 18);
  rect(left + width * 0.62, y - 18, width * 0.38, 18);
  label('NATUREZA DA OPERACAO', left + 4, y - 8);
  draw(fit(natureza, 8, width * 0.62 - 10), left + 4, y - 16, 8);
  label('PEDIDO / REF.', left + width * 0.62 + 4, y - 8);
  draw(fit(order.reference || '-', 8, width * 0.38 - 10, bold), left + width * 0.62 + 4, y - 16, 8, bold);
  y -= 24;

  // Itens
  const cols = [
    { key: 'cod', title: 'COD', w: 36 },
    { key: 'desc', title: 'DESCRICAO DO PRODUTO', w: 168 },
    { key: 'ncm', title: 'NCM', w: 52 },
    { key: 'cfop', title: 'CFOP', w: 32 },
    { key: 'cst', title: 'CST', w: 28 },
    { key: 'un', title: 'UN', w: 24 },
    { key: 'qtd', title: 'QTD', w: 48 },
    { key: 'vu', title: 'VL UNIT', w: 70 },
    { key: 'vt', title: 'VL TOTAL', w: 81 },
  ];
  const tableW = cols.reduce((s, c) => s + c.w, 0);

  const drawTableHeader = () => {
    ensure(18);
    rect(left, y - 14, tableW, 14, NAVY);
    let x = left;
    cols.forEach((col) => {
      draw(col.title, x + 2, y - 10, 6, bold, WHITE);
      x += col.w;
    });
    y -= 14;
  };

  drawTableHeader();

  items.forEach((it, idx) => {
    const desc = String(it.productDescription || it.productName || '');
    const descLines = wrap(desc, 7, cols[1].w - 4).slice(0, 2);
    const rowH = Math.max(16, 8 + descLines.length * 9);
    ensure(rowH + 4);
    if (y - rowH < 56) {
      page = addPage();
      y = PAGE_H - 36;
      drawTableHeader();
    }
    if (idx % 2 === 1) rect(left, y - rowH, tableW, rowH, ROW_ALT);
    else rect(left, y - rowH, tableW, rowH);

    const cells = [
      dash(it.productCode),
      '',
      dash(it.ncm),
      dash(it.cfop),
      dash(it.cst || it.csosn),
      dash(it.unit),
      qty(it.quantity),
      money(it.unitPrice),
      money(it.total),
    ];
    let x = left;
    cells.forEach((cell, ci) => {
      if (ci === 1) {
        descLines.forEach((line, li) => {
          draw(line, x + 2, y - 10 - li * 9, 7);
        });
      } else {
        const alignRight = ci >= 6;
        if (alignRight) drawRight(fit(cell, 6.5, cols[ci].w - 4), x + cols[ci].w - 2, y - 10, 6.5);
        else draw(fit(cell, 6.5, cols[ci].w - 4), x + 2, y - 10, 6.5);
      }
      x += cols[ci].w;
    });
    y -= rowH;
  });

  if (!items.length) {
    ensure(20);
    rect(left, y - 16, tableW, 16);
    draw('Nenhum item no rascunho.', left + 6, y - 11, 8, font, MUTED);
    y -= 16;
  }

  y -= 8;
  ensure(78);
  const totW = 220;
  const totX = right - totW;
  const totRows: [string, string][] = [
    ['Produtos', money(order.subtotal)],
    ['Desconto', money(order.discount)],
    ['Frete', money(order.shipping)],
    ['Total da NF-e', money(order.total)],
  ];
  totRows.forEach(([k, v], i) => {
    const h = 16;
    const last = i === totRows.length - 1;
    rect(totX, y - h, totW, h, last ? AMBER_BG : WHITE);
    draw(k, totX + 6, y - 11, last ? 8 : 7, last ? bold : font);
    drawRight(v, totX + totW - 6, y - 11, last ? 8 : 7, last ? bold : font);
    y -= h;
  });
  y -= 8;

  ensure(64);
  const transpH = 56;
  rect(left, y - transpH, width, transpH);
  label('TRANSPORTADOR / VOLUMES', left + 4, y - 9);
  draw(fit(freteLabel(Number(frete.modalidade ?? 9)), 7.5, width - 12), left + 4, y - 21, 7.5);
  draw(
    fit(
      `Transportador: ${dash(transp?.nome)}  CNPJ/CPF ${dash(transp?.documento)}  IE ${dash(transp?.ie)}`,
      7,
      width - 12
    ),
    left + 4,
    y - 33,
    7
  );
  draw(
    fit(
      `Placa ${dash(veiculo?.placa)}/${dash(veiculo?.uf)}  Volumes ${dash(volumes?.quantidade)} ${dash(volumes?.especie)}  Peso L/B ${dash(volumes?.pesoLiquido)}/${dash(volumes?.pesoBruto)} kg`,
      7,
      width - 12
    ),
    left + 4,
    y - 45,
    7
  );
  y -= transpH + 8;

  ensure(48);
  const infLines = wrap(infCpl || 'Sem informacoes complementares.', 7, width - 12).slice(0, 8);
  const infH = Math.max(36, 16 + infLines.length * 9);
  ensure(infH + 4);
  rect(left, y - infH, width, infH);
  label('DADOS ADICIONAIS / INFORMACOES COMPLEMENTARES', left + 4, y - 9);
  infLines.forEach((line, i) => {
    draw(line, left + 4, y - 20 - i * 9, 7);
  });
  y -= infH + 10;

  ensure(24);
  draw('Previa gerada no ERP. Sem protocolo, sem chave de acesso e sem validade juridica.', left, y, 7, font, MUTED);
  drawRight(`Impresso em ${printed}`, right, y, 7, font, MUTED);

  pages.forEach((p, i) => {
    p.drawText(pdfSafe('RASCUNHO'), {
      x: 90,
      y: 280,
      size: 54,
      font: bold,
      color: WATERMARK,
      rotate: degrees(38),
      opacity: 0.12,
    });
    p.drawText(pdfSafe('SEM VALOR FISCAL'), {
      x: 70,
      y: 230,
      size: 28,
      font: bold,
      color: WATERMARK,
      rotate: degrees(38),
      opacity: 0.12,
    });
    p.drawText(pdfSafe(`Pagina ${i + 1}/${pages.length}`), {
      x: right - 70,
      y: 14,
      size: 7,
      font,
      color: MUTED,
    });
  });

  return pdf.save();
}
