import {
  Company,
  Customer,
  FiscalConfig,
  OrderStatus,
  SaleOrder,
  SaleOrderItem,
  StoreItem,
  StoreItemCategory,
  TransferShipment
} from '../../types';
import { ParsedNfDocument, ParsedNfItem } from '../nfeDocumentParser';
import { isMineralNcm, matchStoreItem } from '../storeItemMatch';
import { newId, nextAvulsaReference, nextTransferCode } from '../ids';

export type SmartImportIntent = 'devolucao_nfe' | 'transferencia_nfe' | 'remessa_interna';

export interface SmartImportItemRow {
  id: string;
  nItem: number;
  included: boolean;
  cProd?: string;
  productName: string;
  ncm: string;
  originalCfop?: string;
  cfop: string;
  cst: string;
  unit: string;
  maxQuantity: number;
  quantity: number;
  unitPrice: number;
  total: number;
  category: StoreItemCategory;
  storeItemId?: string;
  storeMatchLabel?: string;
  mineral?: boolean;
  infAdProd?: string;
}

export interface SmartImportAnalysis {
  intent: SmartImportIntent;
  isInterestadual: boolean;
  emitterUf: string;
  companyUf: string;
  accessKeyValid: boolean;
  accessKey: string;
  nfNumber: string;
  series: string;
  emitterName: string;
  emitterDocument: string;
  cfopDevolucaoSugerido: string;
  cfopTransferenciaSugerido: string;
  naturezaOperacao: string;
  reason: string;
  vehiclePlate: string;
  driverName: string;
  originLocation: string;
  destinationLocation: string;
  infCpl: string;
  summaryPoints: string[];
  warnings: string[];
  commandFeedback?: string;
  rows: SmartImportItemRow[];
}

const onlyDigits = (val?: string) => (val || '').replace(/\D/g, '');

export function resolveSuggestedCfops(emitterUf?: string, companyUf = 'PA', config?: FiscalConfig | null) {
  const cleanEmitterUf = (emitterUf || companyUf || 'PA').trim().toUpperCase();
  const cleanCompanyUf = (companyUf || 'PA').trim().toUpperCase();
  const isInterestadual = Boolean(cleanEmitterUf && cleanEmitterUf !== cleanCompanyUf);

  return {
    isInterestadual,
    emitterUf: cleanEmitterUf,
    companyUf: cleanCompanyUf,
    cfopDevolucao: isInterestadual ? '6202' : '5202',
    cfopTransferencia: isInterestadual
      ? config?.cfopTransferenciaInterestadual || '6152'
      : config?.cfopTransferenciaEstadual || '5152'
  };
}

export function buildDefaultInfCpl(
  intent: SmartImportIntent,
  doc: ParsedNfDocument,
  reason?: string
): string {
  const nfLabel = doc.nfNumber
    ? `NF-e nº ${doc.nfNumber}${doc.series ? ` (Série ${doc.series})` : ''}`
    : 'NF-e de origem';
  const keyLabel = doc.accessKey ? `Chave de acesso: ${doc.accessKey}` : '';
  const supplierLabel = doc.supplier ? `Emitente original: ${doc.supplier}` : '';

  if (intent === 'devolucao_nfe') {
    return [
      `Devolução de mercadoria referente à ${nfLabel}`,
      supplierLabel,
      keyLabel,
      reason?.trim() ? `Motivo: ${reason.trim()}` : null
    ]
      .filter(Boolean)
      .join(' · ');
  }

  if (intent === 'transferencia_nfe') {
    return [
      `Transferência de mercadoria referente à ${nfLabel}`,
      supplierLabel,
      keyLabel,
      reason?.trim() ? `Obs: ${reason.trim()}` : null
    ]
      .filter(Boolean)
      .join(' · ');
  }

  return [
    `Remessa interna originada da ${nfLabel}`,
    supplierLabel,
    keyLabel,
    reason?.trim() ? `Obs: ${reason.trim()}` : null
  ]
    .filter(Boolean)
    .join(' · ');
}

export function analyzeImportedNfe(params: {
  doc: ParsedNfDocument;
  company?: Company;
  config?: FiscalConfig | null;
  storeItems?: StoreItem[];
  initialIntent?: SmartImportIntent;
}): SmartImportAnalysis {
  const { doc, company, config, storeItems = [], initialIntent } = params;
  const companyUf = (company?.state || config?.ufEmitente || 'PA').toUpperCase();
  const cfops = resolveSuggestedCfops(doc.supplierState, companyUf, config);
  const accessKey = onlyDigits(doc.accessKey);
  const accessKeyValid = accessKey.length === 44;

  // Define a intenção inicial recomendada
  const natureLower = (doc.nature || '').toLowerCase();
  const intent: SmartImportIntent =
    initialIntent ||
    (natureLower.includes('devol')
      ? 'devolucao_nfe'
      : natureLower.includes('transf')
        ? 'transferencia_nfe'
        : 'devolucao_nfe');

  const activeCfop = intent === 'devolucao_nfe' ? cfops.cfopDevolucao : cfops.cfopTransferencia;
  const naturezaOperacao =
    intent === 'devolucao_nfe'
      ? 'Devolucao de mercadoria'
      : intent === 'transferencia_nfe'
        ? 'Transferencia de mercadoria adquirida'
        : 'Remessa interna Santarém → Fazenda';

  const rows: SmartImportItemRow[] = (doc.items || []).map((item: ParsedNfItem, idx: number) => {
    const matched = matchStoreItem(storeItems, {
      cProd: item.cProd,
      ncm: item.ncm,
      name: item.productName,
      supplierCnpj: doc.supplierDocument
    });
    const qty = Number(item.quantitySent) || 1;
    const unitPrice = Number(item.unitCost) || 0;
    return {
      id: `imp-item-${idx + 1}`,
      nItem: item.nItem || idx + 1,
      included: true,
      cProd: item.cProd,
      productName: item.productName || `Item ${idx + 1}`,
      ncm: onlyDigits(item.ncm) || '25171000',
      originalCfop: item.cfop,
      cfop: activeCfop,
      cst: config?.cstIcmsPadrao || '40',
      unit: (item.unit || matched?.unit || 'UN').toUpperCase(),
      maxQuantity: qty,
      quantity: qty,
      unitPrice,
      total: Number(item.totalCost) || qty * unitPrice,
      category: matched?.category || item.category || 'Peças',
      storeItemId: matched?.id,
      storeMatchLabel: matched ? `Almoxarifado: ${matched.name}` : 'Novo item no almoxarifado',
      mineral: isMineralNcm(item.ncm),
      infAdProd: item.infAdProd
    };
  });

  const warnings: string[] = [...(doc.warnings || [])];
  if (!accessKeyValid) {
    warnings.push(
      'Chave de acesso de 44 dígitos não identificada no arquivo. Para NF-e de Devolução na SEFAZ, informe a chave de 44 dígitos da nota original.'
    );
  }
  if (!doc.supplierDocument) {
    warnings.push('CNPJ/CPF do emitente não identificado automaticamente. Você poderá conferi-lo na tela de emissão.');
  }

  const summaryPoints: string[] = [
    `Emitente: ${doc.supplier || 'Não informado'}${doc.supplierDocument ? ` (${doc.supplierDocument})` : ''} — UF: ${cfops.emitterUf}`,
    `Operação ${cfops.isInterestadual ? `Interestadual (${cfops.emitterUf} → ${cfops.companyUf})` : `Interna (${cfops.companyUf})`} · CFOP sugerido: ${cfops.cfopDevolucao} (Devolução) / ${cfops.cfopTransferencia} (Transferência)`,
    `${rows.length} item(ns) lido(s) · Valor total: ${(Number(doc.vNF) || rows.reduce((s, r) => s + r.total, 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
  ];

  return {
    intent,
    isInterestadual: cfops.isInterestadual,
    emitterUf: cfops.emitterUf,
    companyUf: cfops.companyUf,
    accessKeyValid,
    accessKey,
    nfNumber: doc.nfNumber || '',
    series: doc.series || '1',
    emitterName: doc.supplier || doc.supplierTradeName || 'Fornecedor da NF-e',
    emitterDocument: doc.supplierDocument || '',
    cfopDevolucaoSugerido: cfops.cfopDevolucao,
    cfopTransferenciaSugerido: cfops.cfopTransferencia,
    naturezaOperacao,
    reason: '',
    vehiclePlate: (doc.vehiclePlate || '').toUpperCase(),
    driverName: doc.carrierName || '',
    originLocation: 'Polo de Compras Santarém (Av. Mendonça Furtado)',
    destinationLocation: 'Fazenda Usina Matriz (Zona Rural / Rodovia)',
    infCpl: buildDefaultInfCpl(intent, doc, ''),
    summaryPoints,
    warnings,
    rows
  };
}

export function switchImportIntent(
  analysis: SmartImportAnalysis,
  doc: ParsedNfDocument,
  nextIntent: SmartImportIntent
): SmartImportAnalysis {
  const nextCfop =
    nextIntent === 'devolucao_nfe'
      ? analysis.cfopDevolucaoSugerido
      : analysis.cfopTransferenciaSugerido;

  const nextNatureza =
    nextIntent === 'devolucao_nfe'
      ? 'Devolucao de mercadoria'
      : nextIntent === 'transferencia_nfe'
        ? 'Transferencia de mercadoria adquirida'
        : 'Remessa interna Santarém → Fazenda';

  return {
    ...analysis,
    intent: nextIntent,
    naturezaOperacao: nextNatureza,
    infCpl: buildDefaultInfCpl(nextIntent, doc, analysis.reason),
    rows: analysis.rows.map((row) => ({
      ...row,
      cfop: nextCfop
    }))
  };
}

/**
 * Interpreta comandos em linguagem natural (ex: "devolver 2 un do item 1 com defeito",
 * "fazer devolução total", "transferir para a fazenda placa QVA1B23 motorista Carlos",
 * "emitir NF-e de transferência apenas do item 2") e aplica sobre a análise atual.
 */
export function applyImportCommand(
  current: SmartImportAnalysis,
  doc: ParsedNfDocument,
  rawCommand: string
): SmartImportAnalysis {
  const text = String(rawCommand || '').trim();
  if (!text) return current;

  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  let next = { ...current, rows: current.rows.map((r) => ({ ...r })) };
  const actionsTaken: string[] = [];

  // 1. Detectar intenção (Devolução SEFAZ vs Transferência SEFAZ vs Remessa Interna)
  if (/devol/.test(normalized)) {
    next = switchImportIntent(next, doc, 'devolucao_nfe');
    actionsTaken.push(`Modo alterado para NF-e de Devolução (CFOP ${next.cfopDevolucaoSugerido})`);
  } else if (
    /remessa|almoxarifado|santarem|fazenda|patio/.test(normalized) &&
    !/sefaz|nfe de transf|nota de transf/.test(normalized)
  ) {
    next = switchImportIntent(next, doc, 'remessa_interna');
    actionsTaken.push('Modo alterado para Remessa Interna (Santarém → Fazenda)');
  } else if (/transf/.test(normalized)) {
    next = switchImportIntent(next, doc, 'transferencia_nfe');
    actionsTaken.push(`Modo alterado para NF-e de Transferência SEFAZ (CFOP ${next.cfopTransferenciaSugerido})`);
  }

  // 2. Detectar "total" / "tudo" / "todos os itens"
  if (/\b(total|tudo|todos|inteira|completa)\b/.test(normalized)) {
    next.rows = next.rows.map((row) => ({
      ...row,
      included: true,
      quantity: row.maxQuantity,
      total: Number((row.maxQuantity * row.unitPrice).toFixed(2))
    }));
    actionsTaken.push('Todos os itens selecionados com quantidade integral');
  }

  // 3. Detectar seleção de item específico e quantidade parcial
  // Ex: "devolver 2 un do item 1", "apenas o item 2", "3 do item 1"
  const qtyAndItemMatch = normalized.match(
    /(?:devolver|transferir|enviar|apenas|so|somente)?\s*(\d+(?:[.,]\d+)?)\s*(?:un|unid\w*|t|ton\w*|kg|pc|pecas|cx|l|lt)?\s*(?:do|da|de)?\s*item\s*(\d+)/
  );
  const itemAndQtyMatch = normalized.match(
    /item\s*(\d+)\s*(?:com|apenas|so|quantidade|qtd)?\s*(\d+(?:[.,]\d+)?)/
  );
  const onlyItemsMatch = [...normalized.matchAll(/item\s*(\d+)/g)].map((m) => Number(m[1]));

  if (qtyAndItemMatch) {
    const qty = Number(qtyAndItemMatch[1].replace(',', '.'));
    const targetItem = Number(qtyAndItemMatch[2]);
    if (Number.isFinite(qty) && qty > 0 && targetItem >= 1) {
      next.rows = next.rows.map((row) => {
        if (row.nItem === targetItem) {
          const appliedQty = Math.min(row.maxQuantity, qty);
          return {
            ...row,
            included: true,
            quantity: appliedQty,
            total: Number((appliedQty * row.unitPrice).toFixed(2))
          };
        }
        return { ...row, included: false };
      });
      actionsTaken.push(`Selecionado apenas o Item ${targetItem} com quantidade ${qty}`);
    }
  } else if (itemAndQtyMatch) {
    const targetItem = Number(itemAndQtyMatch[1]);
    const qty = Number(itemAndQtyMatch[2].replace(',', '.'));
    if (Number.isFinite(qty) && qty > 0 && targetItem >= 1) {
      next.rows = next.rows.map((row) => {
        if (row.nItem === targetItem) {
          const appliedQty = Math.min(row.maxQuantity, qty);
          return {
            ...row,
            included: true,
            quantity: appliedQty,
            total: Number((appliedQty * row.unitPrice).toFixed(2))
          };
        }
        return { ...row, included: false };
      });
      actionsTaken.push(`Selecionado apenas o Item ${targetItem} com quantidade ${qty}`);
    }
  } else if (onlyItemsMatch.length > 0) {
    const set = new Set(onlyItemsMatch);
    next.rows = next.rows.map((row) => ({
      ...row,
      included: set.has(row.nItem)
    }));
    actionsTaken.push(`Selecionado(s) o(s) item(ns): ${Array.from(set).join(', ')}`);
  } else {
    // Tenta casar pelo nome do produto se não falou "item X"
    const matchedByName = next.rows.filter((row) => {
      const words = row.productName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/\s+/)
        .filter((w) => w.length >= 4);
      return words.some((w) => normalized.includes(w));
    });
    if (matchedByName.length > 0 && matchedByName.length < next.rows.length) {
      const ids = new Set(matchedByName.map((r) => r.id));
      const standaloneQty = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(?:un|unid\w*|t|ton\w*|kg|pc|pecas)\b/);
      const parsedQty = standaloneQty ? Number(standaloneQty[1].replace(',', '.')) : null;
      next.rows = next.rows.map((row) => {
        if (!ids.has(row.id)) return { ...row, included: false };
        const q = parsedQty && parsedQty > 0 ? Math.min(row.maxQuantity, parsedQty) : row.quantity;
        return {
          ...row,
          included: true,
          quantity: q,
          total: Number((q * row.unitPrice).toFixed(2))
        };
      });
      actionsTaken.push(
        `Filtrado por produto: ${matchedByName.map((r) => r.productName).join(', ')}`
      );
    }
  }

  // 4. Detectar Placa de caminhão (padrão antigo ABC-1234 ou Mercosul ABC1D23)
  const plateMatch = text.match(/\b([A-Za-z]{3}[-\s]?\d[A-Za-z0-9]\d{2})\b/);
  if (plateMatch) {
    const cleanPlate = plateMatch[1].replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    next.vehiclePlate = cleanPlate;
    actionsTaken.push(`Placa definida: ${cleanPlate}`);
  }

  // 5. Detectar Motorista
  const driverMatch = text.match(/motorista\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,2})/i);
  if (driverMatch) {
    const driver = driverMatch[1]
      .replace(/\b(placa|no|na|caminhao|caminhão|por|com)\b.*$/i, '')
      .trim();
    if (driver) {
      next.driverName = driver;
      actionsTaken.push(`Motorista definido: ${driver}`);
    }
  }

  // 6. Detectar Motivo (para devolução ou observação)
  const reasonMatch = text.match(/(?:motivo|por|porque)\s*:?\s*(.+)$/i);
  if (reasonMatch) {
    const candidate = reasonMatch[1]
      .replace(/\b(placa\s+[A-Za-z0-9-]+|motorista\s+[A-Za-zÀ-ÿ\s]+)\b/gi, '')
      .trim();
    if (candidate.length >= 3) {
      next.reason = candidate;
      actionsTaken.push(`Motivo registrado: "${candidate}"`);
    }
  } else if (/defeito|avaria|desacordo|errado|vencid|divergencia/.test(normalized)) {
    next.reason = text;
    actionsTaken.push(`Observação/motivo atualizado`);
  }

  // 7. Detectar CFOP explícito (ex: "cfop 5201" ou "cfop 6152")
  const cfopMatch = normalized.match(/\bcfop\s*(\d{4})\b/);
  if (cfopMatch) {
    const customCfop = cfopMatch[1];
    next.rows = next.rows.map((r) => ({ ...r, cfop: customCfop }));
    actionsTaken.push(`CFOP ajustado para ${customCfop}`);
  }

  next.infCpl = buildDefaultInfCpl(next.intent, doc, next.reason);
  next.commandFeedback =
    actionsTaken.length > 0
      ? actionsTaken.join(' · ')
      : 'Comando aplicado às observações da operação.';

  return next;
}

/**
 * Garante um objeto Customer a partir do Emitente (no caso de Devolução)
 * ou Destinatário (no caso de Transferência) da NF-e importada.
 */
export function resolveOrBuildCustomerFromImportedNfe(params: {
  doc: ParsedNfDocument;
  analysis: SmartImportAnalysis;
  customers: Customer[];
  companyId?: string;
}): { customer: Customer; isNew: boolean } {
  const { doc, analysis, customers, companyId } = params;
  const targetDoc = onlyDigits(doc.supplierDocument);
  const existing = (customers || []).find(
    (c) => targetDoc && onlyDigits(c.document) === targetDoc
  );

  if (existing) {
    return {
      customer: {
        ...existing,
        ie: existing.ie || doc.supplierIe || '',
        street: existing.street || doc.supplierStreet || '',
        number: existing.number || doc.supplierNumber || '',
        neighborhood: existing.neighborhood || doc.supplierNeighborhood || '',
        city: existing.city || doc.supplierCity || 'Santarém',
        state: existing.state || doc.supplierState || analysis.emitterUf || 'PA',
        zipCode: existing.zipCode || doc.supplierZipCode || '68000-000',
        ibgeCode: existing.ibgeCode || doc.supplierIbgeCode || '1506807'
      },
      isNew: false
    };
  }

  const created: Customer = {
    id: newId('cust'),
    name: doc.supplier || doc.supplierTradeName || 'Fornecedor NF-e Importada',
    document: doc.supplierDocument || '',
    ie: doc.supplierIe || '',
    isentoIE: !doc.supplierIe,
    email: doc.supplierEmail || '',
    phone: doc.supplierPhone || '',
    street: doc.supplierStreet || 'Endereço conforme NF-e de origem',
    number: doc.supplierNumber || 'SN',
    neighborhood: doc.supplierNeighborhood || 'Centro',
    city: doc.supplierCity || 'Santarém',
    state: doc.supplierState || analysis.emitterUf || 'PA',
    zipCode: doc.supplierZipCode || '68000-000',
    ibgeCode: doc.supplierIbgeCode || '1506807',
    totalSpent: 0,
    status: 'Ativo',
    tipoPessoa: 'PJ',
    companyId
  };

  return { customer: created, isNew: true };
}

/**
 * Monta o SaleOrder fiscal (sem movimentar financeiro) pronto para ser aberto
 * no EmitirNfeModal tanto para Devolução (devolutionChave) quanto para Transferência (transferencia=true).
 */
export function buildFiscalOrderFromImport(params: {
  doc: ParsedNfDocument;
  analysis: SmartImportAnalysis;
  customer: Customer;
  existingOrders: SaleOrder[];
  sellerName: string;
  companyId?: string;
}): SaleOrder {
  const { doc, analysis, customer, existingOrders, sellerName, companyId } = params;
  const selectedRows = analysis.rows.filter((r) => r.included && r.quantity > 0);

  const items: SaleOrderItem[] = selectedRows.map((row, idx) => ({
    productId: row.storeItemId || `imp-${idx + 1}`,
    productCode: row.cProd || String(row.nItem || idx + 1).padStart(3, '0'),
    productName: row.productName,
    quantity: Number(row.quantity),
    unit: row.unit || 'UN',
    unitPrice: Number(row.unitPrice),
    discount: 0,
    total: Number((row.quantity * row.unitPrice).toFixed(2)),
    ncm: onlyDigits(row.ncm) || '25171000',
    cfop: row.cfop,
    cst: row.cst || '40',
    infAdProd: row.infAdProd
  }));

  const subtotal = Number(items.reduce((sum, item) => sum + item.total, 0).toFixed(2));
  const cleanPlate = analysis.vehiclePlate.replace(/[^A-Z0-9]/gi, '').toUpperCase();

  return {
    id: newId('ord'),
    reference: nextAvulsaReference(existingOrders),
    customerId: customer.id,
    customerName: customer.name,
    customerDocument: customer.document,
    sellerName: sellerName || 'Fiscal',
    date: new Date().toISOString().slice(0, 10),
    status: OrderStatus.FINALIZED,
    isAvulsa: true,
    items,
    subtotal,
    discount: 0,
    shipping: 0,
    total: subtotal,
    paymentMethod: 'Sem Pagamento',
    payments: [],
    nfeChave: analysis.accessKey || doc.accessKey,
    nfeNaturezaOperacao: analysis.naturezaOperacao,
    nfeInfCpl: analysis.infCpl,
    frete: {
      modalidade: 9,
      valor: 0,
      ...(cleanPlate
        ? { veiculo: { placa: cleanPlate, uf: analysis.companyUf || 'PA' } }
        : {}),
      ...(analysis.driverName
        ? { transportadora: { nome: analysis.driverName } }
        : {})
    },
    notes: analysis.infCpl,
    companyId
  };
}

/**
 * Monta o romaneio de Remessa Interna (TransferShipment) a partir da análise.
 */
export function buildTransferShipmentFromImport(params: {
  doc: ParsedNfDocument;
  analysis: SmartImportAnalysis;
  existingTransfers: TransferShipment[];
  sentBy: string;
  fileName?: string;
}): Omit<TransferShipment, 'id'> {
  const { doc, analysis, existingTransfers, sentBy, fileName } = params;
  const selectedRows = analysis.rows.filter((r) => r.included && r.quantity > 0);

  return {
    code: nextTransferCode(existingTransfers),
    originLocation: analysis.originLocation || 'Polo de Compras Santarém (Av. Mendonça Furtado)',
    destinationLocation: analysis.destinationLocation || 'Fazenda Usina Matriz (Zona Rural / Rodovia)',
    dateSent: new Date().toISOString().slice(0, 10),
    sentBy,
    carrierOrDriver: analysis.driverName.trim() || 'A definir',
    vehiclePlate: analysis.vehiclePlate.trim().toUpperCase() || 'A DEFINIR',
    notes: analysis.infCpl,
    items: selectedRows.map((row) => ({
      id: `tr-imp-${Date.now()}-${row.nItem}`,
      productId: row.storeItemId,
      productName: row.productName,
      category: row.category,
      quantitySent: row.quantity,
      quantityReceived: 0,
      unit: row.unit,
      unitCost: row.unitPrice,
      totalCost: Number((row.quantity * row.unitPrice).toFixed(2)),
      nfCompraNumber: analysis.nfNumber || doc.nfNumber,
      supplier: analysis.emitterName || doc.supplier,
      conferido: false,
      cProd: row.cProd,
      ncm: row.ncm,
      cfop: row.cfop,
      infAdProd: row.infAdProd,
      included: true
    })),
    status: 'EM_TRANSITO',
    stockIntegrated: false,
    createdAt: new Date().toISOString(),
    nfeChave: analysis.accessKey || doc.accessKey,
    nfeNumero: analysis.nfNumber || doc.nfNumber,
    nfeSerie: analysis.series || doc.series,
    nfeXml: doc.rawXml,
    nfeXmlRef: analysis.accessKey || fileName || doc.nfNumber,
    nfeFileName: fileName,
    supplierCnpj: analysis.emitterDocument || doc.supplierDocument,
    supplierName: analysis.emitterName || doc.supplier
  };
}
