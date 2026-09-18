import { StoreItemCategory } from '../types';

export type ParsedNfItem = {
  nItem?: number;
  cProd?: string;
  cEAN?: string;
  productName: string;
  ncm?: string;
  cfop?: string;
  quantitySent: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  uTrib?: string;
  qTrib?: number;
  infAdProd?: string;
  category: StoreItemCategory;
};

export type ParsedNfParty = {
  name?: string;
  document?: string;
  ie?: string;
  city?: string;
};

export type ParsedNfDocument = {
  source: 'xml' | 'pdf' | 'text';
  nfNumber?: string;
  series?: string;
  issuedAt?: string;
  nature?: string;
  supplier?: string;
  supplierDocument?: string;
  supplierIe?: string;
  supplierCity?: string;
  destName?: string;
  destDocument?: string;
  accessKey?: string;
  carrierName?: string;
  vehiclePlate?: string;
  vProd?: number;
  vFrete?: number;
  vNF?: number;
  items: ParsedNfItem[];
  rawXml?: string;
  rawPreview?: string;
  warnings?: string[];
};

const guessCategory = (name: string): StoreItemCategory => {
  const n = (name || '').toLowerCase();
  if (/oleo|óleo|graxa|lubrific/.test(n)) return 'Lubrificantes';
  if (/luva|capacete|bota|epi|mascara|máscara|protetor/.test(n)) return 'EPI';
  if (/chave|alicate|martelo|serra|furadeira|ferrament/.test(n)) return 'Ferramentas';
  if (/correia|rolamento|filtro|peca|peça|retentor|bomba|mangueira/.test(n)) return 'Peças';
  if (/calcario|calcário|cimento|areia|adubo|semente|diesel|s10/.test(n)) return 'Insumos';
  return 'Outros';
};

const num = (value?: string | null) => {
  if (!value) return 0;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const tag = (xml: string, name: string) => {
  const re = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'i');
  return xml.match(re)?.[1]?.trim() || '';
};

const allTags = (xml: string, name: string) => {
  const re = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'gi');
  return [...xml.matchAll(re)].map((m) => m[1]);
};

const attr = (xml: string, name: string) => {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i');
  return xml.match(re)?.[1] || '';
};

const parseParty = (block: string): ParsedNfParty => ({
  name: tag(block, 'xNome') || undefined,
  document: tag(block, 'CNPJ') || tag(block, 'CPF') || undefined,
  ie: tag(block, 'IE') || undefined,
  city: tag(block, 'xMun') || undefined
});

const accessKeyFromInfNfe = (xml: string) => {
  const infOpen = xml.match(/<(?:\w+:)?infNFe\b[^>]*>/i)?.[0] || '';
  const id = attr(infOpen, 'Id').replace(/^NFe/i, '');
  if (/^\d{44}$/.test(id)) return id;
  const fromProt = tag(xml, 'chNFe');
  if (/^\d{44}$/.test(fromProt)) return fromProt;
  return undefined;
};

export const parseNfeXml = (xml: string): ParsedNfDocument => {
  const infNFe = allTags(xml, 'infNFe')[0] || xml;
  const ide = allTags(infNFe, 'ide')[0] || '';
  const emit = allTags(infNFe, 'emit')[0] || '';
  const dest = allTags(infNFe, 'dest')[0] || '';
  const transp = allTags(infNFe, 'transp')[0] || '';
  const total = allTags(infNFe, 'total')[0] || '';
  const icmsTot = allTags(total, 'ICMSTot')[0] || total;
  const emitente = parseParty(emit);
  const destinatario = parseParty(dest);

  const detMatches = [...infNFe.matchAll(/<(?:\w+:)?det\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?det>/gi)];
  const items: ParsedNfItem[] = detMatches.map((match, index) => {
    const block = match[2];
    const prod = allTags(block, 'prod')[0] || block;
    const name = tag(prod, 'xProd') || 'Item da NF-e';
    const qty = num(tag(prod, 'qCom')) || num(tag(prod, 'qTrib')) || 1;
    const unitCost = num(tag(prod, 'vUnCom')) || num(tag(prod, 'vUnTrib'));
    const totalProd = num(tag(prod, 'vProd')) || qty * unitCost;
    const nItem = Number(attr(match[1] || '', 'nItem')) || index + 1;
    return {
      nItem,
      cProd: tag(prod, 'cProd') || undefined,
      cEAN: tag(prod, 'cEAN') || undefined,
      productName: name,
      ncm: tag(prod, 'NCM') || undefined,
      cfop: tag(prod, 'CFOP') || undefined,
      quantitySent: qty,
      unit: (tag(prod, 'uCom') || tag(prod, 'uTrib') || 'UN').toUpperCase(),
      unitCost,
      totalCost: totalProd,
      uTrib: tag(prod, 'uTrib') || undefined,
      qTrib: num(tag(prod, 'qTrib')) || undefined,
      infAdProd: tag(block, 'infAdProd') || undefined,
      category: guessCategory(name)
    };
  }).filter((it) => it.productName);

  return {
    source: 'xml',
    nfNumber: tag(ide, 'nNF') || undefined,
    series: tag(ide, 'serie') || undefined,
    issuedAt: tag(ide, 'dhEmi') || tag(ide, 'dEmi') || undefined,
    nature: tag(ide, 'natOp') || undefined,
    supplier: emitente.name,
    supplierDocument: emitente.document,
    supplierIe: emitente.ie,
    supplierCity: emitente.city,
    destName: destinatario.name,
    destDocument: destinatario.document,
    accessKey: accessKeyFromInfNfe(xml),
    carrierName: tag(transp, 'xNome') || undefined,
    vehiclePlate: (tag(transp, 'placa') || '').toUpperCase() || undefined,
    vProd: num(tag(icmsTot, 'vProd')) || undefined,
    vFrete: num(tag(icmsTot, 'vFrete')) || undefined,
    vNF: num(tag(icmsTot, 'vNF')) || undefined,
    items,
    rawXml: xml,
    rawPreview: xml.slice(0, 400)
  };
};

export const extractPdfLatinText = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let raw = '';
  for (let i = 0; i < bytes.length; i += 1) raw += String.fromCharCode(bytes[i]);
  const chunks: string[] = [];
  const tj = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  const tjMatch = raw.match(tj) || [];
  tjMatch.forEach((token: string) => {
    const inner = token.slice(1, token.lastIndexOf(')'));
    chunks.push(inner
      .replace(/\\([0-7]{1,3})/g, (_match, octal) => String.fromCharCode(parseInt(octal, 8)))
      .replace(/\\n/g, ' ').replace(/\\\)/g, ')').replace(/\\\(/g, '('));
  });
  const arr = /\[(.*?)\]\s*TJ/gs;
  let m: RegExpExecArray | null;
  while ((m = arr.exec(raw))) {
    const parts = [...m[1].matchAll(/\((?:\\.|[^\\)])*\)/g)].map((p) => p[0].slice(1, -1));
    chunks.push(parts.join(''));
  }
  return chunks.join(' ').replace(/\s+/g, ' ').trim();
};

const extractCompressedPdfText = async (buffer: ArrayBuffer): Promise<string> => {
  if (typeof DecompressionStream === 'undefined') return '';
  const raw = new TextDecoder('latin1').decode(buffer);
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const streamRe = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(raw))) {
    const start = streamRe.lastIndex;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    const dictionary = raw.slice(Math.max(0, match.index - 300), match.index);
    streamRe.lastIndex = end + 'endstream'.length;
    if (!/\/FlateDecode/.test(dictionary)) continue;
    const compressed = bytes.slice(start, end - (raw.slice(start, end).endsWith('\r\n') ? 2 : raw.slice(start, end).endsWith('\n') ? 1 : 0));
    try {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'));
      const inflated = await new Response(stream).arrayBuffer();
      const text = extractPdfLatinText(inflated);
      if (text) chunks.push(text);
    } catch {
      // PDF com filtro extra: o fluxo de UI pede o XML da mesma nota.
    }
  }
  return chunks.join(' ').replace(/\s+/g, ' ').trim();
};

export const parseDanfeText = (text: string): ParsedNfDocument => {
  const accessKey = text.replace(/\s/g, '').match(/\d{44}/)?.[0];
  const nfNumber = text.match(/N[ºo°]\s*[:.]?\s*(\d{1,9})/i)?.[1] || text.match(/NF-e\s*(\d+)/i)?.[1];
  const supplier = text.match(/RECEBEMOS DE\s+([^0-9]{8,80})/i)?.[1]?.trim()
    || text.match(/EMITENTE[:\s]+([^\n]{8,80})/i)?.[1]?.trim();
  const items: ParsedNfItem[] = [];
  const lineRe = /(\d{8,10})\s+(.+?)\s+(\d+[.,]?\d*)\s+([A-Z]{2,6})\s+(\d+[.,]\d{2})\s+(\d+[.,]\d{2})/g;
  let row: RegExpExecArray | null;
  while ((row = lineRe.exec(text))) {
    const name = row[2].trim();
    const qty = num(row[3]);
    const unitCost = num(row[5]);
    items.push({
      productName: name,
      ncm: row[1],
      quantitySent: qty || 1,
      unit: row[4],
      unitCost,
      totalCost: num(row[6]) || qty * unitCost,
      category: guessCategory(name)
    });
  }
  const warnings: string[] = [];
  if (!items.length || !accessKey) {
    warnings.push('O PDF não trouxe itens ou a chave da NF com segurança. Envie o XML da mesma nota.');
  }
  return {
    source: 'text',
    nfNumber,
    supplier,
    accessKey,
    items,
    rawPreview: text.slice(0, 500),
    warnings
  };
};

export const parseNfeFileContent = async (file: File): Promise<ParsedNfDocument> => {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.xml') || file.type.includes('xml')) {
    return parseNfeXml(await file.text());
  }
  const buffer = await file.arrayBuffer();
  const raw = new TextDecoder('latin1').decode(buffer);
  if (raw.includes('<NFe') || raw.includes('<nfeProc') || raw.includes('<infNFe')) {
    return parseNfeXml(raw);
  }
  const text = (await extractCompressedPdfText(buffer)) || extractPdfLatinText(buffer) || raw.replace(/[^\x20-\x7EÀ-ÿ\n]/g, ' ');
  return { ...parseDanfeText(text), source: 'pdf', rawPreview: text.slice(0, 500) };
};
