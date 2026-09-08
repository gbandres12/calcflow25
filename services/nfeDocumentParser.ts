export type ParsedNfItem = {
  productName: string;
  ncm?: string;
  cfop?: string;
  quantitySent: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  category: 'Peças' | 'Lubrificantes' | 'EPI' | 'Ferramentas' | 'Insumos' | 'Outros';
};

export type ParsedNfDocument = {
  source: 'xml' | 'pdf' | 'text';
  nfNumber?: string;
  series?: string;
  issuedAt?: string;
  supplier?: string;
  supplierDocument?: string;
  accessKey?: string;
  items: ParsedNfItem[];
  rawPreview?: string;
};

const guessCategory = (name: string): ParsedNfItem['category'] => {
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
  const re = new RegExp(`<(?:\\w+:)?${name}[^>]*>([^<]*)</(?:\\w+:)?${name}>`, 'i');
  return xml.match(re)?.[1]?.trim() || '';
};

const allTags = (xml: string, name: string) => {
  const re = new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'gi');
  return [...xml.matchAll(re)].map((m) => m[1]);
};

export const parseNfeXml = (xml: string): ParsedNfDocument => {
  const dets = allTags(xml, 'det');
  const items: ParsedNfItem[] = dets.map((block) => {
    const name = tag(block, 'xProd') || 'Item da NF-e';
    const qty = num(tag(block, 'qCom')) || num(tag(block, 'qTrib')) || 1;
    const unitCost = num(tag(block, 'vUnCom')) || num(tag(block, 'vUnTrib'));
    const total = num(tag(block, 'vProd')) || qty * unitCost;
    return {
      productName: name,
      ncm: tag(block, 'NCM') || undefined,
      cfop: tag(block, 'CFOP') || undefined,
      quantitySent: qty,
      unit: (tag(block, 'uCom') || tag(block, 'uTrib') || 'UN').toUpperCase(),
      unitCost,
      totalCost: total,
      category: guessCategory(name)
    };
  }).filter((it) => it.productName);

  return {
    source: 'xml',
    nfNumber: tag(xml, 'nNF') || undefined,
    series: tag(xml, 'serie') || undefined,
    issuedAt: tag(xml, 'dhEmi') || tag(xml, 'dEmi') || undefined,
    supplier: tag(xml, 'xNome') || undefined,
    supplierDocument: tag(xml, 'CNPJ') || tag(xml, 'CPF') || undefined,
    accessKey: xml.match(/\d{44}/)?.[0],
    items,
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
  tjMatch.forEach((token) => {
    const inner = token.slice(1, token.lastIndexOf(')'));
    chunks.push(inner.replace(/\\n/g, ' ').replace(/\\\)/g, ')').replace(/\\\(/g, '('));
  });
  const arr = /\[(.*?)\]\s*TJ/gs;
  let m: RegExpExecArray | null;
  while ((m = arr.exec(raw))) {
    const parts = [...m[1].matchAll(/\((?:\\.|[^\\)])*\)/g)].map((p) => p[0].slice(1, -1));
    chunks.push(parts.join(''));
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
  return {
    source: 'text',
    nfNumber,
    supplier,
    accessKey,
    items,
    rawPreview: text.slice(0, 500)
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
  const text = extractPdfLatinText(buffer) || raw.replace(/[^\x20-\x7EÀ-ÿ\n]/g, ' ');
  return { ...parseDanfeText(text), source: 'pdf', rawPreview: text.slice(0, 500) };
};
