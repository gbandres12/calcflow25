import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Company, PurchaseOrder } from '../../types';

const FOREST = rgb(15 / 255, 89 / 255, 72 / 255);
const SLATE_DARK = rgb(22 / 255, 60 / 255, 53 / 255);
const BORDER = rgb(210 / 255, 220 / 255, 212 / 255);
const ROW_ALT = rgb(247 / 255, 249 / 255, 246 / 255);
const TEXT = rgb(30 / 255, 41 / 255, 59 / 255);
const MUTED = rgb(100 / 255, 116 / 255, 139 / 255);
const WHITE = rgb(1, 1, 1);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 34;

const pdfSafe = (value?: string | number | null): string =>
  String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\u2014|\u2013/g, '-')
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '');

const formatBRL = (value?: number): string =>
  pdfSafe((Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

const formatDateBR = (dateStr?: string): string => {
  if (!dateStr) return '-';
  const s = String(dateStr).trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  return pdfSafe(dateStr);
};

const statusLabel = (status: PurchaseOrder['status']): string => {
  switch (status) {
    case 'RASCUNHO':
      return 'RASCUNHO / SOLICITACAO';
    case 'EM_COTACAO':
      return 'EM COTACAO';
    case 'AGUARDANDO_APROVACAO':
      return 'AGUARDANDO APROVACAO';
    case 'APROVADA':
      return 'APROVADA / PEDIDO EMITIDO';
    case 'RECEBIDA':
      return 'RECEBIDA / FATURADA';
    case 'CANCELADA':
      return 'CANCELADA';
    default:
      return status;
  }
};

export async function buildPurchaseOrderPdf(
  po: PurchaseOrder,
  company?: Company | null
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(`Ordem de Compra ${po.reference} - ${po.supplierName || 'Fornecedor'}`));

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const contentW = PAGE_W - MARGIN * 2;
  let y = PAGE_H - MARGIN;

  // Cabeçalho Institucional
  page.drawRectangle({
    x: MARGIN,
    y: y - 64,
    width: contentW,
    height: 64,
    color: SLATE_DARK
  });

  page.drawText(pdfSafe(company?.name || 'CALCARIOFLOW MINERACAO E INDUSTRIA'), {
    x: MARGIN + 16,
    y: y - 24,
    size: 13,
    font: bold,
    color: WHITE
  });

  const companyMeta = [
    company?.document ? `CNPJ: ${company.document}` : '',
    company?.city && company?.state ? `${company.city}/${company.state}` : '',
    company?.phone ? `Tel: ${company.phone}` : ''
  ]
    .filter(Boolean)
    .join('  |  ');

  page.drawText(pdfSafe(companyMeta || 'Gestao de Suprimentos & Ordens de Compra'), {
    x: MARGIN + 16,
    y: y - 40,
    size: 8.5,
    font,
    color: rgb(210 / 255, 228 / 255, 220 / 255)
  });

  page.drawText(pdfSafe(`ORDEM DE COMPRA #${po.reference}`), {
    x: PAGE_W - MARGIN - 195,
    y: y - 24,
    size: 11,
    font: bold,
    color: WHITE
  });

  page.drawText(pdfSafe(`Status: ${statusLabel(po.status)}`), {
    x: PAGE_W - MARGIN - 195,
    y: y - 40,
    size: 8.5,
    font: bold,
    color: rgb(241 / 255, 214 / 255, 122 / 255)
  });

  page.drawText(pdfSafe(`Emissao: ${formatDateBR(po.date)}`), {
    x: PAGE_W - MARGIN - 195,
    y: y - 53,
    size: 8,
    font,
    color: WHITE
  });

  y -= 78;

  // Bloco Fornecedor & Classificação Orçamentária
  const boxH = 74;
  page.drawRectangle({
    x: MARGIN,
    y: y - boxH,
    width: contentW,
    height: boxH,
    color: ROW_ALT,
    borderColor: BORDER,
    borderWidth: 1
  });

  const colMid = MARGIN + contentW * 0.52;

  page.drawText('DADOS DO FORNECEDOR', {
    x: MARGIN + 12,
    y: y - 15,
    size: 7.5,
    font: bold,
    color: FOREST
  });
  page.drawText(pdfSafe(`Razao Social / Nome: ${po.supplierName || 'A definir'}`).slice(0, 58), {
    x: MARGIN + 12,
    y: y - 30,
    size: 9,
    font: bold,
    color: TEXT
  });
  page.drawText(pdfSafe(`CNPJ / CPF: ${po.supplierDocument || '-'}`), {
    x: MARGIN + 12,
    y: y - 44,
    size: 8.5,
    font,
    color: MUTED
  });
  page.drawText(pdfSafe(`Contato: ${po.supplierContact || '-'}`), {
    x: MARGIN + 12,
    y: y - 58,
    size: 8.5,
    font,
    color: MUTED
  });

  page.drawText('ALOCACAO ORCAMENTARIA E ENTREGA', {
    x: colMid,
    y: y - 15,
    size: 7.5,
    font: bold,
    color: FOREST
  });
  page.drawText(pdfSafe(`Centro de Custo: ${po.costCenterName || po.costCenterId}`).slice(0, 52), {
    x: colMid,
    y: y - 30,
    size: 9,
    font: bold,
    color: TEXT
  });
  page.drawText(pdfSafe(`Categoria: ${po.category || '-'}`).slice(0, 52), {
    x: colMid,
    y: y - 44,
    size: 8.5,
    font,
    color: MUTED
  });
  page.drawText(
    pdfSafe(
      `Solicitante: ${po.requesterName || '-'}   |   Prev. Entrega: ${formatDateBR(po.expectedDeliveryDate)}`
    ).slice(0, 56),
    {
      x: colMid,
      y: y - 58,
      size: 8,
      font,
      color: MUTED
    }
  );

  y -= boxH + 16;

  // Cabeçalho da Tabela de Itens
  const tableHeaderH = 22;
  page.drawRectangle({
    x: MARGIN,
    y: y - tableHeaderH,
    width: contentW,
    height: tableHeaderH,
    color: FOREST
  });

  const colIdx = MARGIN + 8;
  const colDesc = MARGIN + 34;
  const colQty = MARGIN + 310;
  const colUnit = MARGIN + 365;
  const colPrice = MARGIN + 410;
  const colTotal = MARGIN + 475;

  page.drawText('#', { x: colIdx, y: y - 15, size: 8, font: bold, color: WHITE });
  page.drawText('DESCRICAO DO ITEM / ESPECIFICACAO', { x: colDesc, y: y - 15, size: 8, font: bold, color: WHITE });
  page.drawText('QTD', { x: colQty, y: y - 15, size: 8, font: bold, color: WHITE });
  page.drawText('UN', { x: colUnit, y: y - 15, size: 8, font: bold, color: WHITE });
  page.drawText('VL. UNIT.', { x: colPrice, y: y - 15, size: 8, font: bold, color: WHITE });
  page.drawText('TOTAL', { x: colTotal, y: y - 15, size: 8, font: bold, color: WHITE });

  y -= tableHeaderH;

  const rowH = 20;
  const items = Array.isArray(po.items) ? po.items : [];
  items.slice(0, 18).forEach((item, index) => {
    if (index % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y: y - rowH,
        width: contentW,
        height: rowH,
        color: ROW_ALT
      });
    }
    page.drawLine({
      start: { x: MARGIN, y: y - rowH },
      end: { x: MARGIN + contentW, y: y - rowH },
      color: BORDER,
      thickness: 0.5
    });

    page.drawText(String(index + 1).padStart(2, '0'), {
      x: colIdx,
      y: y - 14,
      size: 8.5,
      font,
      color: MUTED
    });
    page.drawText(pdfSafe(item.description).slice(0, 52), {
      x: colDesc,
      y: y - 14,
      size: 8.5,
      font: bold,
      color: TEXT
    });
    page.drawText(pdfSafe(Number(item.quantity || 0).toLocaleString('pt-BR')), {
      x: colQty,
      y: y - 14,
      size: 8.5,
      font,
      color: TEXT
    });
    page.drawText(pdfSafe(item.unit || 'UN').slice(0, 6), {
      x: colUnit,
      y: y - 14,
      size: 8.5,
      font,
      color: MUTED
    });
    page.drawText(formatBRL(item.unitPrice), {
      x: colPrice,
      y: y - 14,
      size: 8.5,
      font,
      color: TEXT
    });
    page.drawText(formatBRL(item.total), {
      x: colTotal,
      y: y - 14,
      size: 8.5,
      font: bold,
      color: TEXT
    });

    y -= rowH;
  });

  y -= 14;

  // Bloco Condições Financeiras + Totais
  const summaryH = 74;
  page.drawRectangle({
    x: MARGIN,
    y: y - summaryH,
    width: contentW,
    height: summaryH,
    color: ROW_ALT,
    borderColor: BORDER,
    borderWidth: 1
  });

  page.drawText('CONDICOES COMERCIAIS E PAGAMENTO', {
    x: MARGIN + 12,
    y: y - 16,
    size: 7.5,
    font: bold,
    color: FOREST
  });
  page.drawText(
    pdfSafe(
      `Forma de Pagamento: ${po.paymentMethod || 'A combinar'}   |   Parcelas: ${po.installmentsCount || 1}x`
    ),
    {
      x: MARGIN + 12,
      y: y - 31,
      size: 8.5,
      font,
      color: TEXT
    }
  );
  page.drawText(pdfSafe(`1o Vencimento Previsto: ${formatDateBR(po.firstDueDate)}`), {
    x: MARGIN + 12,
    y: y - 45,
    size: 8.5,
    font,
    color: MUTED
  });
  if (po.approvedBy) {
    page.drawText(
      pdfSafe(`Aprovado por: ${po.approvedBy} (${formatDateBR(po.approvedAt)})`).slice(0, 56),
      {
        x: MARGIN + 12,
        y: y - 59,
        size: 8,
        font: bold,
        color: FOREST
      }
    );
  }

  const rightX = PAGE_W - MARGIN - 185;
  page.drawText(`Subtotal: ${formatBRL(po.subtotal)}`, {
    x: rightX,
    y: y - 18,
    size: 8.5,
    font,
    color: MUTED
  });
  page.drawText(`Desconto: - ${formatBRL(po.discount)}`, {
    x: rightX,
    y: y - 32,
    size: 8.5,
    font,
    color: MUTED
  });
  page.drawText(`Frete / Outros: + ${formatBRL(po.shipping)}`, {
    x: rightX,
    y: y - 46,
    size: 8.5,
    font,
    color: MUTED
  });
  page.drawText(`TOTAL OC: ${formatBRL(po.total)}`, {
    x: rightX,
    y: y - 63,
    size: 11,
    font: bold,
    color: SLATE_DARK
  });

  y -= summaryH + 16;

  // Observações
  if (po.notes) {
    page.drawText('OBSERVACOES E INSTRUCOES DE ENTREGA:', {
      x: MARGIN,
      y: y - 10,
      size: 8,
      font: bold,
      color: TEXT
    });
    page.drawText(pdfSafe(po.notes).slice(0, 115), {
      x: MARGIN,
      y: y - 24,
      size: 8.5,
      font,
      color: MUTED
    });
    y -= 42;
  }

  // Assinaturas no Rodapé
  const sigY = Math.max(85, y - 70);
  const sigW = (contentW - 40) / 2;

  page.drawLine({
    start: { x: MARGIN, y: sigY },
    end: { x: MARGIN + sigW, y: sigY },
    color: BORDER,
    thickness: 1
  });
  page.drawText(pdfSafe(po.requesterName || 'Solicitante / Compras'), {
    x: MARGIN + 10,
    y: sigY - 13,
    size: 8.5,
    font: bold,
    color: TEXT
  });
  page.drawText('Responsavel pela Solicitacao', {
    x: MARGIN + 10,
    y: sigY - 24,
    size: 7.5,
    font,
    color: MUTED
  });

  const sig2X = MARGIN + sigW + 40;
  page.drawLine({
    start: { x: sig2X, y: sigY },
    end: { x: sig2X + sigW, y: sigY },
    color: BORDER,
    thickness: 1
  });
  page.drawText(pdfSafe(po.approvedBy || 'Diretoria / Aprovacao Financeira'), {
    x: sig2X + 10,
    y: sigY - 13,
    size: 8.5,
    font: bold,
    color: TEXT
  });
  page.drawText('Autorizacao de Compra e Verba', {
    x: sig2X + 10,
    y: sigY - 24,
    size: 7.5,
    font,
    color: MUTED
  });

  return await pdf.save();
}

export async function openPurchaseOrderPdfInBrowser(
  po: PurchaseOrder,
  company?: Company | null
): Promise<void> {
  const bytes = await buildPurchaseOrderPdf(po, company);
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${po.reference || 'ordem-compra'}.pdf`;
    a.click();
  }
}
