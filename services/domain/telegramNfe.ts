import {
  Customer,
  FiscalConfig,
  NfeStatus,
  SaleOrder,
  SaleOrderItem
} from '../../types.js';
import {
  avulsaExternalRef,
  buildLinkedNfe,
  remainingQuantityByProduct,
  saleItemKey,
  upsertLinkedNfe
} from '../saleNfe.js';
import { buildNfeInfCpl } from '../nfeComplementares.js';
import { mapRemoteNfeStatus } from '../nfeRemoteStatus.js';

const NOTAAS_API_BASE = 'https://platform.notaas.com.br/api/v1';
const SANTAREM_IBGE = 1506807;

export interface FiscalValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TelegramNfeEmitResult {
  success: boolean;
  nfeStatus: NfeStatus;
  nfeId?: string;
  nfeChave?: string;
  nfeNumero?: string;
  nfeSerie?: string;
  nfeProtocolo?: string;
  nfeDanfeUrl?: string;
  nfeXmlUrl?: string;
  nfeEmissao?: string;
  nfeErro?: string;
  naturezaOperacao?: string;
  payload?: any;
  rawResponse?: any;
}

export interface TelegramNfeTransport {
  request(opts: {
    method: 'GET' | 'POST';
    url: string;
    apiKey: string;
    body?: any;
    binary?: boolean;
  }): Promise<{ status: number; data?: any; buffer?: Uint8Array }>;
  sleep(ms: number): Promise<void>;
}

const defaultTransport: TelegramNfeTransport = {
  async request({ method, url, apiKey, body, binary }) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), binary ? 28000 : 25000);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: binary ? 'application/pdf, application/json' : 'application/json',
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      const contentType = response.headers.get('content-type') || '';
      if (binary && !contentType.includes('json')) {
        return { status: response.status, buffer: new Uint8Array(await response.arrayBuffer()) };
      }
      if (contentType.includes('application/json')) {
        return { status: response.status, data: await response.json().catch(() => ({})) };
      }
      const preview = await response.text().catch(() => '');
      return { status: response.status, data: { error: preview.slice(0, 300) } };
    } finally {
      clearTimeout(timeoutId);
    }
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
};

let transport: TelegramNfeTransport = defaultTransport;

export function setTelegramNfeTransport(next: Partial<TelegramNfeTransport> | null): void {
  transport = next ? { ...defaultTransport, ...next } : defaultTransport;
}

export function onlyDigits(value?: string | number | null): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function readFiscalConfig(rows: any[]): FiscalConfig | null {
  const row = (rows || []).find((item) => item && item.id !== '__seed__' && !item.__isSeedMeta);
  return row || null;
}

export function validateFiscalForEmit(order: SaleOrder, customer?: Customer): FiscalValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!customer) {
    return { valid: false, errors: ['Cliente não identificado no pedido.'], warnings };
  }

  const docClean = onlyDigits(customer.document);
  if (!docClean || (docClean.length !== 11 && docClean.length !== 14)) {
    errors.push('CPF ou CNPJ do destinatário é obrigatório para emitir NF-e. Atualize o cadastro no ERP.');
  }
  if (!customer.name || customer.name.trim().length < 2) {
    errors.push('Nome / razão social do destinatário é obrigatório.');
  }
  if (!customer.street?.trim()) warnings.push('Logradouro ausente: vai "Zona Rural / Rodovia".');
  if (!customer.neighborhood?.trim()) warnings.push('Bairro ausente: vai "Zona Rural".');
  if (!customer.city?.trim()) warnings.push('Cidade ausente: assume o município da empresa.');
  if (!customer.state?.trim()) warnings.push('UF ausente: assume a UF da empresa.');
  if (onlyDigits(customer.zipCode).length !== 8) warnings.push('CEP ausente ou incompleto.');

  if (!order.items?.length) errors.push('A nota precisa de pelo menos 1 item com valor.');
  (order.items || []).forEach((item, index) => {
    if (!(item.quantity > 0)) errors.push(`Item ${index + 1} (${item.productName}) sem quantidade.`);
    if (!(item.total > 0)) errors.push(`Item ${index + 1} (${item.productName}) sem valor.`);
    if (onlyDigits(item.ncm).length !== 8) {
      warnings.push(`${item.productName}: NCM padrão 2517.10.00.`);
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}

export function remainingItemsForNfe(order: SaleOrder): SaleOrderItem[] {
  const remaining = remainingQuantityByProduct(order);
  return (order.items || [])
    .map((item) => {
      const quantity = remaining.get(saleItemKey(item)) || 0;
      if (quantity <= 0) return null;
      const unitPrice = Number(item.unitPrice) || 0;
      const discountRatio = (Number(item.quantity) || 0) > 0 ? quantity / Number(item.quantity) : 1;
      const discount = Math.round((Number(item.discount) || 0) * discountRatio * 100) / 100;
      return {
        ...item,
        quantity,
        discount,
        total: Math.round((quantity * unitPrice - discount) * 100) / 100
      };
    })
    .filter((item): item is SaleOrderItem => Boolean(item));
}

export function pickNfeItems(order: SaleOrder, requested?: { productId?: string; produto?: string; quantidade: number }[]): SaleOrderItem[] {
  if (!requested?.length) return remainingItemsForNfe(order);

  const remaining = remainingQuantityByProduct(order);
  return requested.map((line) => {
    const term = String(line.productId || line.produto || '').trim().toLowerCase();
    const source =
      (order.items || []).find((item) => saleItemKey(item).toLowerCase() === term) ||
      (order.items || []).find((item) => String(item.productName || '').toLowerCase().includes(term));
    if (!source) throw new Error(`Produto "${line.produto || line.productId}" não está nesse pedido.`);

    const key = saleItemKey(source);
    const max = remaining.get(key) || 0;
    const quantity = Number(line.quantidade);
    if (!(quantity > 0)) throw new Error(`Informe a quantidade de ${source.productName}.`);
    if (quantity - max > 0.009) {
      throw new Error(`${source.productName}: restam ${max} ${source.unit || ''} para faturar nesse pedido.`);
    }

    const unitPrice = Number(source.unitPrice) || 0;
    const discountRatio = (Number(source.quantity) || 0) > 0 ? quantity / Number(source.quantity) : 1;
    const discount = Math.round((Number(source.discount) || 0) * discountRatio * 100) / 100;
    remaining.set(key, Math.max(0, max - quantity));
    return {
      ...source,
      quantity,
      discount,
      total: Math.round((quantity * unitPrice - discount) * 100) / 100
    };
  });
}

export function totalsOf(items: SaleOrderItem[], shipping = 0): { subtotal: number; shipping: number; total: number } {
  const subtotal = Math.round(items.reduce((sum, item) => sum + (Number(item.total) || 0), 0) * 100) / 100;
  const freight = Math.max(0, Number(shipping) || 0);
  return { subtotal, shipping: freight, total: Math.round((subtotal + freight) * 100) / 100 };
}

export function buildNfePayload(order: SaleOrder, customer: Customer, config: FiscalConfig): any {
  const isInterestadual = Boolean(customer.state && customer.state !== (config.ufEmitente || 'PA'));
  const cfopPadrao = isInterestadual
    ? onlyDigits(config.cfopPadraoInterestadual || '6101')
    : onlyDigits(config.cfopPadraoEstadual || '5101');
  const docClean = onlyDigits(customer.document);
  const isPF = docClean.length === 11;
  const destCity = (customer.city || '').trim() || config.cidadeEmitente || 'Santarém';
  const destUf = (customer.state || '').trim().toUpperCase() || config.ufEmitente || 'PA';
  const ibge = onlyDigits(customer.ibgeCode);
  const zip = onlyDigits(customer.zipCode);
  const indicadorIE = customer.isentoIE ? 2 : customer.ie ? 1 : 9;

  const dest: any = {
    nome: (customer.name || '').trim(),
    indicadorIE,
    endereco: {
      logradouro: (customer.street || '').trim() || 'Zona Rural / Rodovia',
      numero: (customer.number || '').trim() || 'SN',
      bairro: (customer.neighborhood || '').trim() || 'Zona Rural',
      codigoMunicipio: ibge.length === 7 ? Number(ibge) : SANTAREM_IBGE,
      cidade: destCity,
      uf: destUf,
      cep: zip.length === 8 ? zip : onlyDigits(config.cepEmitente) || '68000000'
    }
  };
  if (isPF) dest.cpf = docClean;
  else dest.cnpj = docClean;
  if (customer.email) dest.email = customer.email;
  if (indicadorIE === 1 && customer.ie) dest.ie = onlyDigits(customer.ie);

  const cstPadrao = (config.cstIcmsPadrao || '40').trim();
  const items = (order.items || []).map((item, index) => {
    const ncm = onlyDigits(item.ncm);
    const cfop = onlyDigits(item.cfop);
    const cst = String(item.cst || item.csosn || cstPadrao).trim();
    const row: any = {
      descricao: item.productName || 'Calcário Agrícola Corretivo',
      codigo: item.productCode || `CALC-${index + 1}`,
      ncm: ncm.length === 8 ? ncm : '25171000',
      cfop: cfop.length === 4 ? cfop : cfopPadrao,
      quantidade: item.quantity > 0 ? item.quantity : 1,
      valorUnitario: item.unitPrice > 0 ? item.unitPrice : item.total,
      valorTotal: item.total,
      unidade: item.unit || 'TON',
      cst,
      aliquotaPis: item.aliquotaPis !== undefined ? item.aliquotaPis : config.aliquotaPis ?? 0,
      aliquotaCofins: item.aliquotaCofins !== undefined ? item.aliquotaCofins : config.aliquotaCofins ?? 0
    };
    if (['00', '10', '20', '90'].includes(cst) && (item.aliquotaIcms != null || config.aliquotaIcmsPadrao != null)) {
      row.aliquotaIcms = item.aliquotaIcms ?? config.aliquotaIcmsPadrao;
    }
    return row;
  });

  const tipoPagamento = order.paymentMethod === 'PIX' ? '17' : order.paymentMethod === 'Boleto' ? '15' : '01';
  const freteModalidade = Number(order.frete?.modalidade ?? (order.shipping ? 0 : 9)) as 0 | 1 | 2 | 3 | 4 | 9;
  const freteValor = Math.max(0, Number(order.frete?.valor ?? order.shipping ?? 0) || 0);
  const hasFrete =
    freteValor > 0 &&
    freteModalidade !== 9 &&
    freteModalidade !== 1 &&
    freteModalidade !== 4;
  const isAvulsaNote = Boolean(order.isAvulsa) || String(order.nfeReferenciaExterna || '').includes('#AV#');
  const infCpl = buildNfeInfCpl({
    nfeInfCpl: order.nfeInfCpl,
    observacoesFiscaisPadrao: config.observacoesFiscaisPadrao,
    items: order.items,
    extras: isAvulsaNote ? [] : [order.reference ? `Pedido: ${order.reference}` : '']
  });

  const payload: any = {
    modelo: 55,
    naturezaOperacao: order.nfeNaturezaOperacao || config.naturezaOperacaoPadrao || 'Venda de producao do estabelecimento',
    dest,
    items,
    pagamentos: [{ tipoPagamento, valor: order.total }],
    transporte: { modalidadeFrete: Number.isFinite(freteModalidade) ? freteModalidade : 9 },
    tipoOperacao: 1,
    finalidade: 1,
    consumidorFinal: isPF ? 1 : 0,
    presencaComprador: 1,
    infCpl: infCpl,
    referenciaExterna: order.nfeReferenciaExterna || order.reference || `ORDER-${order.id}`
  };
  if (hasFrete) payload.valorFrete = freteValor;
  return payload;
}

function unwrap(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw || {};
  if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) return { ...raw, ...raw.data };
  return raw;
}

function parseEmitBody(data: any, httpStatus: number, fallbackNumero: string, serie: string): TelegramNfeEmitResult {
  const body = unwrap(data);
  const chave = body.chaveAcesso || body.chave || body.nfeKey || body.chave_acesso || body.chaveNFe || '';
  const cStat = Number(body.cStat || body.cstat);
  const nfeStatus = mapRemoteNfeStatus(body.status, httpStatus, Number.isFinite(cStat) ? cStat : undefined, {
    event: body.event || body.evento,
    cancelledAt: body.cancelledAt || body.dataCancelamento || null
  });
  const error =
    body.xMotivo ||
    body.message ||
    body.erro ||
    body.error ||
    body.motivo ||
    (Array.isArray(body.erros)
      ? body.erros.map((item: any) => item.mensagem || item.msg || item).join(' | ')
      : undefined);

  return {
    success: nfeStatus !== 'rejeitada',
    nfeStatus,
    nfeId: body.invoiceId || body.id || body.uuid,
    nfeChave: chave || undefined,
    nfeNumero: body.nNf != null ? String(body.nNf) : body.numero ? String(body.numero) : fallbackNumero,
    nfeSerie: body.serie ? String(body.serie) : serie,
    nfeProtocolo: body.nProt || body.protocolo || body.protocol || undefined,
    nfeDanfeUrl: body.pdfUrl || body.danfeUrl || body.urlDanfe || body.caminho_danfe,
    nfeXmlUrl: body.xmlUrl || body.urlXml || body.caminho_xml_nota_fiscal,
    nfeEmissao: body.dataEmissao || new Date().toISOString(),
    nfeErro: nfeStatus === 'rejeitada' ? error || 'Rejeitada pela SEFAZ' : undefined,
    rawResponse: body
  };
}

export async function emitNfeOnNotaAs(params: {
  order: SaleOrder;
  customer: Customer;
  config: FiscalConfig;
}): Promise<TelegramNfeEmitResult> {
  const apiKey = String(params.config.apiKey || '').trim();
  if (!apiKey) {
    return {
      success: false,
      nfeStatus: 'rejeitada',
      nfeErro: 'Chave da API NotaAs ausente. Cadastre a Project Key nas Configurações Fiscais.'
    };
  }

  const validation = validateFiscalForEmit(params.order, params.customer);
  if (!validation.valid) {
    return { success: false, nfeStatus: 'rejeitada', nfeErro: validation.errors.join(' | ') };
  }

  const payload = buildNfePayload(params.order, params.customer, params.config);
  const base = String(params.config.apiBaseUrl || NOTAAS_API_BASE).replace(/\/$/, '');
  const provider = String(params.config.apiProvider || 'notaas').toLowerCase();
  const numero = String(params.config.proxNumeroNFe || 1042);
  const serie = params.config.serieNFe || '1';
  const endpoint =
    provider === 'focusnfe'
      ? `${base}/nfe?ref=${encodeURIComponent(payload.referenciaExterna || '')}`
      : `${base}/nfe/emitir`;

  let emitted: TelegramNfeEmitResult;
  try {
    const response = await transport.request({ method: 'POST', url: endpoint, apiKey, body: payload });
    if (response.status >= 200 && response.status < 300) {
      emitted = parseEmitBody(response.data, response.status, numero, serie);
    } else {
      const parsed = parseEmitBody(response.data, response.status, numero, serie);
      emitted = {
        ...parsed,
        success: false,
        nfeStatus: 'rejeitada',
        nfeErro: parsed.nfeErro || `Falha na API fiscal (HTTP ${response.status}).`
      };
    }
  } catch (error: any) {
    const timeout = error?.name === 'AbortError';
    return {
      success: false,
      nfeStatus: 'rejeitada',
      nfeErro: timeout
        ? 'A NotaAs não respondeu em 25s. Tente de novo.'
        : error?.message || 'Falha ao conectar no emissor fiscal.',
      payload
    };
  }

  emitted.payload = payload;
  emitted.naturezaOperacao = payload.naturezaOperacao;

  if (emitted.nfeId && emitted.nfeStatus === 'processando') {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await transport.sleep(2000);
      try {
        const consult = await transport.request({
          method: 'GET',
          url: `${base}/nfe/invoices/${encodeURIComponent(emitted.nfeId)}/status`,
          apiKey
        });
        const next = parseEmitBody(consult.data, consult.status, emitted.nfeNumero || numero, emitted.nfeSerie || serie);
        if (next.nfeStatus && next.nfeStatus !== 'processando' && next.nfeStatus !== 'nao_emitida') {
          emitted = {
            ...emitted,
            ...next,
            success: next.nfeStatus !== 'rejeitada',
            payload,
            naturezaOperacao: payload.naturezaOperacao
          };
          break;
        }
      } catch {
        break;
      }
    }
  }

  return emitted;
}

export async function fetchDanfePdf(invoiceId: string, config: FiscalConfig): Promise<Uint8Array | null> {
  const apiKey = String(config.apiKey || '').trim();
  const id = String(invoiceId || '').trim();
  if (!apiKey || !id) return null;
  const base = String(config.apiBaseUrl || NOTAAS_API_BASE).replace(/\/$/, '');
  try {
    const response = await transport.request({
      method: 'GET',
      url: `${base}/nfe/invoices/${encodeURIComponent(id)}/danfe`,
      apiKey,
      binary: true
    });
    if (response.buffer && response.buffer.length > 4) return response.buffer;
  } catch (error: any) {
    console.warn('[TELEGRAM NF-e] DANFE indisponível:', error?.message);
  }
  return null;
}

export function applyEmitToOrder(params: {
  order: SaleOrder;
  items: SaleOrderItem[];
  tipo: 'pedido' | 'avulsa';
  result: TelegramNfeEmitResult;
  linkedId?: string;
}): SaleOrder {
  const totals = totalsOf(params.items, params.tipo === 'pedido' ? params.order.shipping : 0);
  const linkedId =
    params.linkedId ||
    (params.tipo === 'avulsa' ? `nfa-${Date.now().toString(36)}` : `nfp-${Date.now().toString(36)}`);
  const reference =
    params.tipo === 'avulsa' ? avulsaExternalRef(params.order.reference, linkedId) : params.order.reference;
  const emitOrder = {
    ...params.order,
    items: params.items,
    subtotal: totals.subtotal,
    discount: 0,
    shipping: totals.shipping,
    total: totals.total,
    isAvulsa: params.tipo === 'avulsa',
    nfeReferenciaExterna: reference
  };
  const linked = buildLinkedNfe({
    id: linkedId,
    tipo: params.tipo,
    reference,
    order: emitOrder,
    items: params.items,
    subtotal: totals.subtotal,
    discount: 0,
    shipping: totals.shipping,
    total: totals.total,
    nfeStatus: params.result.nfeStatus,
    nfeId: params.result.nfeId,
    nfeChave: params.result.nfeChave,
    nfeNumero: params.result.nfeNumero,
    nfeSerie: params.result.nfeSerie,
    nfeProtocolo: params.result.nfeProtocolo,
    nfeDanfeUrl: params.result.nfeDanfeUrl,
    nfeXmlUrl: params.result.nfeXmlUrl,
    nfeEmissao: params.result.nfeEmissao,
    nfeErro: params.result.nfeErro,
    nfeNaturezaOperacao: params.result.naturezaOperacao,
    nfePayload: params.result.payload,
    nfeRawResponse: params.result.rawResponse
  });
  return upsertLinkedNfe(params.order, linked);
}

export function nfeEnvironmentLabel(config: FiscalConfig | null): string {
  if (!config) return 'sem configuração fiscal';
  return config.environment === 'production' ? 'PRODUÇÃO (SEFAZ real)' : 'homologação';
}
