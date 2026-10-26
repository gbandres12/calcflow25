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
  tradeName?: string;
  document?: string;
  ie?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  ibgeCode?: string;
  phone?: string;
  email?: string;
};

export type ParsedNfDuplicata = {
  nDup: string;
  dVenc: string; // YYYY-MM-DD
  vDup: number;
};

export type ParsedNfFatura = {
  nFat?: string;
  vOrig?: number;
  vDesc?: number;
  vLiq?: number;
};

export type ParsedNfDocument = {
  source: 'xml' | 'pdf' | 'text';
  nfNumber?: string;
  series?: string;
  issuedAt?: string;
  nature?: string;
  supplier?: string;
  supplierTradeName?: string;
  supplierDocument?: string;
  supplierIe?: string;
  supplierCity?: string;
  supplierState?: string;
  supplierStreet?: string;
  supplierNumber?: string;
  supplierNeighborhood?: string;
  supplierZipCode?: string;
  supplierIbgeCode?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  destName?: string;
  destDocument?: string;
  accessKey?: string;
  carrierName?: string;
  vehiclePlate?: string;
  vProd?: number;
  vFrete?: number;
  vDesc?: number;
  vNF?: number;
  fatura?: ParsedNfFatura;
  duplicatas?: ParsedNfDuplicata[];
  paymentMethod?: string;
  suggestedCategory?: string;
  suggestedCostCenterId?: string;
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

export const suggestNfFinancialClassification = (
  items: ParsedNfItem[],
  nature?: string,
  supplierName?: string
): { category: string; costCenterId: string } => {
  const corpus = [
    nature || '',
    supplierName || '',
    ...items.map((i) => i.productName || '')
  ].join(' ').toLowerCase();

  if (/diesel|s10|s-10|s500|gasolina|combust|arl\s*32|arla/.test(corpus)) {
    return { category: 'Combustível (Diesel S10 / S500)', costCenterId: 'cc3' };
  }
  if (/lubrific|graxa|oleo hidraul|óleo hidrául|oleo motor|óleo motor/.test(corpus)) {
    return { category: 'Lubrificantes e Graxas Industriais', costCenterId: 'cc5' };
  }
  if (/mandibula|mandíbula|martelo|peneira|tela|britador|moinho|rolamento|correia/.test(corpus)) {
    return { category: 'Peças de Desgaste e Telas', costCenterId: 'cc2' };
  }
  if (/pneu|caminh|trator|escavadeira|pa carregadeira|pá carregadeira|filtro|freio|amortecedor/.test(corpus)) {
    return { category: 'Manutenção de Veículos e Pás', costCenterId: 'cc3' };
  }
  if (/epi|luva|bota|capacete|oculos|óculos|protetor auricular|mascara|máscara/.test(corpus)) {
    return { category: 'EPIs e Segurança do Trabalho', costCenterId: 'cc2' };
  }
  if (/frete|transporte|balsa|transbordo/.test(corpus)) {
    return { category: 'Frete e Logística de Transporte', costCenterId: 'cc6' };
  }
  if (/energia|eletrica|elétrica|equatorial|celpa/.test(corpus)) {
    return { category: 'Energia Elétrica (Alta Tensão)', costCenterId: 'cc2' };
  }
  if (/brita|minerio|minério|calcario|calcário|explosiv|deton/.test(corpus)) {
    return { category: 'Compra de Brita / Minério Bruto', costCenterId: 'cc2' };
  }
  if (/alimento|refeic|refeiç|mercado|supermercado|agua mineral|água mineral/.test(corpus)) {
    return { category: 'Alimentação e Refeitório Pátio', costCenterId: 'cc1' };
  }
  if (/informatica|informática|computador|impressora|papel|toner|escritorio|escritório/.test(corpus)) {
    return { category: 'Material de Escritório e TI', costCenterId: 'cc1' };
  }
  if (items.some((i) => i.category === 'Peças' || i.category === 'Ferramentas')) {
    return { category: 'Manutenção de Britador e Moinho', costCenterId: 'cc5' };
  }
  return { category: 'Outras Despesas Operacionais', costCenterId: 'cc1' };
};

const mapSefazPaymentCode = (tPag?: string): string => {
  switch ((tPag || '').trim()) {
    case '01': return 'Dinheiro Físico';
    case '02': return 'Cheque';
    case '03': return 'Cartão de Crédito';
    case '04': return 'Cartão de Débito';
    case '14':
    case '15': return 'Boleto Bancário';
    case '16':
    case '18': return 'Transferência Bancária (TED)';
    case '17':
    case '20': return 'PIX';
    default: return 'Boleto Bancário';
  }
};

const num = (value?: string | null) => {
  if (!value) return 0;
  const cleaned = String(value).trim();
  // Se vier no formato brasileiro "1.234,56", remove pontos de milhar e troca vírgula por ponto
  if (cleaned.includes(',') && cleaned.includes('.')) {
    const n = Number(cleaned.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(cleaned.replace(',', '.'));
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
  tradeName: tag(block, 'xFant') || undefined,
  document: tag(block, 'CNPJ') || tag(block, 'CPF') || undefined,
  ie: tag(block, 'IE') || undefined,
  street: tag(block, 'xLgr') || undefined,
  number: tag(block, 'nro') || undefined,
  neighborhood: tag(block, 'xBairro') || undefined,
  city: tag(block, 'xMun') || undefined,
  state: tag(block, 'UF') || undefined,
  zipCode: tag(block, 'CEP') || undefined,
  ibgeCode: tag(block, 'cMun') || undefined,
  phone: tag(block, 'fone') || undefined,
  email: tag(block, 'email') || undefined
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
  const cobr = allTags(infNFe, 'cobr')[0] || '';
  const pag = allTags(infNFe, 'pag')[0] || '';
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

  // Extrai Fatura e Duplicatas (<cobr><fat> e <cobr><dup>)
  const fatBlock = allTags(cobr, 'fat')[0] || '';
  const fatura: ParsedNfFatura | undefined = fatBlock
    ? {
        nFat: tag(fatBlock, 'nFat') || undefined,
        vOrig: num(tag(fatBlock, 'vOrig')) || undefined,
        vDesc: num(tag(fatBlock, 'vDesc')) || undefined,
        vLiq: num(tag(fatBlock, 'vLiq')) || undefined
      }
    : undefined;

  const dupBlocks = allTags(cobr, 'dup');
  const duplicatas: ParsedNfDuplicata[] = dupBlocks
    .map((dup, index) => {
      const dVencRaw = tag(dup, 'dVenc');
      const vDup = num(tag(dup, 'vDup'));
      return {
        nDup: tag(dup, 'nDup') || String(index + 1).padStart(3, '0'),
        dVenc: dVencRaw ? dVencRaw.slice(0, 10) : '',
        vDup
      };
    })
    .filter((d) => d.vDup > 0);

  // Extrai Forma de Pagamento (<pag><detPag><tPag>)
  const detPagBlock = allTags(pag, 'detPag')[0] || pag;
  const tPagCode = tag(detPagBlock, 'tPag');
  const paymentMethod = tPagCode ? mapSefazPaymentCode(tPagCode) : (duplicatas.length > 0 ? 'Boleto Bancário' : 'PIX');

  const nature = tag(ide, 'natOp') || undefined;
  const suggested = suggestNfFinancialClassification(items, nature, emitente.name);

  return {
    source: 'xml',
    nfNumber: tag(ide, 'nNF') || undefined,
    series: tag(ide, 'serie') || undefined,
    issuedAt: tag(ide, 'dhEmi') || tag(ide, 'dEmi') || undefined,
    nature,
    supplier: emitente.name,
    supplierTradeName: emitente.tradeName,
    supplierDocument: emitente.document,
    supplierIe: emitente.ie,
    supplierCity: emitente.city,
    supplierState: emitente.state,
    supplierStreet: emitente.street,
    supplierNumber: emitente.number,
    supplierNeighborhood: emitente.neighborhood,
    supplierZipCode: emitente.zipCode,
    supplierIbgeCode: emitente.ibgeCode,
    supplierPhone: emitente.phone,
    supplierEmail: emitente.email,
    destName: destinatario.name,
    destDocument: destinatario.document,
    accessKey: accessKeyFromInfNfe(xml),
    carrierName: tag(transp, 'xNome') || undefined,
    vehiclePlate: (tag(transp, 'placa') || '').toUpperCase() || undefined,
    vProd: num(tag(icmsTot, 'vProd')) || undefined,
    vFrete: num(tag(icmsTot, 'vFrete')) || undefined,
    vDesc: num(tag(icmsTot, 'vDesc')) || fatura?.vDesc || undefined,
    vNF: num(tag(icmsTot, 'vNF')) || fatura?.vLiq || undefined,
    fatura,
    duplicatas,
    paymentMethod,
    suggestedCategory: suggested.category,
    suggestedCostCenterId: suggested.costCenterId,
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

const brDateToIso = (d: string): string => {
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return d;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

export const parseDanfeText = (text: string): ParsedNfDocument => {
  const accessKey = text.replace(/\s/g, '').match(/\d{44}/)?.[0];
  const nfNumber = text.match(/N[ºo°]\s*[:.]?\s*([\d.]{1,11})/i)?.[1]?.replace(/\./g, '') || text.match(/NF-e\s*(\d+)/i)?.[1];
  const supplier = text.match(/RECEBEMOS DE\s+([^0-9]{4,80}?)(?:\s+OS PRODUTOS|\s+NF-e|\s+CNPJ|$)/i)?.[1]?.trim()
    || text.match(/RAZ[ÃA]O SOCIAL[:\s]+([^\n]{4,80})/i)?.[1]?.trim()
    || text.match(/EMITENTE[:\s]+([^\n]{4,80})/i)?.[1]?.trim();
  const cnpjMatch = text.match(/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/);
  const supplierDocument = cnpjMatch?.[1]?.replace(/\D/g, '');

  const vnfMatch =
    text.match(/VALOR TOTAL DA NOTA[\s:R$]*([\d.]+,\d{2})/i) ||
    text.match(/V\.?\s*TOTAL DA NOTA[\s:R$]*([\d.]+,\d{2})/i) ||
    text.match(/VALOR TOTAL[\s:R$]*([\d.]+,\d{2})/i);

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

  // Tenta extrair duplicatas do texto do DANFE (ex: "001 15/11/2026 4.500,00" ou "15/11/2026 R$ 4.500,00")
  const duplicatas: ParsedNfDuplicata[] = [];
  const dupRe = /(?:(\d{1,4})\s+)?(\d{2}\/\d{2}\/\d{4})\s+(?:R\$\s*)?([\d.]+,\d{2})/g;
  let dupMatch: RegExpExecArray | null;
  while ((dupMatch = dupRe.exec(text))) {
    const val = num(dupMatch[3]);
    if (val > 0) {
      duplicatas.push({
        nDup: dupMatch[1] || String(duplicatas.length + 1).padStart(3, '0'),
        dVenc: brDateToIso(dupMatch[2]),
        vDup: val
      });
    }
  }

  const itemsSum = items.reduce((s, it) => s + (it.totalCost || 0), 0);
  const dupSum = duplicatas.reduce((s, d) => s + d.vDup, 0);
  const vNF = (vnfMatch ? num(vnfMatch[1]) : 0) || dupSum || itemsSum || undefined;

  const warnings: string[] = [];
  if (!items.length && !vNF) {
    warnings.push('O PDF não trouxe todos os campos estruturados. Você pode preencher manualmente abaixo ou enviar o arquivo XML da nota.');
  }

  const suggested = suggestNfFinancialClassification(items, undefined, supplier);

  return {
    source: 'text',
    nfNumber,
    supplier,
    supplierDocument,
    accessKey,
    vNF,
    duplicatas,
    paymentMethod: duplicatas.length > 0 ? 'Boleto Bancário' : 'PIX',
    suggestedCategory: suggested.category,
    suggestedCostCenterId: suggested.costCenterId,
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

