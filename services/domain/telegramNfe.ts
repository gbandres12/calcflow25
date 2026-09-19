import { Customer, FiscalConfig, NfeStatus, OrderStatus, SaleOrder } from '../../types';
import { fiscalService, mapRemoteNfeStatus } from '../fiscalService';
import { buildLinkedNfe, hasAuthorizedFiscalDocument, upsertLinkedNfe } from '../saleNfe';
import { newId } from '../ids';
import { postNotaasEmitir } from './notaasEmitir';

const onlyDigits = (value?: string): string => String(value || '').replace(/\D/g, '');

export interface TelegramNfeAptidao {
  apto: boolean;
  faltas: string[];
  avisos: string[];
  nfeStatus: NfeStatus | 'nao_emitida';
  temApiKey: boolean;
  naturezaDisponivel?: string;
  cfopDisponivel?: string;
}

/** Pré-checagem estrita para o Telegram: documento e endereço mínimo são erros, não warning. */
export function avaliarAptidaoNfe(input: {
  order: SaleOrder;
  customer: Customer;
  config: FiscalConfig | null | undefined;
  naturezaOverride?: string;
  cfopOverride?: string;
}): TelegramNfeAptidao {
  const faltas: string[] = [];
  const avisos: string[] = [];
  const order = input.order;
  const customer = input.customer;
  const config = input.config;
  const nfeStatus = (order.nfeStatus || 'nao_emitida') as NfeStatus | 'nao_emitida';

  if (order.status !== OrderStatus.FINALIZED) {
    faltas.push('O pedido precisa estar confirmado (Venda Confirmada) antes de emitir a NF-e.');
  }

  if (nfeStatus === 'autorizada' || hasAuthorizedFiscalDocument(order)) {
    faltas.push(`Este pedido já tem NF-e autorizada${order.nfeNumero ? ` (nº ${order.nfeNumero})` : ''}.`);
  } else if (nfeStatus === 'processando') {
    faltas.push('Já existe uma NF-e em processamento para este pedido. Aguarde o retorno da SEFAZ.');
  }

  if (!config?.apiKey?.trim()) {
    faltas.push('Falta a Project Key da NotaAs nas Configurações Fiscais da empresa.');
  }

  const doc = onlyDigits(customer?.document);
  if (!customer) {
    faltas.push('Cliente do pedido não encontrado.');
  } else if (doc.length !== 11 && doc.length !== 14) {
    faltas.push('Destinatário sem CPF/CNPJ válido no cadastro.');
  }

  if (!customer?.name || customer.name.trim().length < 2) {
    faltas.push('Destinatário sem nome/razão social no cadastro.');
  }

  if (!customer?.street?.trim() || !customer?.city?.trim() || !customer?.state?.trim()) {
    faltas.push('Destinatário sem endereço completo (rua, cidade e UF) no cadastro.');
  }

  const validation = fiscalService.validarDadosFiscais(order, customer, { requireResolvedIbge: false });
  for (const err of validation.errors || []) {
    if (!faltas.includes(err)) faltas.push(err);
  }
  avisos.push(...(validation.warnings || []));

  const isInterestadual = customer?.state && customer.state !== (config?.ufEmitente || '');
  const cfopEmpresa = isInterestadual
    ? config?.cfopPadraoInterestadual
    : config?.cfopPadraoEstadual;
  const cfopItem = (order.items || []).map((item) => onlyDigits(item.cfop)).find((c) => c.length === 4);
  const cfopDisponivel =
    onlyDigits(input.cfopOverride).length === 4
      ? onlyDigits(input.cfopOverride)
      : cfopItem || (onlyDigits(cfopEmpresa).length === 4 ? onlyDigits(cfopEmpresa) : undefined);

  const naturezaDisponivel =
    String(input.naturezaOverride || order.nfeNaturezaOperacao || config?.naturezaOperacaoPadrao || '').trim() ||
    undefined;

  if (!cfopDisponivel) {
    faltas.push('Falta CFOP no produto e nos padrões fiscais da empresa. Informe o CFOP ou cadastre no ERP.');
  }
  if (!naturezaDisponivel) {
    faltas.push(
      'Falta natureza da operação nos padrões fiscais da empresa. Informe a natureza ou cadastre no ERP.'
    );
  }

  return {
    apto: faltas.length === 0,
    faltas,
    avisos,
    nfeStatus,
    temApiKey: Boolean(config?.apiKey?.trim()),
    naturezaDisponivel,
    cfopDisponivel
  };
}

function mapEmitResponse(
  data: any,
  httpStatus: number,
  fallbackNumero?: string,
  serie?: string
): {
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
} {
  const raw = data?.data && typeof data.data === 'object' ? { ...data, ...data.data } : data || {};
  const chave = raw.chaveAcesso || raw.chave || raw.nfeKey || raw.chave_acesso || raw.chaveNFe || '';
  const cStat = Number(raw.cStat ?? raw.codigoStatus);
  const nfeStatus = mapRemoteNfeStatus(raw.status, httpStatus, Number.isFinite(cStat) ? cStat : undefined);
  return {
    nfeStatus,
    nfeId: raw.invoiceId || raw.id || raw.uuid,
    nfeChave: chave || undefined,
    nfeNumero:
      raw.nNf != null ? String(raw.nNf) : raw.numero != null ? String(raw.numero) : fallbackNumero,
    nfeSerie: raw.serie != null ? String(raw.serie) : serie,
    nfeProtocolo: raw.nProt || raw.protocolo || raw.protocol || undefined,
    nfeDanfeUrl: raw.pdfUrl || raw.danfeUrl || raw.urlDanfe || raw.caminho_danfe,
    nfeXmlUrl: raw.xmlUrl || raw.urlXml || raw.caminho_xml_nota_fiscal,
    nfeEmissao: raw.dataEmissao,
    nfeErro:
      nfeStatus === 'rejeitada'
        ? raw.xMotivo || raw.message || raw.erro || raw.error || raw.motivo || 'Rejeitada pela SEFAZ'
        : undefined
  };
}

async function downloadDanfePdf(opts: {
  nfeId: string;
  apiKey: string;
  apiBaseUrl?: string;
}): Promise<{ buffer: Buffer; filename: string } | null> {
  const base = String(opts.apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 28000);
  try {
    const response = await fetch(`${base}/nfe/invoices/${encodeURIComponent(opts.nfeId)}/danfe`, {
      method: 'GET',
      headers: {
        Accept: 'application/pdf, application/json',
        'x-api-key': opts.apiKey
      },
      signal: controller.signal
    });
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('json') || !response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    const disposition = response.headers.get('content-disposition') || '';
    const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
    return {
      buffer,
      filename: filenameMatch?.[1] || `danfe-${opts.nfeId}.pdf`
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface EmitirNfeTelegramInput {
  order: SaleOrder;
  customer: Customer;
  config: FiscalConfig;
  natureza?: string;
  cfop?: string;
}

export interface EmitirNfeTelegramResult {
  order: SaleOrder;
  message: string;
  nfeStatus: NfeStatus;
  nfeNumero?: string;
  nfeChave?: string;
  nfeId?: string;
  danfeBuffer?: Buffer;
  danfeFilename?: string;
}

/**
 * Emite NF-e reutilizando validarDadosFiscais + montarPayloadNotaAs + postNotaasEmitir.
 * Não duplica a integração Notaas além do helper compartilhado.
 */
export async function emitirNfeParaPedidoTelegram(
  input: EmitirNfeTelegramInput
): Promise<EmitirNfeTelegramResult> {
  const aptidao = avaliarAptidaoNfe({
    order: input.order,
    customer: input.customer,
    config: input.config,
    naturezaOverride: input.natureza,
    cfopOverride: input.cfop
  });

  if (!aptidao.apto) {
    throw new Error(`Não dá para emitir a NF-e ainda:\n• ${aptidao.faltas.join('\n• ')}`);
  }

  let order = { ...input.order };
  if (input.natureza?.trim()) order.nfeNaturezaOperacao = input.natureza.trim();
  else if (aptidao.naturezaDisponivel) order.nfeNaturezaOperacao = aptidao.naturezaDisponivel;

  if (aptidao.cfopDisponivel) {
    order = {
      ...order,
      items: (order.items || []).map((item) => ({
        ...item,
        cfop: onlyDigits(item.cfop).length === 4 ? item.cfop : aptidao.cfopDisponivel
      }))
    };
  }

  const validation = fiscalService.validarDadosFiscais(order, input.customer, {
    requireResolvedIbge: false
  });
  if (!validation.valid) {
    throw new Error(`Dados fiscais incompletos:\n• ${validation.errors.join('\n• ')}`);
  }

  const payload = fiscalService.montarPayloadNotaAs(order, input.customer, input.config);
  const serie = input.config.serieNFe || '1';
  const fallbackNumero = String(input.config.proxNumeroNFe || '');

  const emitted = await postNotaasEmitir({
    payload: payload as any,
    apiKey: String(input.config.apiKey || ''),
    apiBaseUrl: input.config.apiBaseUrl,
    provider: input.config.apiProvider || 'notaas'
  });

  if (!emitted.ok) {
    const errData = emitted.data || {};
    let errMsg =
      errData.xMotivo || errData.message || errData.erro || errData.error || errData.motivo || errData.mensagem;
    if (Array.isArray(errData.erros) && errData.erros.length) {
      errMsg = errData.erros
        .map((e: any) => `${e.campo ? e.campo + ': ' : ''}${e.mensagem || e.msg || e}`)
        .join(' | ');
    }
    throw new Error(
      simplifyNotaasError(String(errMsg || `A NotaAs/SEFAZ recusou a emissão (HTTP ${emitted.status}).`))
    );
  }

  const mapped = mapEmitResponse(emitted.data, emitted.status, fallbackNumero, serie);
  const linked = buildLinkedNfe({
    id: mapped.nfeId || newId('nfe'),
    tipo: 'pedido',
    reference: order.nfeReferenciaExterna || order.reference,
    order,
    items: order.items || [],
    subtotal: order.subtotal,
    discount: order.discount || 0,
    shipping: order.shipping || 0,
    total: order.total,
    nfeStatus: mapped.nfeStatus,
    nfeId: mapped.nfeId,
    nfeChave: mapped.nfeChave,
    nfeNumero: mapped.nfeNumero,
    nfeSerie: mapped.nfeSerie,
    nfeProtocolo: mapped.nfeProtocolo,
    nfeDanfeUrl: mapped.nfeDanfeUrl,
    nfeXmlUrl: mapped.nfeXmlUrl,
    nfeEmissao: mapped.nfeEmissao,
    nfeErro: mapped.nfeErro,
    nfeNaturezaOperacao: order.nfeNaturezaOperacao,
    nfePayload: payload,
    nfeRawResponse: emitted.data
  });

  const updatedOrder = upsertLinkedNfe(order, linked);

  let danfeBuffer: Buffer | undefined;
  let danfeFilename: string | undefined;
  if (mapped.nfeStatus === 'autorizada' && mapped.nfeId) {
    const danfe = await downloadDanfePdf({
      nfeId: mapped.nfeId,
      apiKey: String(input.config.apiKey || ''),
      apiBaseUrl: input.config.apiBaseUrl
    });
    if (danfe) {
      danfeBuffer = danfe.buffer;
      danfeFilename = danfe.filename;
    }
  }

  const parts = [
    mapped.nfeStatus === 'autorizada'
      ? `NF-e autorizada para o pedido ${order.reference}.`
      : mapped.nfeStatus === 'processando'
        ? `NF-e enviada e em processamento na SEFAZ (pedido ${order.reference}).`
        : `NF-e com status ${mapped.nfeStatus} (pedido ${order.reference}).`
  ];
  if (mapped.nfeNumero) parts.push(`Número: ${mapped.nfeNumero}.`);
  if (mapped.nfeChave) parts.push(`Chave: ${mapped.nfeChave}.`);
  if (mapped.nfeErro) parts.push(`Detalhe: ${simplifyNotaasError(mapped.nfeErro)}`);

  return {
    order: updatedOrder,
    message: parts.join(' '),
    nfeStatus: mapped.nfeStatus,
    nfeNumero: mapped.nfeNumero,
    nfeChave: mapped.nfeChave,
    nfeId: mapped.nfeId,
    danfeBuffer,
    danfeFilename
  };
}

export function simplifyNotaasError(raw: string): string {
  const text = String(raw || '').trim();
  if (!text) return 'A SEFAZ/NotaAs recusou a nota. Confira o cadastro fiscal no ERP.';
  if (/401|chave rejeitada|api key|project key/i.test(text)) {
    return 'A chave da NotaAs foi rejeitada. Confira a Project Key nas Configurações Fiscais.';
  }
  if (/timeout|não respondeu|timed out/i.test(text)) {
    return 'A NotaAs demorou demais para responder. Tente de novo em instantes.';
  }
  if (/duplicidade|já existe|ja emitida|já emitida/i.test(text)) {
    return 'Parece que essa nota já foi emitida. Consulte o status no chat ou no ERP.';
  }
  return text.length > 280 ? `${text.slice(0, 277)}…` : text;
}
