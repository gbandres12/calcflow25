import { SaleOrder, Customer, FiscalConfig, NfeStatus } from '../types';
import { DEFAULT_FISCAL_CONFIG, COMPANY_INFO } from '../constants';
import { db, resolveCompanyKey } from './dataService';
import { firebaseFunctions } from './firebase';
import { httpsCallable } from 'firebase/functions';
import { resolveIbgeCode } from './cepService';
import { INF_ADPROD_MAX, buildNfeInfCpl } from './nfeComplementares';
import { CANCEL_CSTATS, mapRemoteNfeStatus, preferCancelledStatus } from './nfeRemoteStatus';

export { mapRemoteNfeStatus } from './nfeRemoteStatus';

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

export interface NotaAsNfeReferenciada {
  chaveAcesso: string;
  nItem: number;
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
  aliquotaPis?: number;
  aliquotaCofins?: number;
  nfeReferenciada?: NotaAsNfeReferenciada;
  infAdProd?: string;
}

export interface NfeEmitOpts {
  devolucao?: { chaveAcesso: string; nItem?: number };
  transferencia?: boolean;
  semPagamento?: boolean;
  carregamento?: {
    ticketPesagem?: string;
    placa?: string;
    motorista?: string;
    driverCpf?: string;
    pedidoExterno?: string;
  };
}

export interface NotaAsPagamento {
  tipoPagamento: string;
  valor: number;
}

export interface NotaAsTransportadora {
  documento?: string;
  nome?: string;
  ie?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  rntrc?: string;
}

export interface NotaAsVeiculo {
  placa?: string;
  uf?: string;
  rntrc?: string;
}

export interface NotaAsVolume {
  quantidade?: number;
  especie?: string;
  marca?: string;
  pesoLiquido?: number;
  pesoBruto?: number;
}

export interface NotaAsTransporte {
  modalidadeFrete: number;
  transportadora?: NotaAsTransportadora;
  veiculo?: NotaAsVeiculo;
  volumes?: NotaAsVolume[];
  pesoLiquido?: number;
  pesoBruto?: number;
}

/** qVol no XSD da SEFAZ é inteiro [0-9]{1,15}. Peso fica em pesoL/pesoB — nunca em quantidade. */
export function nfeQVol(raw?: number | string | null): number {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

/**
 * Grupo transporta na NF-e:
 * - CIF (0) e terceiros (2): CNPJ/CPF da transportadora contratada.
 * - FOB (1) e transporte próprio destinatário (4): só motorista (CPF), padrão eFácil/SEFAZ PA.
 * - CNPJ de transportadora em FOB costuma gerar rejeição na NotaAs.
 */
export function modFreteAllowsGrupoTransportador(mod: number, documentoDigits?: string): boolean {
  const d = (documentoDigits || '').replace(/\D/g, '');
  if (mod === 0 || mod === 2) return true;
  if (mod === 1 || mod === 4) return d.length === 11;
  return false;
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
  tipoOperacao: 0 | 1;
  finalidade: 1 | 2 | 3 | 4;
  consumidorFinal: 0 | 1;
  presencaComprador: 1;
  infCpl?: string;
  referenciaExterna?: string;
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

function resolveNfeStatus(
  rawStatus: string | undefined,
  httpStatus: number | undefined,
  _chaveAcesso?: string,
  cStat?: number,
  extras?: { event?: string; cancelledAt?: string | null }
): NfeStatus {
  if (httpStatus === 202 && !extras?.cancelledAt) return 'processando';
  return mapRemoteNfeStatus(rawStatus, httpStatus, cStat, extras);
}

function unwrapFiscalJson(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw || {};
  let next = raw;
  if (next.data && typeof next.data === 'object' && !Array.isArray(next.data)) {
    next = { ...next, ...next.data };
  }
  if (next.invoice && typeof next.invoice === 'object' && !Array.isArray(next.invoice)) {
    next = { ...next, ...next.invoice };
  }
  if (next.nfe && typeof next.nfe === 'object' && !Array.isArray(next.nfe) && !next.status) {
    next = { ...next, ...next.nfe };
  }
  return next;
}

export function mergeNfeConsulta(order: SaleOrder, result: ConsultarNFeResult): SaleOrder {
  const n = result.nfe;
  const nfeStatus = preferCancelledStatus(
    order.nfeStatus,
    result.status && result.status !== 'nao_emitida' ? result.status : undefined
  ) || order.nfeStatus;
  const nfeErro =
    nfeStatus === 'rejeitada'
      ? (n?.xMotivo || n?.motivoStatus || result.error || order.nfeErro || 'Rejeitada pela SEFAZ')
      : nfeStatus === 'autorizada'
        ? ''
        : (n?.xMotivo || order.nfeErro);
  const merged: SaleOrder = {
    ...order,
    nfeStatus,
    nfeId: n?.invoiceId || n?.id || order.nfeId,
    nfeChave: n?.chaveAcesso || order.nfeChave,
    nfeNumero: n?.nNf != null ? String(n.nNf) : (n?.numero != null ? String(n.numero) : order.nfeNumero),
    nfeSerie: n?.serie != null ? String(n.serie) : order.nfeSerie,
    nfeProtocolo: n?.nProt || n?.protocolo || order.nfeProtocolo,
    nfeDanfeUrl: n?.pdfUrl || n?.danfeUrl || order.nfeDanfeUrl,
    nfeXmlUrl: n?.xmlUrl || order.nfeXmlUrl,
    nfeEmissao: n?.dataEmissao || n?.dataAutorizacao || order.nfeEmissao,
    nfeErro: nfeErro || undefined,
  };
  const invoiceId = merged.nfeId;
  if (invoiceId && Array.isArray(order.nfes) && order.nfes.length > 0) {
    merged.nfes = order.nfes.map((linked) =>
      linked.nfeId === invoiceId
        ? {
            ...linked,
            nfeStatus: merged.nfeStatus || linked.nfeStatus,
            nfeId: merged.nfeId || linked.nfeId,
            nfeChave: merged.nfeChave || linked.nfeChave,
            nfeNumero: merged.nfeNumero || linked.nfeNumero,
            nfeSerie: merged.nfeSerie || linked.nfeSerie,
            nfeProtocolo: merged.nfeProtocolo || linked.nfeProtocolo,
            nfeDanfeUrl: merged.nfeDanfeUrl || linked.nfeDanfeUrl,
            nfeXmlUrl: merged.nfeXmlUrl || linked.nfeXmlUrl,
            nfeEmissao: merged.nfeEmissao || linked.nfeEmissao,
            nfeErro: merged.nfeErro,
          }
        : linked
    );
  }
  return merged;
}

function nfeFromStatusPayload(data: any, httpStatus?: number): ConsultarNFeResult {
  const raw = unwrapFiscalJson(data);
  const chaveAcesso = raw.chaveAcesso || raw.chave || raw.nfeKey || '';
  const cancelCStat = Number(raw.cancelamento?.cStat ?? raw.cStatCancelamento ?? raw.cStatEvento);
  const emissionCStat = Number(raw.cStat ?? raw.codigoStatus);
  const cStat = (Number.isFinite(cancelCStat) && CANCEL_CSTATS.has(cancelCStat))
    ? cancelCStat
    : emissionCStat;
  const cancelledAt = raw.cancelledAt || raw.canceledAt || raw.dataCancelamento
    || raw.cancelamento?.dhEvento || raw.cancelamento?.data || raw.dhCancelamento || null;
  const st = resolveNfeStatus(
    raw.status || raw.nfe?.status || raw.situacao,
    httpStatus,
    chaveAcesso,
    Number.isFinite(cStat) ? cStat : undefined,
    { event: raw.event || raw.evento || raw.tipoEvento, cancelledAt }
  );
  const invoiceId = raw.invoiceId || raw.id;
  const nNf = raw.nNf ?? raw.numero;
  const nProt = raw.nProt || raw.protocolo || raw.protocol;
  const pdfUrl = raw.pdfUrl || raw.danfeUrl;
  const xMotivo = raw.xMotivo || raw.motivo || raw.motivoStatus || raw.errorMessage;
  return {
    success: st === 'autorizada' || st === 'processando' || st === 'cancelada',
    status: st,
    error: st === 'rejeitada' ? (xMotivo || raw.error || raw.message) : undefined,
    nfe: {
      id: invoiceId,
      invoiceId,
      referenciaExterna: raw.referenciaExterna || raw.externalReference,
      status: st as any,
      ambiente: raw.tpAmb === 1 ? 'producao' : 'homologacao',
      modelo: raw.modelo || 55,
      numero: nNf,
      nNf,
      serie: raw.serie || 1,
      chaveAcesso,
      protocolo: nProt,
      nProt,
      cStat: raw.cStat ?? raw.codigoStatus,
      xMotivo,
      motivoStatus: xMotivo,
      codigoStatusSefaz: raw.cStat != null ? String(raw.cStat) : (raw.codigoStatus != null ? String(raw.codigoStatus) : undefined),
      danfeUrl: pdfUrl,
      pdfUrl,
      xmlUrl: raw.xmlUrl,
      dataEmissao: raw.dataEmissao || raw.createdAt,
      dataAutorizacao: raw.dataAutorizacao || raw.authorizedAt || raw.dhRecbto,
      valorTotal: raw.vNf || raw.valorTotal || raw.total,
    },
  };
}

async function fiscalApiFetch(path: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: any; isJson: boolean }> {
  try {
    const res = await fetch(path, init);
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json().catch(() => ({})) : { error: 'Resposta não-JSON do proxy fiscal' };
    return { ok: res.ok || res.status === 201 || res.status === 202, status: res.status, data, isJson };
  } catch (err: any) {
    console.warn(`⚠️ [fiscalApiFetch] Falha na requisição para ${path}:`, err?.message || err);
    return {
      ok: false,
      status: 0,
      isJson: true,
      data: {
        error: `Erro de comunicação com o servidor da API Fiscal (${err?.message || 'Failed to fetch'}). Verifique a Project Key nas configurações fiscais e a conexão de rede.`,
        isNetworkError: true,
        networkErrorDetails: err?.message
      }
    };
  }
}

function onlyDigits(value?: string): string {
  return (value || '').replace(/\D/g, '');
}

export const fiscalService = {
  
  /**
   * Obtém as configurações fiscais salvas ou padrão
   */
  async getConfig(companyId?: string): Promise<FiscalConfig> {
    const compKey = resolveCompanyKey(companyId);
    try {
      const saved = await db.getTable('fiscal_config', compKey);
      if (saved && saved.length > 0) {
        const row = saved.find((c: FiscalConfig) => c?.id && c.id !== '__seed__') || saved[0];
        return { ...DEFAULT_FISCAL_CONFIG, ...row, companyId: row?.companyId || compKey };
      }
    } catch {}
    return { ...DEFAULT_FISCAL_CONFIG, companyId: compKey };
  },

  /**
   * Salva as configurações fiscais no repositório da empresa
   */
  async saveConfig(config: FiscalConfig, companyId?: string): Promise<FiscalConfig> {
    const compKey = resolveCompanyKey(companyId || config.companyId);
    const tagged: FiscalConfig = {
      ...config,
      id: config.id || 'fiscal-main-config',
      companyId: compKey
    };
    await db.upsert('fiscal_config', compKey, tagged);
    return tagged;
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
   * Validação prévia dos dados cadastrais e fiscais do pedido e cliente.
   * Campos de endereço ausentes recebem fallbacks seguros (ex: Zona Rural / SN)
   * com avisos (warnings), evitando o bloqueio desnecessário da emissão.
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
    if (!docClean || (docClean.length !== 11 && docClean.length !== 14)) {
      errors.push('CPF (11 dígitos) ou CNPJ (14 dígitos) do destinatário é obrigatório para emissão de NF-e.');
    }

    if (!customer.name || customer.name.trim().length < 2) {
      errors.push('Razão Social / Nome do destinatário é obrigatório (mínimo 2 caracteres).');
    }

    // Validações de endereço com fallbacks inteligentes em vez de bloqueio rígido
    if (!customer.street || !customer.street.trim()) {
      warnings.push('Logradouro não informado: será utilizado "Zona Rural / Rodovia" na NF-e.');
    }
    if (!customer.neighborhood || !customer.neighborhood.trim()) {
      warnings.push('Bairro não informado: será utilizado "Zona Rural" na NF-e.');
    }
    if (!customer.city || !customer.city.trim()) {
      warnings.push('Cidade não informada: será assumido o município polo da empresa emitente.');
    }
    if (!customer.state || !customer.state.trim()) {
      warnings.push('UF não informada: será assumida a UF da empresa emitente.');
    }

    const zip = onlyDigits(customer.zipCode);
    if (zip.length !== 8) {
      warnings.push('CEP não informado ou incompleto: será utilizado o CEP geral do município.');
    }

    const ibge = onlyDigits(customer.ibgeCode);
    if (ibge.length !== 7) {
      const canAuto =
        zip.length === 8 ||
        (!!(customer.city || '').trim() && !!(customer.state || '').trim());
      if (options?.requireResolvedIbge && !canAuto && !customer.city) {
        errors.push('Código IBGE do município não encontrado. Confira a cidade do cliente.');
      } else {
        warnings.push('Código IBGE ausente: será preenchido automaticamente com base no município.');
      }
    }

    if (!order.items || order.items.length === 0) {
      errors.push('O pedido de venda precisa conter pelo menos 1 item com valor.');
    }

    order.items?.forEach((item, idx) => {
      const ncm = onlyDigits(item.ncm);
      if (ncm.length !== 8) {
        warnings.push(`Item ${idx + 1} (${item.productName}): NCM não informado (será utilizado 2517.10.00 padrão de calcário).`);
      }
      const cfop = onlyDigits(item.cfop);
      if (cfop.length !== 4) {
        warnings.push(`Item ${idx + 1} (${item.productName}): CFOP não informado (será utilizado CFOP padrão de venda).`);
      }
      if (!(item.quantity > 0)) {
        errors.push(`Item ${idx + 1} (${item.productName}) tem quantidade inválida (deve ser maior que zero).`);
      }
      if (!(item.total > 0)) {
        errors.push(`Item ${idx + 1} (${item.productName}) precisa de valorTotal maior que zero.`);
      }
    });

    // Validação leve do frete (nunca bloqueia, só orienta)
    const freteMod = Number(order.frete?.modalidade ?? (order.shipping ? 0 : 9));
    const freteVal = Number(order.frete?.valor ?? order.shipping ?? 0) || 0;
    if (![0, 1, 2, 3, 4, 9].includes(freteMod)) {
      errors.push('Modalidade de frete inválida. Use 9 (sem frete), 0 (CIF), 1 (FOB), 2, 3 ou 4.');
    }
    if (freteMod === 9 && freteVal > 0) {
      warnings.push('Valor de frete informado com modalidade "Sem frete (9)": o valor será desconsiderado na NF-e.');
    }
    if (freteMod !== 9 && freteVal > 0 && freteMod === 1) {
      warnings.push('Frete FOB: o valor do frete é por conta do destinatário — confira se deve compor o total da nota.');
    }
    const transpDocVal = onlyDigits(order.frete?.transportadora?.documento);
    if (freteMod === 1 && transpDocVal.length === 14) {
      warnings.push(
        'FOB: informe o CPF do motorista no transportador (como no eFácil). CNPJ de transportadora nesta modalidade costuma ser rejeitado pela SEFAZ/NotaAs.'
      );
    }

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
    config: FiscalConfig,
    opts?: NfeEmitOpts
  ): NotaAsCriarNFePayload {
    const isDevolucao = Boolean(opts?.devolucao?.chaveAcesso);
    const isTransferencia = Boolean(opts?.transferencia) && !isDevolucao;
    const isInterestadual = customer.state && customer.state !== (config.ufEmitente || COMPANY_INFO.state);
    const cfopVenda = isInterestadual
      ? (config.cfopPadraoInterestadual || '6101')
      : (config.cfopPadraoEstadual || '5101');
    const cfopPadrao = isDevolucao
      ? (isInterestadual ? '6202' : '5202')
      : isTransferencia
        ? (isInterestadual
            ? (config.cfopTransferenciaInterestadual || '6152')
            : (config.cfopTransferenciaEstadual || '5152'))
        : cfopVenda;
    const docClean = onlyDigits(customer.document);
    const isPF = docClean.length === 11;
    const ibgeDigits = onlyDigits(customer.ibgeCode);
    const zipDigits = onlyDigits(customer.zipCode);
    const indicadorIE = customer.isentoIE ? 2 : (customer.ie ? 1 : 9);

    // Endereço seguro e resistente a falhas
    const destCity = (customer.city || '').trim() || (config.cidadeEmitente || 'Santarém');
    const destUf = (customer.state || '').trim().toUpperCase() || (config.ufEmitente || 'PA');
    const safeIbge = (ibgeDigits.length === 7) 
      ? Number(ibgeDigits) 
      : (destCity.toLowerCase().includes('santar') ? 1506807 : 1506807);
    const safeCep = zipDigits.length === 8 ? zipDigits : (config.cepEmitente ? onlyDigits(config.cepEmitente) : '68000000');
    const safeStreet = (customer.street || '').trim() || 'Zona Rural / Rodovia';
    const safeNeighborhood = (customer.neighborhood || '').trim() || 'Zona Rural';
    const safeNumber = (customer.number || '').trim() || 'SN';

    const dest: NotaAsDestinatario = {
      nome: (customer.name || '').trim(),
      endereco: {
        logradouro: safeStreet,
        numero: safeNumber,
        bairro: safeNeighborhood,
        codigoMunicipio: safeIbge,
        cidade: destCity,
        uf: destUf,
        cep: safeCep,
      }
    };

    if (isPF) dest.cpf = docClean;
    else dest.cnpj = docClean;
    if (customer.email) dest.email = customer.email;
    dest.indicadorIE = indicadorIE;
    if (indicadorIE === 1 && customer.ie) {
      dest.ie = onlyDigits(customer.ie);
    }

    const cstIcmsPadrao = (config.cstIcmsPadrao || '40').trim();
    const items: NotaAsItemPayload[] = (order.items || []).map((it, idx) => {
      const cleanNcm = onlyDigits(String(it.ncm ?? ''));
      const safeNcm = cleanNcm.length === 8 ? cleanNcm : '25171000'; // Calcário agrícola padrão
      const cleanCfop = onlyDigits(String(it.cfop ?? ''));
      const safeCfop = (isDevolucao || isTransferencia) 
        ? onlyDigits(String(cfopPadrao ?? '')) 
        : (cleanCfop.length === 4 ? cleanCfop : onlyDigits(String(cfopPadrao ?? '')));

      // Prioridade: CST/CSOSN definido no item/produto -> Padrão configurado
      const itemCst = String(it.cst || it.csosn || cstIcmsPadrao).trim();

      const row: NotaAsItemPayload = {
        descricao: it.productName || 'Calcário Agrícola Corretivo',
        codigo: it.productCode || `CALC-${idx + 1}`,
        ncm: safeNcm,
        cfop: safeCfop,
        quantidade: it.quantity > 0 ? it.quantity : 1,
        valorUnitario: it.unitPrice > 0 ? it.unitPrice : it.total,
        valorTotal: it.total,
        unidade: it.unit || 'TON',
        cst: itemCst,
        aliquotaPis: it.aliquotaPis !== undefined ? it.aliquotaPis : (config.aliquotaPis ?? 0),
        aliquotaCofins: it.aliquotaCofins !== undefined ? it.aliquotaCofins : (config.aliquotaCofins ?? 0),
      };

      // Alíquota de ICMS se for tributada
      if (itemCst === '00' || itemCst === '10' || itemCst === '20' || itemCst === '90') {
        const aliq = it.aliquotaIcms !== undefined ? it.aliquotaIcms : config.aliquotaIcmsPadrao;
        if (aliq != null) row.aliquotaIcms = aliq;
      }

      if (isDevolucao && opts?.devolucao?.chaveAcesso) {
        row.nfeReferenciada = {
          chaveAcesso: onlyDigits(opts.devolucao.chaveAcesso),
          nItem: opts.devolucao.nItem || idx + 1
        };
      }
      const infAdProd = String(it.infAdProd || '').trim().slice(0, INF_ADPROD_MAX);
      if (infAdProd) row.infAdProd = infAdProd;
      return row;
    });

    const semPagamento = isDevolucao || isTransferencia || Boolean(opts?.semPagamento) || Boolean(order.withoutFinance);
    const tipoPagamento = semPagamento
      ? '90'
      : (order.paymentMethod === 'PIX' ? '17' : order.paymentMethod === 'Boleto' ? '15' : '01');

    // ---- Frete / transporte (modFrete SEFAZ: 9 sem frete · 0 CIF remetente · 1 FOB destinatário · 2 terceiros · 3/4 próprio) ----
    const freteModalidadeRaw = order.frete?.modalidade ?? (order.shipping && !semPagamento ? 0 : 9);
    const freteModalidade = Number(freteModalidadeRaw) as 0 | 1 | 2 | 3 | 4 | 9;
    const freteValorRaw = order.frete?.valor ?? order.shipping ?? 0;
    const freteValor = Math.max(0, Number(freteValorRaw) || 0);
    const hasFreteCobrado = freteValor > 0 && !semPagamento && freteModalidade !== 9;

    const transporte: NotaAsTransporte = { modalidadeFrete: semPagamento ? 9 : freteModalidade };
    const transp = order.frete?.transportadora;
    const effectiveModFrete = semPagamento ? 9 : freteModalidade;
    const transpDocDigits = onlyDigits(transp?.documento);
    if (
      modFreteAllowsGrupoTransportador(effectiveModFrete, transpDocDigits) &&
      transp &&
      (transp.documento || transp.nome || transp.rntrc)
    ) {
      transporte.transportadora = {
        ...(transp.documento ? { documento: onlyDigits(transp.documento) } : {}),
        ...(transp.nome?.trim() ? { nome: transp.nome.trim() } : {}),
        ...(transp.ie?.trim() ? { ie: onlyDigits(transp.ie) } : {}),
        ...(transp.endereco?.trim() ? { endereco: transp.endereco.trim() } : {}),
        ...(transp.cidade?.trim() ? { cidade: transp.cidade.trim() } : {}),
        ...(transp.uf?.trim() ? { uf: transp.uf.trim().toUpperCase() } : {}),
        ...(transp.rntrc?.trim() ? { rntrc: transp.rntrc.trim() } : {}),
      };
    }
    const veic = order.frete?.veiculo;
    if (veic && (veic.placa || veic.rntrc)) {
      transporte.veiculo = {
        ...(veic.placa?.trim() ? { placa: veic.placa.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') } : {}),
        ...(veic.uf?.trim() ? { uf: veic.uf.trim().toUpperCase() } : {}),
        ...(veic.rntrc?.trim() ? { rntrc: veic.rntrc.trim() } : {}),
      };
    }
    const vol = order.frete?.volumes;
    if (vol && ((vol.quantidade || 0) > 0 || (vol.pesoBruto || 0) > 0 || (vol.pesoLiquido || 0) > 0 || vol.especie?.trim())) {
      // Sempre envia quantidade inteira ≥ 1: omitir qVol (tag vazia) ou mandar decimal (ex.: 8.5 t) gera cStat 225.
      transporte.volumes = [{
        quantidade: nfeQVol(vol.quantidade),
        ...(vol.especie?.trim() ? { especie: vol.especie.trim().toUpperCase() } : {}),
        ...(vol.marca?.trim() ? { marca: vol.marca.trim() } : {}),
        ...(vol.pesoLiquido ? { pesoLiquido: Number(vol.pesoLiquido) } : {}),
        ...(vol.pesoBruto ? { pesoBruto: Number(vol.pesoBruto) } : {}),
      }];
      if (vol.pesoLiquido) transporte.pesoLiquido = Number(vol.pesoLiquido);
      if (vol.pesoBruto) transporte.pesoBruto = Number(vol.pesoBruto);
    }

    // Montar observações fiscais e complementares da nota
    const freteInfParts: string[] = [];
    if (!semPagamento && freteModalidade !== 9) {
      const modLabel = freteModalidade === 0 ? 'CIF' : freteModalidade === 1 ? 'FOB' : `modFrete ${freteModalidade}`;
      freteInfParts.push(
        hasFreteCobrado
          ? `Frete ${modLabel} R$ ${freteValor.toFixed(2)} incluso no total da nota`
          : `Frete ${modLabel} sem valor cobrado na nota`
      );
      if (transp?.nome?.trim()) freteInfParts.push(`Transportadora: ${transp.nome.trim()}`);
      if (veic?.placa?.trim()) freteInfParts.push(`Placa: ${veic.placa.trim().toUpperCase()}`);
    }

    const carregamentoParts: string[] = [
      opts?.carregamento?.pedidoExterno ? `Ref. Pedido Externo: ${opts.carregamento.pedidoExterno}` : '',
      opts?.carregamento?.ticketPesagem ? `Ticket Balança: ${opts.carregamento.ticketPesagem}` : '',
      opts?.carregamento?.placa ? `Veículo/Placa: ${opts.carregamento.placa}` : '',
      opts?.carregamento?.motorista ? `Motorista: ${opts.carregamento.motorista}` : '',
    ].filter(Boolean);

    // infCpl: texto do modal ou cláusulas do produto. NFA avulsa não recebe Pedido/NFA/disclaimer.
    const isAvulsaNote = Boolean(order.isAvulsa) || (order.nfeReferenciaExterna || '').includes('#AV#');
    const infCpl = buildNfeInfCpl({
      nfeInfCpl: order.nfeInfCpl,
      observacoesFiscaisPadrao: config.observacoesFiscaisPadrao,
      items: order.items,
      extras: [
        ...carregamentoParts,
        ...(isAvulsaNote
          ? []
          : [
              ...freteInfParts,
              order.reference ? `Pedido: ${order.reference}` : '',
              isDevolucao ? `Devolucao da NF-e ${opts?.devolucao?.chaveAcesso}` : '',
              isTransferencia ? 'Operacao de transferencia de estoque entre estabelecimentos' : ''
            ])
      ]
    });

    const payload: NotaAsCriarNFePayload = {
      modelo: 55,
      naturezaOperacao: isDevolucao
        ? 'Devolucao de mercadoria'
        : isTransferencia
          ? 'Transferencia de producao do estabelecimento'
          : (order.nfeNaturezaOperacao || config.naturezaOperacaoPadrao || 'Venda de producao do estabelecimento'),
      dest,
      items,
      pagamentos: [{ tipoPagamento, valor: semPagamento ? 0 : order.total }],
      transporte,
      tipoOperacao: 1,
      finalidade: isDevolucao ? 4 : 1,
      consumidorFinal: isTransferencia ? 0 : (isPF ? 1 : 0),
      presencaComprador: 1,
      infCpl: infCpl,
      referenciaExterna: order.nfeReferenciaExterna || order.reference || `ORDER-${order.id}`
    };

    if (hasFreteCobrado) payload.valorFrete = freteValor;
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
    companyId?: string,
    opts?: NfeEmitOpts
  ): Promise<EmitirNFeResult> {
    const resolvedCompanyId = companyId || order.companyId;
    const invoiceRequestId = `inv_req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const config = overrideConfig || (await this.getConfig(resolvedCompanyId));

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
          const updatedCustomer = { ...customer, ibgeCode: digits, companyId: persistCompanyId };
          await db.upsert('customers', persistCompanyId, updatedCustomer);
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

    const payload = this.montarPayloadNotaAs(order, dest, config, opts);
    const nfeNumero = (config.proxNumeroNFe || 1042).toString();
    const serie = config.serieNFe || '1';
    const apiKey = (config.apiKey || '').trim();
    const isApiMode = true; // Sempre modo de transmissão real para a SEFAZ
    const provider = config.apiProvider || 'notaas';
    const baseUrl = (config.apiBaseUrl || NOTAAS_API_BASE_URL).replace(/\/$/, '');
    const referenciaPedido = order.reference || `ORDER-${order.id}`;

    console.group(`🚀 [EMISSÃO NF-e API] [ID: ${invoiceRequestId}] Enviando para SEFAZ via API Fiscal (${provider.toUpperCase()})`);
    console.info('🆔 Trace Request ID:', invoiceRequestId);
    console.info('📌 Referência do Pedido:', order.reference);
    console.info('🌐 Ambiente SEFAZ:', config.environment.toUpperCase());
    console.info('🔑 Chave de API:', apiKey ? `${apiKey.substring(0, 8)}...` : 'NÃO INFORMADA');
    console.info('📍 URL Base da API:', baseUrl);

    console.group(`🔎 Mapeamento Completo do Schema [${invoiceRequestId}]`);
    console.info('👤 [DEST]:', payload.dest);
    console.info('📦 [ITEMS] (' + payload.items.length + ' item(ns)):', payload.items);
    console.info('💳 [PAGAMENTOS]:', payload.pagamentos);
    console.info('📄 [PAYLOAD COMPLETO EM JSON]:', JSON.stringify(payload, null, 2));
    console.groupEnd();
    console.groupEnd();

    if (!apiKey) {
      console.error(`❌ [EMISSÃO NF-e API] [${invoiceRequestId}] Chave de API não configurada!`);
      return {
        success: false,
        nfeStatus: 'rejeitada',
        nfeErro: 'Chave de API não informada! Insira sua Project Key (iniciada com "ntaas_") nas Configurações Fiscais para transmitir à SEFAZ.',
        rawResponse: { invoiceRequestId, error: 'API Key missing' }
      };
    }

    // 1. Tentar via Firebase Cloud Functions se configurado
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
          await this.saveConfig({ ...config, proxNumeroNFe: nextNum }, resolvedCompanyId);

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
        console.warn(`⚠️ [${invoiceRequestId}] Cloud Function não respondeu, utilizando Proxy Backend Local:`, fnErr.message);
      }
    }

    // 2. Emissão via Proxy Backend Server-to-Server (/api/nfe/emitir)
    try {
      console.info(`🛡️ [${invoiceRequestId}] Transmitindo NF-e via Proxy Backend Server-to-Server (/api/nfe/emitir)...`);
      const proxied = await fiscalApiFetch('/api/nfe/emitir', {
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

      console.group(`📡 [EMISSÃO NF-e API] [${invoiceRequestId}] Resposta Recebida via Proxy (/api/nfe/emitir)`);

      if (proxied.ok && proxied.isJson) {
        const data = proxied.data?.data || proxied.data || {};
        console.info(`✅ [SUCESSO HTTP ${proxied.status}] [${invoiceRequestId}]`, data);
        console.groupEnd();

        const nextNum = parseInt(nfeNumero, 10) + 1;
        await this.saveConfig({ ...config, proxNumeroNFe: nextNum }, resolvedCompanyId);

        const chaveAcesso = data.chaveAcesso || data.chave || data.nfeKey || data.chave_acesso || data.chaveNFe || '';
        const statusRetornado = resolveNfeStatus(data.status, proxied.status, chaveAcesso);
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
          rawResponse: { invoiceRequestId, viaServerProxy: true, ...data }
        };
      } else {
        const errData = proxied.data || {};
        console.error(`❌ [REJEIÇÃO/ERRO HTTP ${proxied.status}] [${invoiceRequestId}]`, errData);
        console.groupEnd();

        let errMsg = errData.xMotivo || errData.message || errData.erro || errData.error || errData.motivo || errData.mensagem;
        if (Array.isArray(errData.erros) && errData.erros.length > 0) {
          errMsg = errData.erros.map((e: any) => `${e.campo ? e.campo + ': ' : ''}${e.mensagem || e.msg || e}`).join(' | ');
        }

        // Verificação de conflito/duplicidade (409) para recuperação automática
        if (proxied.status === 409 || (errMsg && (errMsg.toLowerCase().includes('duplicidade') || errMsg.toLowerCase().includes('ja emitida') || errMsg.toLowerCase().includes('já existe')))) {
          console.info(`🔄 [IDEMPOTÊNCIA] [${invoiceRequestId}] Conflito/duplicidade detectada. Consultando por referência: ${referenciaPedido}`);
          const consultRes = await this.consultarPorReferencia(referenciaPedido, config);
          if (consultRes.success && consultRes.nfe) {
            console.info(`✅ [IDEMPOTÊNCIA RECUPERADA] Nota recuperada com sucesso!`, consultRes.nfe);
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
          errMsg = `Falha na API (${provider.toUpperCase()}) - HTTP ${proxied.status}`;
        }

        return {
          success: false,
          nfeStatus: 'rejeitada',
          nfeErro: errMsg.startsWith('[HTTP') ? errMsg : `[HTTP ${proxied.status}] ${errMsg}`,
          rawResponse: { invoiceRequestId, ...errData }
        };
      }
    } catch (proxyCatchErr: any) {
      console.error(`💥 [ERRO SERVIDOR PROXY] [${invoiceRequestId}]`, proxyCatchErr);
      return {
        success: false,
        nfeStatus: 'rejeitada',
        nfeErro: `Erro de comunicação com o serviço interno do ERP (/api/nfe/emitir): ${proxyCatchErr.message || 'Falha de conexão'}.`,
        rawResponse: { invoiceRequestId, error: proxyCatchErr.message }
      };
    }
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
      if (result.status && result.status !== 'processando' && result.status !== 'nao_emitida') {
        console.info(`🎉 [POLLING NF-e] Processamento finalizado! Status final: ${result.status.toUpperCase()}`);
        return result;
      }
      retries++;
      if (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else if (result.nfe) {
        return result;
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
  async emitirNFe(order: SaleOrder, customer: Customer, overrideConfig?: FiscalConfig, companyId?: string, opts?: NfeEmitOpts): Promise<EmitirNFeResult> {
    return this.criarNFe(order, customer, overrideConfig, companyId || order.companyId, opts);
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

    const config = overrideConfig || (await this.getConfig(overrideConfig?.companyId));
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
          provider: config.apiProvider || 'notaas',
          companyId: config.companyId
        })
      });

      if (!proxied.isJson) {
        return { success: false, status: 'nao_emitida', error: 'Proxy de consulta fiscal retornou resposta inválida.' };
      }

      if (proxied.ok) {
        return nfeFromStatusPayload(proxied.data, proxied.status);
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
    const config = overrideConfig || (await this.getConfig(overrideConfig?.companyId));
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
            provider: config.apiProvider || 'notaas',
            companyId: config.companyId
          })
        });
        if (proxied.ok && proxied.isJson) {
          const data = proxied.data?.data || proxied.data;
          const item = Array.isArray(data) ? data[0] : (data.items ? data.items[0] : data);
          if (item && (item.invoiceId || item.id || item.chaveAcesso || item.chave || item.status)) {
            return nfeFromStatusPayload(item, proxied.status);
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
    const config = overrideConfig || (await this.getConfig(overrideConfig?.companyId));
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

    const config = overrideConfig || (await this.getConfig(overrideConfig?.companyId));

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
            provider: config.apiProvider || 'notaas',
            companyId: config.companyId
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
   * Consulta a NotaAs/SEFAZ e devolve o pedido com status, chave, protocolo e links reais.
   */
  async sincronizarPedidoComSefaz(order: SaleOrder, overrideConfig?: FiscalConfig): Promise<SaleOrder> {
    const config = overrideConfig || (await this.getConfig(order.companyId || overrideConfig?.companyId));
    const id = (order.nfeId || '').trim();
    if (id) {
      const result = await this.consultarNFe(id, config);
      if (result.status !== 'nao_emitida' || result.nfe) {
        return mergeNfeConsulta(order, result);
      }
      if (result.error) {
        return { ...order, nfeErro: result.error };
      }
    }
    const ref = (order.nfeReferenciaExterna || order.reference || '').trim();
    if (ref) {
      const byRef = await this.consultarPorReferencia(ref, config);
      if (byRef.nfe || (byRef.status && byRef.status !== 'nao_emitida')) {
        return mergeNfeConsulta(order, byRef);
      }
      if (byRef.error && !id) {
        return { ...order, nfeErro: byRef.error };
      }
    }
    return order;
  },

  /** DANFE oficial (PDF binário) gerado pela NotaAs. Exige invoiceId e nota issued/cancelled. */
  async baixarDanfePdf(invoiceId: string, overrideConfig?: FiscalConfig): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
    if (!invoiceId) return { ok: false, error: 'NF-e sem invoiceId da NotaAs. Não é possível gerar o DANFE oficial.' };
    const config = overrideConfig || (await this.getConfig(overrideConfig?.companyId));
    try {
      const res = await fetch('/api/nfe/danfe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          nfeIdOrChave: invoiceId,
          apiKey: (config.apiKey || '').trim(),
          apiBaseUrl: config.apiBaseUrl || NOTAAS_API_BASE_URL,
          companyId: config.companyId || overrideConfig?.companyId,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/pdf') || contentType.includes('octet-stream')) {
        return { ok: true, blob: await res.blob() };
      }
      const data = await res.json().catch(() => ({}));
      return {
        ok: false,
        error: data.error || data.xMotivo || data.motivo || `Não foi possível obter o DANFE (HTTP ${res.status}).`,
      };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Falha de rede ao baixar o DANFE.' };
    }
  },

  async baixarXmlNFe(invoiceId: string, overrideConfig?: FiscalConfig, type: 'emission' | 'cancel' = 'emission'): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
    if (!invoiceId) return { ok: false, error: 'NF-e sem invoiceId da NotaAs.' };
    const config = overrideConfig || (await this.getConfig(overrideConfig?.companyId));
    try {
      const res = await fetch('/api/nfe/xml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          nfeIdOrChave: invoiceId,
          type,
          apiKey: (config.apiKey || '').trim(),
          apiBaseUrl: config.apiBaseUrl || NOTAAS_API_BASE_URL,
          companyId: config.companyId || overrideConfig?.companyId,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('xml') || contentType.includes('octet-stream')) {
        return { ok: true, blob: await res.blob() };
      }
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || data.message || `Não foi possível obter o XML (HTTP ${res.status}).` };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Falha de rede ao baixar o XML.' };
    }
  },

  /**
   * Obtém a URL de download ou visualização do DANFE PDF
   */
  async obterDanfePdfUrl(chaveOuId: string, overrideConfig?: FiscalConfig): Promise<string | null> {
    const consult = await this.consultarNFe(chaveOuId, overrideConfig);
    return consult.nfe?.pdfUrl || consult.nfe?.danfeUrl || null;
  },

  /**
   * Obtém o XML assinado da NF-e
   */
  async obterXmlNFe(chaveOuId: string, overrideConfig?: FiscalConfig): Promise<string | null> {
    const xml = await this.baixarXmlNFe(chaveOuId, overrideConfig);
    if (!xml.ok || !xml.blob) return null;
    return xml.blob.text();
  },

  /**
   * Gera o arquivo XML padrão NF-e 4.00 compatível com SEFAZ
   */
  gerarXml(order: SaleOrder, customer: Customer, config: FiscalConfig): string {
    const chave = order.nfeChave || this.generateMockChaveAcesso(config.cnpjEmitente, '15', order.nfeSerie || '1', order.nfeNumero || '1041');
    const freteModXml = Number(order.frete?.modalidade ?? (order.shipping ? 0 : 9));
    const freteValXml = freteModXml === 9 ? 0 : (Number(order.frete?.valor ?? order.shipping) || 0);
    const transpDoc = (order.frete?.transportadora?.documento || '').replace(/\D/g, '');
    const transpNome = order.frete?.transportadora?.nome || '';
    const transpBloco =
      modFreteAllowsGrupoTransportador(freteModXml, transpDoc) && (transpDoc || transpNome)
        ? `<transporta>${transpDoc.length === 11 ? `<CPF>${transpDoc}</CPF>` : `<CNPJ>${transpDoc}</CNPJ>`}<xNome>${transpNome}</xNome></transporta>`
        : '';
    const vol = order.frete?.volumes;
    const volBloco = vol && ((vol.quantidade || 0) > 0 || (vol.pesoBruto || 0) > 0 || (vol.pesoLiquido || 0) > 0)
      ? `<vol><qVol>${nfeQVol(vol.quantidade)}</qVol><esp>${vol.especie || 'GRANEL'}</esp><pesoL>${(vol.pesoLiquido || 0).toFixed(3)}</pesoL><pesoB>${(vol.pesoBruto || 0).toFixed(3)}</pesoB></vol>`
      : '';
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
          <xLgr>${config.logradouroEmitente || 'Rodovia Mineral BR-163, Km 42'}</xLgr>
          <nro>${config.numeroEmitente || 'S/N'}</nro>
          <xBairro>${config.bairroEmitente || 'Distrito Industrial'}</xBairro>
          <cMun>${config.ibgeEmitente || '1506807'}</cMun>
          <xMun>${config.cidadeEmitente || 'Santarem'}</xMun>
          <UF>${config.ufEmitente || 'PA'}</UF>
          <CEP>${(config.cepEmitente || '68000000').replace(/\D/g, '')}</CEP>
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
          <vFrete>${freteValXml.toFixed(2)}</vFrete>
          <vDesc>${(order.discount || 0).toFixed(2)}</vDesc>
          <vNF>${order.total.toFixed(2)}</vNF>
        </ICMSTot>
      </total>
      <transp>
        <modFrete>${freteModXml}</modFrete>
        ${transpBloco}
        ${volBloco}
      </transp>
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
