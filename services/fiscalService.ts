import { SaleOrder, Customer, FiscalConfig, NfeStatus } from '../types';
import { DEFAULT_FISCAL_CONFIG, COMPANY_INFO } from '../constants';
import { db } from './dataService';
import { firebaseFunctions } from './firebase';
import { httpsCallable } from 'firebase/functions';
import { resolveIbgeCode } from './cepService';

/**
 * URL Base Oficial da API NotaAs (NF-e modelo 55)
 * Documentação: https://docs.notaas.com.br/docs/nfe/endpoints
 */
export const NOTAAS_API_BASE_URL = 'https://platform.notaas.com.br/api/v1';

/**
 * Tipagens oficiais do payload NotaAs NF-e 55
 * POST /nfe/emitir — emitente NÃO vai no payload (projeto + certificado A1).
 */
export interface NotaAsEndereco {
  logradouro: string;
  numero?: string;
  complemento?: string;
  bairro: string;
  codigoMunicipio: number;
  cidade: string;
  uf: string;
  cep: string;
}

export interface NotaAsDestinatario {
  cnpj?: string;
  cpf?: string;
  nome: string;
  ie?: string;
  indicadorIE?: number;
  email?: string;
  endereco: NotaAsEndereco;
}

export interface NotaAsItemPayload {
  descricao: string;
  codigo?: string;
  ncm: string;
  cfop: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  unidade: string;
  csosn?: string;
  cst?: string;
  aliquotaIcms?: number;
}

export interface NotaAsPagamento {
  tipoPagamento: string;
  valor: number;
}

export interface NotaAsTransporte {
  modalidadeFrete: number;
}

/**
 * Payload oficial POST /api/v1/nfe/emitir (modelo 55).
 * Não envia emitente, ambiente, serie, numero, total, destinatario ou itens (nomes antigos).
 */
export interface NotaAsCriarNFePayload {
  modelo: 55;
  naturezaOperacao: string;
  dest: NotaAsDestinatario;
  items: NotaAsItemPayload[];
  pagamentos: NotaAsPagamento[];
  transporte?: NotaAsTransporte;
  valorFrete?: number;
  tipoOperacao: 1;
  finalidade: 1;
  consumidorFinal: 0 | 1;
  presencaComprador: 1;
  infCpl?: string;
}

/**
 * Resposta oficial da NotaAs para emissão ou consulta de NF-e
 */
export interface NotaAsNFeDetalhes {
  id: string;
  invoiceId?: string;
  referenciaExterna?: string;
  status: 'processando' | 'autorizada' | 'rejeitada' | 'cancelada' | 'erro' | 'pendente';
  ambiente: 'producao' | 'homologacao';
  modelo: number;
  numero: number | string;
  nNf?: number | string;
  serie: number | string;
  chaveAcesso?: string;
  protocolo?: string;
  nProt?: string;
  motivoStatus?: string;
  codigoStatusSefaz?: string;
  cStat?: number | string;
  xMotivo?: string;
  danfeUrl?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  dataEmissao?: string;
  dataAutorizacao?: string;
  dataCancelamento?: string;
  justificativaCancelamento?: string;
  valorTotal?: number;
  destinatarioNome?: string;
  destinatarioDocumento?: string;
  erros?: Array<{ codigo: string; mensagem: string; campo?: string }>;
}

export interface EmitirNFeResult {
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
  rawResponse?: any;
}

export interface ConsultarNFeResult {
  success: boolean;
  nfe?: NotaAsNFeDetalhes;
  status: NfeStatus;
  error?: string;
}

export interface StatusSefazResult {
  success: boolean;
  status: 'online' | 'offline' | 'instavel';
  mensagem: string;
  tempoRespostaMs?: number;
  uf?: string;
}

/**
 * Módulo Auxiliar Fiscal para NotaAs (NF-e 4.0 / SEFAZ)
 */

/** Só marca autorizada se a API fiscal disse issued/autorizada. queued → processando. Nunca mock. */
export function mapRemoteNfeStatus(raw?: string, httpStatus?: number): NfeStatus {
  const s = (raw || '').toString().toLowerCase();
  if (['autorizada', 'issued', 'authorized', 'autorizado'].includes(s)) return 'autorizada';
  if (['cancelada', 'cancelled', 'canceled', 'cancelado'].includes(s)) return 'cancelada';
  if (['rejeitada', 'rejected', 'erro', 'error', 'erro_autorizacao'].includes(s)) return 'rejeitada';
  if (
    ['processando', 'processando_autorizacao', 'processing', 'pendente', 'pending', 'queued'].includes(s)
    || httpStatus === 202
  ) return 'processando';
  if (s === 'simulada') return 'simulada';
  return 'processando';
}

function resolveNfeStatus(rawStatus: string | undefined, httpStatus: number | undefined, chaveAcesso?: string): NfeStatus {
  if (httpStatus === 202) return 'processando';
  const mapped = mapRemoteNfeStatus(rawStatus, httpStatus);
  if (mapped === 'autorizada' && !chaveAcesso) return 'processando';
  return mapped;
}

async function fiscalApiFetch(path: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: any; isJson: boolean }> {
  const res = await fetch(path, init);
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : { error: 'Resposta não-JSON do proxy fiscal' };
  return { ok: res.ok || res.status === 201 || res.status === 202, status: res.status, data, isJson };
}

function onlyDigits(value?: string): string {
  return (value || '').replace(/\D/g, '');
}

export const fiscalService = {
  
  /**
   * Obtém as configurações fiscais salvas ou padrão
   */
  async getConfig(): Promise<FiscalConfig> {
    try {
      const saved = await db.getTable('fiscal_config');
      if (saved && saved.length > 0) {
        return { ...DEFAULT_FISCAL_CONFIG, ...saved[0] };
      }
    } catch {}
    return DEFAULT_FISCAL_CONFIG;
  },

  /**
   * Salva as configurações fiscais no repositório
   */
  async saveConfig(config: FiscalConfig): Promise<FiscalConfig> {
    await db.upsert('fiscal_config', 'main', config);
    return config;
  },

  /**
   * Gera cabeçalhos autenticados para as requisições HTTP da API NotaAs
   * Auth oficial: header x-api-key ONLY (nunca Bearer).
   */
  getHeaders(apiKey?: string): HeadersInit {
    const key = (apiKey || '').trim();
    return {
      'Content-Type': 'application/json',
      ...(key ? { 'x-api-key': key } : {})
    };
  },

  /**
   * Gera a chave de acesso padrão SEFAZ de 44 dígitos com dígito verificador ponderado módulo 11
   */
  generateMockChaveAcesso(cnpj: string, ufCode: string = '15', serie: string = '1', numero: string = '1001'): string {
    const cleanCnpj = (cnpj || '10375218000150').replace(/\D/g, '').padStart(14, '0');
    const now = new Date();
    const aamm = `${now.getFullYear().toString().slice(2)}${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    const mod = '55'; // Modelo NF-e
    const paddedSerie = serie.padStart(3, '0');
    const paddedNum = numero.padStart(9, '0');
    const tpEmis = '1'; // Emissão normal
    const cNF = Math.floor(10000000 + Math.random() * 90000000).toString(); // Código numérico randômico
    const base = `${ufCode}${aamm}${cleanCnpj}${mod}${paddedSerie}${paddedNum}${tpEmis}${cNF}`;
    
    // Cálculo do dígito verificador Módulo 11 (pesos de 2 a 9)
    let sum = 0;
    let weight = 2;
    for (let i = base.length - 1; i >= 0; i--) {
      sum += parseInt(base[i], 10) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const rest = sum % 11;
    const dv = (rest === 0 || rest === 1) ? 0 : 11 - rest;
    
    return `${base}${dv}`;
  },

  /**
   * Validação prévia dos dados cadastrais e fiscais do pedido e cliente
   * Sem fallbacks de endereço (Santarém/CEP fake). Falta de campo = falha.
   */
  validarDadosFiscais(
    order: SaleOrder,
    customer?: Customer,
    options?: { requireResolvedIbge?: boolean }
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!customer) {
      errors.push('Cliente não identificado no pedido.');
      return { valid: false, errors, warnings };
    }

    const docClean = onlyDigits(customer.document);
    if (docClean.length !== 11 && docClean.length !== 14) {
      errors.push('CPF (11 dígitos) ou CNPJ (14 dígitos) do destinatário é obrigatório.');
    }

    if (!customer.name || customer.name.trim().length < 2) {
      errors.push('Razão Social / Nome do destinatário é obrigatório (mínimo 2 caracteres).');
    }

    if (!customer.street || !customer.street.trim()) {
      errors.push('Logradouro (street) do destinatário é obrigatório.');
    }
    if (!customer.neighborhood || !customer.neighborhood.trim()) {
      errors.push('Bairro (neighborhood) do destinatário é obrigatório.');
    }
    if (!customer.city || !customer.city.trim()) {
      errors.push('Cidade do destinatário é obrigatória.');
    }
    if (!customer.state || !customer.state.trim()) {
      errors.push('UF (state) do destinatário é obrigatória.');
    }

    const zip = onlyDigits(customer.zipCode);
    if (zip.length !== 8) {
      errors.push('CEP (zipCode) do destinatário deve ter 8 dígitos.');
    }

    const ibge = onlyDigits(customer.ibgeCode);
    if (ibge.length !== 7) {
      // Não bloqueia a tela de emissão se CEP/cidade permitirem auto-resolver.
      // Após resolveIbgeCode em criarNFe, requireResolvedIbge=true falha de verdade.
      const canAuto =
        onlyDigits(customer.zipCode).length === 8 ||
        (!!(customer.city || '').trim() && !!(customer.state || '').trim());
      if (options?.requireResolvedIbge || !canAuto) {
        errors.push('Código IBGE do município não encontrado. Confira o CEP e a cidade do cliente.');
      } else {
        warnings.push('Código IBGE ausente — tentaremos preencher automaticamente pelo CEP e pela cidade.');
      }
    }

    if (!order.items || order.items.length === 0) {
      errors.push('O pedido de venda precisa conter pelo menos 1 item com valor.');
    }

    order.items?.forEach((item, idx) => {
      const ncm = onlyDigits(item.ncm);
      if (ncm.length !== 8) {
        errors.push(`Item ${idx + 1} (${item.productName}) precisa de NCM com 8 dígitos.`);
      }
      const cfop = onlyDigits(item.cfop);
      if (cfop.length !== 4) {
        errors.push(`Item ${idx + 1} (${item.productName}) precisa de CFOP com 4 dígitos.`);
      }
      if (!(item.quantity > 0)) {
        errors.push(`Item ${idx + 1} (${item.productName}) tem quantidade inválida.`);
      }
      if (!(item.total > 0)) {
        errors.push(`Item ${idx + 1} (${item.productName}) precisa de valorTotal > 0.`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  },

  /**
   * Constrói o payload oficial NF-e 55 da API NotaAs a partir dos dados do ERP.
   * Emitente NÃO entra no payload (projeto NotaAs + certificado A1).
   */
  montarPayloadNotaAs(
    order: SaleOrder, 
    customer: Customer, 
    config: FiscalConfig
  ): NotaAsCriarNFePayload {
    const isInterestadual = customer.state && customer.state !== COMPANY_INFO.state;
    const cfopPadrao = isInterestadual
      ? (config.cfopPadraoInterestadual || '6101')
      : (config.cfopPadraoEstadual || '5101');
    const docClean = onlyDigits(customer.document);
    const isPF = docClean.length === 11;
    const ibge = onlyDigits(customer.ibgeCode);
    const zip = onlyDigits(customer.zipCode);
    const isSimples = config.regimeTributario === '1';
    const indicadorIE = customer.isentoIE ? 2 : (customer.ie ? 1 : 9);

    const dest: NotaAsDestinatario = {
      nome: (customer.name || '').trim(),
      endereco: {
        logradouro: (customer.street || '').trim(),
        numero: customer.number || 'SN',
        bairro: (customer.neighborhood || '').trim(),
        codigoMunicipio: Number(ibge),
        cidade: (customer.city || '').trim(),
        uf: (customer.state || '').trim().toUpperCase(),
        cep: zip,
      }
    };

    if (isPF) dest.cpf = docClean;
    else dest.cnpj = docClean;
    if (customer.email) dest.email = customer.email;
    dest.indicadorIE = indicadorIE;
    if (indicadorIE === 1 && customer.ie) {
      dest.ie = onlyDigits(customer.ie);
    }

    const items: NotaAsItemPayload[] = (order.items || []).map((it, idx) => {
      const row: NotaAsItemPayload = {
        descricao: it.productName,
        codigo: it.productCode || `CALC-${idx + 1}`,
        ncm: onlyDigits(it.ncm),
        cfop: onlyDigits(it.cfop) || onlyDigits(cfopPadrao),
        quantidade: it.quantity,
        valorUnitario: it.unitPrice,
        valorTotal: it.total,
        unidade: it.unit || 'TON',
      };
      if (isSimples) {
        row.csosn = '102';
      } else {
        row.cst = '00';
        if (config.aliquotaIcmsPadrao != null) row.aliquotaIcms = config.aliquotaIcmsPadrao;
      }
      return row;
    });

    const tipoPagamento = order.paymentMethod === 'PIX' ? '17' : order.paymentMethod === 'Boleto' ? '15' : '01';
    const infParts = [
      config.observacoesFiscaisPadrao,
      `Pedido: ${order.reference}`,
      order.sellerName ? `Vendedor: ${order.sellerName}` : ''
    ].filter(Boolean);

    const payload: NotaAsCriarNFePayload = {
      modelo: 55,
      naturezaOperacao: config.naturezaOperacaoPadrao || 'Venda de producao do estabelecimento',
      dest,
      items,
      pagamentos: [{ tipoPagamento, valor: order.total }],
      transporte: { modalidadeFrete: order.shipping ? 0 : 9 },
      tipoOperacao: 1,
      finalidade: 1,
      consumidorFinal: isPF ? 1 : 0,
      presencaComprador: 1,
      infCpl: infParts.join(' | ').trim()
    };

    if (order.shipping) payload.valorFrete = order.shipping;
    return payload;
  },

  /**
   * [POST /api/v1/nfe/emitir]
   * Cria e emite uma nova NF-e de venda na API Fiscal (NotaAs / Focus NFe)
   */
  async criarNFe(
    order: SaleOrder, 
    customer: Customer, 
    overrideConfig?: FiscalConfig,
    companyId?: string
  ): Promise<EmitirNFeResult> {
    const resolvedCompanyId = companyId || order.companyId;
    const invoiceRequestId = `inv_req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const config = overrideConfig || (await this.getConfig());

    let dest: Customer = customer;
    if (customer) {
      const resolvedIbge = await resolveIbgeCode({
        zipCode: customer.zipCode,
        city: customer.city,
        state: customer.state,
        ibgeCode: customer.ibgeCode
      });
      dest = { ...customer, ibgeCode: resolvedIbge || customer.ibgeCode };

      const persistCompanyId = customer.companyId || order.companyId || resolvedCompanyId;
      const digits = (resolvedIbge || '').replace(/\D/g, '');
      if (digits.length === 7 && customer.id && persistCompanyId) {
        try {
          await db.upsert('customers', persistCompanyId, { id: customer.id, ibgeCode: digits });
        } catch (persistErr) {
          console.warn(`⚠️ [FISCAL SERVICE] [${invoiceRequestId}] Não foi possível persistir ibgeCode no cliente:`, persistErr);
        }
      }
    }

    const validation = this.validarDadosFiscais(order, dest, { requireResolvedIbge: true });

    if (!validation.valid) {
      console.warn(`⚠️ [FISCAL SERVICE] [${invoiceRequestId}] Falha na validação prévia dos dados fiscais:`, validation.errors);
      return {
        success: false,
        nfeStatus: 'rejeitada',
        nfeErro: validation.errors.join(' | '),
        rawResponse: { invoiceRequestId, validationErrors: validation.errors }
      };
    }

    const payload = this.montarPayloadNotaAs(order, dest, config);
    const nfeNumero = (config.proxNumeroNFe || 1042).toString();
    const serie = config.serieNFe || '1';
    const apiKey = (config.apiKey || '').trim();
    const isApiMode = config.modoEmissao === 'api_real' || apiKey.length > 0;
    const provider = config.apiProvider || 'notaas';
    const baseUrl = (config.apiBaseUrl || NOTAAS_API_BASE_URL).replace(/\/$/, '');
    const referenciaPedido = order.reference || `ORDER-${order.id}`;

    console.group(`🚀 [EMISSÃO NF-e API] [ID: ${invoiceRequestId}] Iniciando Envio para API Fiscal (${provider.toUpperCase()})`);
    console.info('🆔 Trace Request ID:', invoiceRequestId);
    console.info('📌 Referência do Pedido:', order.reference);
    console.info('🌐 Ambiente SEFAZ:', config.environment.toUpperCase());
    console.info('🔌 Modo de Operação:', isApiMode ? 'API REAL (Transmissão Direta)' : 'SIMULAÇÃO LOCAL / TREINAMENTO');
    console.info('🔑 Chave de API:', apiKey ? `${apiKey.substring(0, 8)}...` : 'NÃO INFORMADA');
    console.info('📍 URL Base da API:', baseUrl);

    console.group(`🔎 Mapeamento Completo do Schema [${invoiceRequestId}]`);
    console.info('👤 [DEST]:', payload.dest);
    console.info('📦 [ITEMS] (' + payload.items.length + ' item(ns)):', payload.items);
    console.info('💳 [PAGAMENTOS]:', payload.pagamentos);
    console.info('📄 [PAYLOAD COMPLETO EM JSON]:', JSON.stringify(payload, null, 2));
    console.groupEnd();
    console.groupEnd();

    if (isApiMode) {
      if (!apiKey) {
        console.error(`❌ [EMISSÃO NF-e API] [${invoiceRequestId}] Chave de API não configurada!`);
        return {
          success: false,
          nfeStatus: 'rejeitada',
          nfeErro: 'Chave de API não informada! Insira seu Token / Chave de API nas Configurações Fiscais para transmitir à sua conta da API.',
          rawResponse: { invoiceRequestId, error: 'API Key missing' }
        };
      }

      let headers: HeadersInit = this.getHeaders(apiKey);

      if (provider === 'focusnfe') {
        let authHeader = '';
        try {
          authHeader = `Basic ${btoa(`${apiKey}:`)}`;
        } catch {}
        headers = {
          'Content-Type': 'application/json',
          ...(authHeader ? { 'Authorization': authHeader } : {}),
          'x-api-key': apiKey
        };
      }

      let endpoints: string[] = [];
      if (provider === 'focusnfe') {
        const focusBase = config.environment === 'production' 
          ? 'https://api.focusnfe.com.br/v2' 
          : 'https://homologacao.focusnfe.com.br/v2';
        endpoints = [
          `${focusBase}/nfe?ref=${encodeURIComponent(referenciaPedido)}`,
          `${baseUrl}/nfe?ref=${encodeURIComponent(referenciaPedido)}`
        ];
      } else {
        endpoints = [`${baseUrl}/nfe/emitir`];
      }

      let response: Response | null = null;
      let endpointUsado = '';
      let lastFetchError = '';

      if (firebaseFunctions) {
        try {
          console.info(`⚡ [${invoiceRequestId}] Tentando emissão via Firebase Cloud Function (emitirNfe)...`);
          const emitirNfeFn = httpsCallable<any, any>(firebaseFunctions, 'emitirNfe');
          const fnResult = await emitirNfeFn({
            payload,
            companyId: resolvedCompanyId,
            provider,
            apiKey,
            apiBaseUrl: baseUrl,
            orderId: order.id,
          });

          if (fnResult?.data?.success || (fnResult?.data?.statusHttp >= 200 && fnResult?.data?.statusHttp < 300)) {
            const data = fnResult.data.data || {};
            console.group(`📡 [EMISSÃO NF-e API] [${invoiceRequestId}] Resposta Recebida via Firebase Cloud Function`);
            console.info(`✅ [SUCESSO HTTP ${fnResult.data.statusHttp}] [${invoiceRequestId}]`, data);
            console.groupEnd();

            const nextNum = parseInt(nfeNumero, 10) + 1;
            await this.saveConfig({ ...config, proxNumeroNFe: nextNum });

            const nfeChave = data.chaveAcesso || data.chave || data.chave_acesso || data.chaveNFe || '';
            const nfeProtocolo = data.nProt || data.protocolo || '';
            const danfeUrl = data.pdfUrl || data.danfeUrl || data.url_danfe || data.caminho_danfe || '';
            const xmlUrl = data.xmlUrl || data.url_xml || data.caminho_xml || '';
            const statusRetornado = resolveNfeStatus(data.status, fnResult.data.statusHttp, nfeChave);

            return {
              success: statusRetornado !== 'rejeitada',
              nfeStatus: statusRetornado,
              nfeId: data.invoiceId || data.id || data.uuid,
              nfeChave: nfeChave || undefined,
              nfeNumero: data.nNf != null ? String(data.nNf) : (data.numero ? String(data.numero) : nfeNumero),
              nfeSerie: data.serie ? String(data.serie) : serie,
              nfeProtocolo: nfeProtocolo || undefined,
              nfeDanfeUrl: danfeUrl || undefined,
              nfeXmlUrl: xmlUrl || undefined,
              nfeEmissao: data.dataEmissao,
              naturezaOperacao: payload.naturezaOperacao,
              nfeErro: statusRetornado === 'rejeitada' ? (data.xMotivo || data.motivoStatus || data.message || 'Rejeitada pela SEFAZ') : undefined,
              rawResponse: { invoiceRequestId, viaCloudFunction: true, ...data }
            };
          }
        } catch (fnErr: any) {
          console.warn(`⚠️ [${invoiceRequestId}] Cloud Function não respondeu ou em desenvolvimento, chaveando para Proxy:`, fnErr.message);
        }
      }

      try {
        console.info(`🛡️ [${invoiceRequestId}] Tentando emissão via Proxy Backend Server-to-Server (/api/nfe/emitir)...`);
        const proxyResponse = await fetch('/api/nfe/emitir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payload,
            apiKey,
            apiBaseUrl: baseUrl,
            provider,
            companyId: resolvedCompanyId,
            orderId: order.id
          })
        });

        const proxyType = proxyResponse.headers.get('content-type') || '';
        if (proxyResponse && proxyResponse.status !== 404 && proxyResponse.status !== 502 && proxyType.includes('json')) {
          response = proxyResponse;
          endpointUsado = '/api/nfe/emitir (Proxy Backend Anti-CORS)';
        } else if (proxyResponse) {
          console.warn(`⚠️ [${invoiceRequestId}] Proxy respondeu ${proxyResponse.status} (${proxyType || 'sem content-type'}), ignorando.`);
        }
      } catch (proxyErr: any) {
        console.warn(`⚠️ [${invoiceRequestId}] Proxy local não disponível, tentando endpoints diretos:`, proxyErr.message);
      }

      if (!response) {
        for (const endpoint of endpoints) {
          try {
            console.info(`🌐 [${invoiceRequestId}] Tentando requisição POST para: ${endpoint}`);
            response = await fetch(endpoint, {
              method: 'POST',
              headers,
              body: JSON.stringify(payload)
            });
            if (response) {
              endpointUsado = endpoint;
              break;
            }
          } catch (e: any) {
            lastFetchError = e.message || 'Erro de conexão/CORS';
            console.warn(`⚠️ [${invoiceRequestId}] Falha ao conectar em ${endpoint}:`, lastFetchError);
          }
        }
      }

      console.group(`📡 [EMISSÃO NF-e API] [${invoiceRequestId}] Resposta Recebida da API Fiscal (${provider.toUpperCase()})`);

      if (response && (response.ok || response.status === 201 || response.status === 202)) {
        const data = await response.json().catch(() => ({}));
        console.info(`✅ [SUCESSO HTTP ${response.status}] [${invoiceRequestId}]`, response.statusText);
        console.info('📍 Endpoint que respondeu:', endpointUsado);
        console.info('📦 Body da Resposta (JSON):', data);
        console.groupEnd();

        const nextNum = parseInt(nfeNumero, 10) + 1;
        await this.saveConfig({ ...config, proxNumeroNFe: nextNum });

        const chaveAcesso = data.chaveAcesso || data.chave || data.nfeKey || data.chave_acesso || data.chaveNFe || '';
        const statusRetornado = resolveNfeStatus(data.status, response.status, chaveAcesso);
        const nfeProtocolo = data.nProt || data.protocolo || data.protocol || '';

        return {
          success: statusRetornado !== 'rejeitada',
          nfeStatus: statusRetornado,
          nfeId: data.invoiceId || data.id || data.uuid,
          nfeChave: chaveAcesso || undefined,
          nfeNumero: data.nNf != null ? String(data.nNf) : (data.numero ? String(data.numero) : nfeNumero),
          nfeSerie: data.serie ? String(data.serie) : serie,
          nfeProtocolo: nfeProtocolo || undefined,
          nfeDanfeUrl: data.pdfUrl || data.danfeUrl || data.urlDanfe || data.caminho_danfe,
          nfeXmlUrl: data.xmlUrl || data.urlXml || data.caminho_xml_nota_fiscal,
          nfeEmissao: data.dataEmissao,
          naturezaOperacao: payload.naturezaOperacao,
          nfeErro: statusRetornado === 'rejeitada' ? (data.xMotivo || data.message || data.erro || data.motivo) : undefined,
          rawResponse: { invoiceRequestId, ...data }
        };
      } else if (response) {
        const errData = await response.json().catch(() => ({}));
        console.error(`❌ [REJEIÇÃO/ERRO HTTP ${response.status}] [${invoiceRequestId}]`, response.statusText);
        console.error('📍 Endpoint:', endpointUsado);
        console.error('📦 Body de Erro da API:', errData);
        console.groupEnd();

        let errMsg = errData.xMotivo || errData.message || errData.erro || errData.error || errData.motivo || errData.mensagem;
        if (Array.isArray(errData.erros) && errData.erros.length > 0) {
          errMsg = errData.erros.map((e: any) => `${e.campo ? e.campo + ': ' : ''}${e.mensagem || e.msg || e}`).join(' | ');
        }

        if (response.status === 409 || (errMsg && (errMsg.toLowerCase().includes('duplicidade') || errMsg.toLowerCase().includes('ja emitida') || errMsg.toLowerCase().includes('já existe')))) {
          console.info(`🔄 [IDEMPOTÊNCIA] [${invoiceRequestId}] Rejeição por duplicidade detectada. Consultando nota previamente transmitida para referência: ${referenciaPedido}`);
          const consultRes = await this.consultarPorReferencia(referenciaPedido, config);
          if (consultRes.success && consultRes.nfe) {
            console.info(`✅ [IDEMPOTÊNCIA RECUPERADA] Nota recuperada com sucesso da API NotaAs!`, consultRes.nfe);
            return {
              success: true,
              nfeStatus: consultRes.status,
              nfeId: consultRes.nfe.invoiceId || consultRes.nfe.id,
              nfeChave: consultRes.nfe.chaveAcesso,
              nfeNumero: (consultRes.nfe.nNf || consultRes.nfe.numero || nfeNumero).toString(),
              nfeSerie: (consultRes.nfe.serie || serie).toString(),
              nfeProtocolo: consultRes.nfe.nProt || consultRes.nfe.protocolo,
              nfeDanfeUrl: consultRes.nfe.pdfUrl || consultRes.nfe.danfeUrl,
              nfeXmlUrl: consultRes.nfe.xmlUrl,
              nfeEmissao: consultRes.nfe.dataEmissao,
              naturezaOperacao: payload.naturezaOperacao,
              rawResponse: { invoiceRequestId, recoveredFromConflict: true, ...consultRes.nfe }
            };
          }
        }

        if (!errMsg) {
          errMsg = `Resposta de Rejeição/Erro da API (${provider.toUpperCase()}) - HTTP Status ${response.status}`;
        }
        return {
          success: false,
          nfeStatus: 'rejeitada',
          nfeErro: `[HTTP ${response.status}] ${errMsg}`,
          rawResponse: { invoiceRequestId, ...errData }
        };
      } else {
        console.error(`💥 [FALHA DE REDE DE CONEXÃO] [${invoiceRequestId}]`, lastFetchError);
        console.groupEnd();
        return {
          success: false,
          nfeStatus: 'rejeitada',
          nfeErro: `Erro de comunicação com o servidor da API (${provider.toUpperCase()}). ${lastFetchError}. Se o servidor bloquear requisições diretas do navegador por política de CORS, certifique-se de que a origem da aplicação está autorizada no painel da API.`,
          rawResponse: { invoiceRequestId, error: lastFetchError }
        };
      }
    }

    console.info(`🧪 [${invoiceRequestId}] Executando em Modo Simulação Local (Treinamento sem API Externa)`);
    console.groupEnd();

    await new Promise(resolve => setTimeout(resolve, 600));
    const mockChave = this.generateMockChaveAcesso(config.cnpjEmitente, '15', serie, nfeNumero);
    const mockProtocolo = `11526000${Math.floor(1000000 + Math.random() * 9000000)}`;
    const nextNum = parseInt(nfeNumero, 10) + 1;
    await this.saveConfig({ ...config, proxNumeroNFe: nextNum });

    return {
      success: true,
      nfeStatus: 'simulada',
      nfeId: `sim-${Date.now()}`,
      nfeChave: `SIMULACAO-${mockChave}`,
      nfeNumero,
      nfeSerie: serie,
      nfeProtocolo: `SIM-${mockProtocolo}`,
      nfeEmissao: new Date().toISOString(),
      naturezaOperacao: payload.naturezaOperacao,
      rawResponse: { invoiceRequestId, mode: 'simulation', aviso: 'Simulação local. Esta nota NÃO foi autorizada pela SEFAZ.' }
    };
  },

  /**
   * Rotina de Polling / Acompanhamento de Nota Fiscal em Processamento na SEFAZ
   */
  async consultarEAtualizarStatusProcessamento(
    nfeIdOrChave: string,
    overrideConfig?: FiscalConfig,
    maxRetries: number = 5,
    delayMs: number = 3000
  ): Promise<ConsultarNFeResult> {
    let retries = 0;
    while (retries < maxRetries) {
      console.info(`⏳ [POLLING NF-e] Tentativa ${retries + 1}/${maxRetries} consultando status da nota ${nfeIdOrChave}...`);
      const result = await this.consultarNFe(nfeIdOrChave, overrideConfig);
      if (result.success && result.status !== 'processando') {
        console.info(`🎉 [POLLING NF-e] Processamento finalizado! Status final: ${result.status.toUpperCase()}`);
        return result;
      }
      retries++;
      if (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    return {
      success: false,
      status: 'processando',
      error: 'Nota ainda em processamento na SEFAZ. Não foi possível confirmar autorização.'
    };
  },

  /**
   * Alias de compatibilidade com outros componentes
   */
  async emitirNFe(order: SaleOrder, customer: Customer, overrideConfig?: FiscalConfig, companyId?: string): Promise<EmitirNFeResult> {
    return this.criarNFe(order, customer, overrideConfig, companyId || order.companyId);
  },

  /**
   * [GET /api/v1/nfe/invoices/{id}/status]
   * Consulta os dados, status e links de uma NF-e na NotaAs
   */
  async consultarNFe(
    nfeIdOrChave: string, 
    overrideConfig?: FiscalConfig
  ): Promise<ConsultarNFeResult> {
    if (!nfeIdOrChave) {
      return { success: false, status: 'nao_emitida', error: 'ID ou chave de acesso não fornecida.' };
    }

    const config = overrideConfig || (await this.getConfig());
    const apiKey = (config.apiKey || '').trim();

    if (!apiKey) {
      return { success: false, status: 'nao_emitida', error: 'Chave de API não configurada. Não é possível consultar a SEFAZ.' };
    }

    try {
      const proxied = await fiscalApiFetch('/api/nfe/consultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: nfeIdOrChave,
          nfeIdOrChave,
          apiKey,
          apiBaseUrl: config.apiBaseUrl || NOTAAS_API_BASE_URL,
          provider: config.apiProvider || 'notaas'
        })
      });

      if (!proxied.isJson) {
        return { success: false, status: 'nao_emitida', error: 'Proxy de consulta fiscal retornou resposta inválida.' };
      }

      if (proxied.ok) {
        const data = proxied.data?.data || proxied.data;
        const chaveAcesso = data.chaveAcesso || data.chave || '';
        const st = resolveNfeStatus(data.status || data.nfe?.status, proxied.status, chaveAcesso);
        const invoiceId = data.invoiceId || data.id || nfeIdOrChave;
        const nNf = data.nNf ?? data.numero ?? 0;
        const nProt = data.nProt || data.protocolo || data.protocol;
        const pdfUrl = data.pdfUrl || data.danfeUrl;
        return {
          success: st !== 'rejeitada',
          status: st,
          nfe: {
            id: invoiceId,
            invoiceId,
            referenciaExterna: data.referenciaExterna || data.externalReference,
            status: st as any,
            ambiente: config.environment === 'production' ? 'producao' : 'homologacao',
            modelo: 55,
            numero: nNf,
            nNf,
            serie: data.serie || 1,
            chaveAcesso,
            protocolo: nProt,
            nProt,
            cStat: data.cStat,
            xMotivo: data.xMotivo,
            motivoStatus: data.xMotivo || data.motivoStatus,
            codigoStatusSefaz: data.cStat != null ? String(data.cStat) : undefined,
            danfeUrl: pdfUrl,
            pdfUrl,
            xmlUrl: data.xmlUrl,
            dataEmissao: data.dataEmissao || data.createdAt,
            dataAutorizacao: data.dataAutorizacao || data.authorizedAt,
            valorTotal: data.vNf || data.valorTotal || data.total
          }
        };
      }

      return {
        success: false,
        status: 'nao_emitida',
        error: proxied.data?.error || proxied.data?.message || `Falha ao consultar NF-e (HTTP ${proxied.status}).`
      };
    } catch (err: any) {
      return { success: false, status: 'nao_emitida', error: err.message || 'Erro ao consultar NF-e via proxy.' };
    }
  },

  /**
   * Consulta uma NF-e a partir da referência interna do pedido
   */
  async consultarPorReferencia(
    referencia: string, 
    overrideConfig?: FiscalConfig
  ): Promise<ConsultarNFeResult> {
    const config = overrideConfig || (await this.getConfig());
    const apiKey = (config.apiKey || '').trim();
    if (apiKey) {
      try {
        const proxied = await fiscalApiFetch('/api/nfe/consultar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            referencia,
            apiKey,
            apiBaseUrl: config.apiBaseUrl || NOTAAS_API_BASE_URL,
            provider: config.apiProvider || 'notaas'
          })
        });
        if (proxied.ok && proxied.isJson) {
          const data = proxied.data?.data || proxied.data;
          const item = Array.isArray(data) ? data[0] : (data.items ? data.items[0] : data);
          if (item && (item.invoiceId || item.id || item.chaveAcesso || item.chave)) {
            const chave = item.chaveAcesso || item.chave || '';
            const st = resolveNfeStatus(item.status, proxied.status, chave);
            return { success: st === 'autorizada' || st === 'processando' || st === 'cancelada', status: st, nfe: item };
          }
        }
      } catch {}
    }

    return {
      success: false,
      status: 'nao_emitida',
      error: 'Nota Fiscal não encontrada para esta referência.'
    };
  },

  /**
   * Consulta o status de operação dos servidores da SEFAZ via proxy
   */
  async consultarStatusSefaz(overrideConfig?: FiscalConfig): Promise<StatusSefazResult> {
    const config = overrideConfig || (await this.getConfig());
    const start = Date.now();

    const apiKey = (config.apiKey || '').trim();
    if (apiKey) {
      try {
        const proxied = await fiscalApiFetch('/api/nfe/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey,
            apiBaseUrl: config.apiBaseUrl || NOTAAS_API_BASE_URL,
            provider: config.apiProvider || 'notaas'
          })
        });
        const elapsed = Date.now() - start;
        if (proxied.ok && proxied.isJson) {
          const data = proxied.data?.data || proxied.data;
          return {
            success: true,
            status: (data.status === 'offline' || data.status === 'instavel') ? data.status : 'online',
            mensagem: data.mensagem || data.message || 'SEFAZ respondeu ao status.',
            tempoRespostaMs: elapsed,
            uf: (config as any).estadoEmitente || 'PA'
          };
        }
        return {
          success: false,
          status: 'offline',
          mensagem: proxied.data?.error || `Não foi possível consultar a SEFAZ (HTTP ${proxied.status}).`,
          tempoRespostaMs: elapsed,
          uf: (config as any).estadoEmitente || 'PA'
        };
      } catch (err: any) {
        return {
          success: false,
          status: 'offline',
          mensagem: err.message || 'Falha ao consultar status da SEFAZ.',
          uf: (config as any).estadoEmitente || 'PA'
        };
      }
    }

    return {
      success: false,
      status: 'offline',
      mensagem: 'Chave de API não configurada. Status da SEFAZ não foi consultado.',
      uf: (config as any).estadoEmitente || 'PA'
    };
  },

  /**
   * [POST /api/v1/nfe/cancelar]
   * Cancela uma NF-e autorizada perante a SEFAZ
   */
  async cancelarNFe(
    chaveOuId: string, 
    justificativa: string, 
    overrideConfig?: FiscalConfig
  ): Promise<{ success: boolean; error?: string; rawResponse?: any }> {
    if (!justificativa || justificativa.trim().length < 15) {
      return { 
        success: false, 
        error: 'A justificativa de cancelamento deve ter no mínimo 15 caracteres (Exigência legal SEFAZ).' 
      };
    }

    const config = overrideConfig || (await this.getConfig());

    const apiKey = (config.apiKey || '').trim();
    if (apiKey) {
      try {
        const proxied = await fiscalApiFetch('/api/nfe/cancelar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: chaveOuId,
            chaveOuId,
            justificativa: justificativa.trim(),
            motivo: justificativa.trim(),
            apiKey,
            apiBaseUrl: config.apiBaseUrl || NOTAAS_API_BASE_URL,
            provider: config.apiProvider || 'notaas'
          })
        });
        if (proxied.ok && proxied.isJson) {
          return { success: true, rawResponse: proxied.data };
        }
        return {
          success: false,
          error: proxied.data?.error || proxied.data?.message || proxied.data?.erro || 'Cancelamento rejeitado pela SEFAZ.',
          rawResponse: proxied.data
        };
      } catch (err: any) {
        return { success: false, error: err.message || 'Erro de comunicação com o proxy fiscal' };
      }
    }

    return { success: false, error: 'Cancelamento em simulação local não é enviado à SEFAZ. Configure a chave de API.' };
  },

  /**
   * Obtém a URL de download ou visualização do DANFE PDF
   */
  async obterDanfePdfUrl(chaveOuId: string, overrideConfig?: FiscalConfig): Promise<string | null> {
    const config = overrideConfig || (await this.getConfig());
    const apiKey = (config.apiKey || '').trim();
    if (apiKey) {
      try {
        const proxied = await fiscalApiFetch('/api/nfe/consultar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: chaveOuId,
            nfeIdOrChave: chaveOuId,
            resource: 'danfe',
            apiKey,
            apiBaseUrl: config.apiBaseUrl || NOTAAS_API_BASE_URL,
            provider: config.apiProvider || 'notaas'
          })
        });
        const url = proxied.data?.pdfUrl || proxied.data?.danfeUrl || proxied.data?.data?.pdfUrl || proxied.data?.data?.danfeUrl;
        if (proxied.ok && url) return url;
      } catch {}
    }
    return null;
  },

  /**
   * Obtém o XML assinado da NF-e
   */
  async obterXmlNFe(chaveOuId: string, overrideConfig?: FiscalConfig): Promise<string | null> {
    const config = overrideConfig || (await this.getConfig());
    const apiKey = (config.apiKey || '').trim();
    if (apiKey) {
      try {
        const proxied = await fiscalApiFetch('/api/nfe/consultar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: chaveOuId,
            nfeIdOrChave: chaveOuId,
            resource: 'xml',
            apiKey,
            apiBaseUrl: config.apiBaseUrl || NOTAAS_API_BASE_URL,
            provider: config.apiProvider || 'notaas'
          })
        });
        const xml = proxied.data?.xml || proxied.data?.data?.xml || proxied.data?.xmlUrl;
        if (proxied.ok && xml) return typeof xml === 'string' ? xml : null;
      } catch {}
    }
    return null;
  },

  /**
   * Gera o arquivo XML padrão NF-e 4.00 compatível com SEFAZ
   */
  gerarXml(order: SaleOrder, customer: Customer, config: FiscalConfig): string {
    const chave = order.nfeChave || this.generateMockChaveAcesso(config.cnpjEmitente, '15', order.nfeSerie || '1', order.nfeNumero || '1041');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe${chave}" versao="4.00">
      <ide>
        <cUF>15</cUF>
        <cNF>18940219</cNF>
        <natOp>${order.nfeNaturezaOperacao || config.naturezaOperacaoPadrao || 'Venda de producao do estabelecimento'}</natOp>
        <mod>55</mod>
        <serie>${order.nfeSerie || '1'}</serie>
        <nNF>${order.nfeNumero || '1041'}</nNF>
        <dhEmi>${order.nfeEmissao || new Date().toISOString()}</dhEmi>
        <tpNF>1</tpNF>
        <idDest>${customer.state === 'PA' ? '1' : '2'}</idDest>
        <cMunFG>1506807</cMunFG>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <tpAmb>${config.environment === 'production' ? '1' : '2'}</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>${customer.tipoPessoa === 'PF' ? '1' : '0'}</indFinal>
        <indPres>1</indPres>
        <procEmi>0</procEmi>
        <verProc>CalcarioFlow_v1.0_NotaAs</verProc>
      </ide>
      <emit>
        <CNPJ>${config.cnpjEmitente.replace(/\D/g, '')}</CNPJ>
        <xNome>${config.razaoSocial}</xNome>
        <xFant>${config.nomeFantasia}</xFant>
        <enderEmit>
          <xLgr>Rodovia Mineral BR-163, Km 42</xLgr>
          <nro>S/N</nro>
          <xBairro>Distrito Industrial</xBairro>
          <cMun>1506807</cMun>
          <xMun>Santarem</xMun>
          <UF>PA</UF>
          <CEP>68000000</CEP>
          <cPais>1058</cPais>
          <xPais>Brasil</xPais>
        </enderEmit>
        <IE>${config.inscricaoEstadual.replace(/\D/g, '')}</IE>
        <CRT>${config.regimeTributario}</CRT>
      </emit>
      <dest>
        <CNPJ>${customer.document.replace(/\D/g, '')}</CNPJ>
        <xNome>${customer.name}</xNome>
        <enderDest>
          <xLgr>${customer.street || 'Zona Rural'}</xLgr>
          <nro>${customer.number || 'S/N'}</nro>
          <xBairro>${customer.neighborhood || 'Rural'}</xBairro>
          <cMun>${customer.ibgeCode || '1506807'}</cMun>
          <xMun>${customer.city || 'Santarem'}</xMun>
          <UF>${customer.state || 'PA'}</UF>
          <CEP>${(customer.zipCode || '68000000').replace(/\D/g, '')}</CEP>
          <cPais>1058</cPais>
          <xPais>Brasil</xPais>
        </enderDest>
        <indIEDest>${customer.isentoIE ? '2' : (customer.ie ? '1' : '9')}</indIEDest>
        <IE>${customer.ie ? customer.ie.replace(/\D/g, '') : ''}</IE>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>${order.items[0]?.productCode || 'CALC-001'}</cProd>
          <cEAN>SEM GTIN</cEAN>
          <xProd>${order.items[0]?.productName || 'Calcario Moido Granel'}</xProd>
          <NCM>${(order.items[0]?.ncm || '25171000').replace(/\D/g, '')}</NCM>
          <CFOP>${order.items[0]?.cfop || config.cfopPadraoEstadual}</CFOP>
          <uCom>${order.items[0]?.unit || 'TON'}</uCom>
          <qCom>${order.items[0]?.quantity || 1}</qCom>
          <vUnCom>${(order.items[0]?.unitPrice || 0).toFixed(2)}</vUnCom>
          <vProd>${order.subtotal.toFixed(2)}</vProd>
          <cEANTrib>SEM GTIN</cEANTrib>
          <uTrib>${order.items[0]?.unit || 'TON'}</uTrib>
          <qTrib>${order.items[0]?.quantity || 1}</qTrib>
          <vUnTrib>${(order.items[0]?.unitPrice || 0).toFixed(2)}</vUnTrib>
          <indTot>1</indTot>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vBC>0.00</vBC>
          <vICMS>0.00</vICMS>
          <vProd>${order.subtotal.toFixed(2)}</vProd>
          <vFrete>${(order.shipping || 0).toFixed(2)}</vFrete>
          <vDesc>${(order.discount || 0).toFixed(2)}</vDesc>
          <vNF>${order.total.toFixed(2)}</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <tpAmb>${config.environment === 'production' ? '1' : '2'}</tpAmb>
      <verAplic>NotaAs_v1.0</verAplic>
      <chNFe>${chave}</chNFe>
      <dhRecbto>${order.nfeEmissao || new Date().toISOString()}</dhRecbto>
      <nProt>${order.nfeProtocolo || '115260004928192'}</nProt>
      <digVal>zFqA7yq8XG183K=</digVal>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso da NF-e</xMotivo>
    </infProt>
  </protNFe>
</nfeProc>`;
    return xml;
  }
};
