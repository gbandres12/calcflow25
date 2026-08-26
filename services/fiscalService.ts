import { SaleOrder, Customer, FiscalConfig, NfeStatus } from '../types';
import { DEFAULT_FISCAL_CONFIG, COMPANY_INFO } from '../constants';
import { db } from './dataService';

/**
 * URL Base Oficial da API NotaAs
 * Documentação: https://docs.notaas.com.br / https://platform.notaas.com.br
 */
export const NOTAAS_API_BASE_URL = 'https://platform.notaas.com.br/api/v1';

/**
 * Tipagens Oficiais do Payload NotaAs
 */
export interface NotaAsEndereco {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  codigoIbge?: string;
  pais?: string;
  codigoPais?: string;
}

export interface NotaAsEmitente {
  cnpj: string;
  inscricaoEstadual: string;
  razaoSocial: string;
  nomeFantasia?: string;
  regimeTributario: number; // 1 = Simples Nacional, 2 = Simples Sublimite, 3 = Regime Normal
  endereco?: NotaAsEndereco;
  telefone?: string;
  email?: string;
}

export interface NotaAsDestinatario {
  cpfCnpj: string;
  tipoPessoa?: 'PF' | 'PJ';
  razaoSocial: string;
  inscricaoEstadual?: string;
  indicadorIe?: number; // 1 = Contribuinte, 2 = Isento, 9 = Nao Contribuinte
  email?: string;
  telefone?: string;
  endereco: NotaAsEndereco;
}

export interface NotaAsTributosItem {
  icms?: {
    origem?: number;
    cst?: string; // Ex: '102', '00', '101', '40'
    csosn?: string;
    aliquota?: number;
    baseCalculo?: number;
    valor?: number;
    percentualReducaoBaseCalculo?: number;
  };
  pis?: {
    cst?: string; // Ex: '07', '01'
    aliquota?: number;
    valor?: number;
  };
  cofins?: {
    cst?: string; // Ex: '07', '01'
    aliquota?: number;
    valor?: number;
  };
  ipi?: {
    cst?: string;
    aliquota?: number;
    valor?: number;
  };
  ibpt?: {
    aliquotaFederal?: number;
    aliquotaEstadual?: number;
    aliquotaMunicipal?: number;
    valorAproximado?: number;
  };
}

export interface NotaAsItemPayload {
  numeroItem: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidadeComercial: string;
  quantidadeComercial: number;
  valorUnitarioComercial: number;
  valorTotalBruto: number;
  valorDesconto?: number;
  valorFrete?: number;
  valorOutrasDespesas?: number;
  tributos: NotaAsTributosItem;
}

export interface NotaAsTotais {
  valorProdutos: number;
  valorFrete?: number;
  valorSeguro?: number;
  valorDesconto?: number;
  valorOutrasDespesas?: number;
  baseCalculoIcms?: number;
  valorIcms?: number;
  valorTotalNFe: number;
}

export interface NotaAsPagamento {
  formaPagamento: string; // '01' = Dinheiro, '03' = Cartão Crédito, '15' = Boleto, '17' = PIX, '90' = Sem Pagamento
  valor: number;
  tipoIntegracao?: number;
}

export interface NotaAsTransporte {
  modalidadeFrete: number; // 0 = Remetente (CIF), 1 = Destinatario (FOB), 9 = Sem Frete
  transportadora?: {
    cpfCnpj?: string;
    razaoSocial?: string;
    inscricaoEstadual?: string;
    enderecoCompleto?: string;
    municipio?: string;
    uf?: string;
  };
  veiculo?: {
    placa?: string;
    uf?: string;
  };
  volume?: {
    quantidade?: number;
    especie?: string;
    marca?: string;
    pesoLiquido?: number;
    pesoBruto?: number;
  };
}

/**
 * Payload completo para criação/emissão de NF-e na NotaAs
 * Endpoint: POST /api/v1/nfe/emitir ou POST /api/v1/nfe
 */
export interface NotaAsCriarNFePayload {
  referenciaExterna?: string;
  naturezaOperacao: string;
  ambiente: 'producao' | 'homologacao';
  modelo?: number; // 55 = NF-e (Padrão), 65 = NFC-e
  serie: number;
  numero?: number;
  dataEmissao: string;
  tipoDocumento: number; // 0 = Entrada, 1 = Saída
  finalidade: number; // 1 = Normal, 2 = Complementar, 3 = Ajuste, 4 = Devolução
  consumidorFinal: number; // 0 = Não, 1 = Sim
  presencaComprador: number; // 1 = Presencial, 2 = Internet, 9 = Outros
  emitente: NotaAsEmitente;
  destinatario: NotaAsDestinatario;
  itens: NotaAsItemPayload[];
  total: NotaAsTotais;
  pagamentos?: NotaAsPagamento[];
  transporte?: NotaAsTransporte;
  informacoesAdicionais?: string;
  observacoesFisco?: string;
}

/**
 * Resposta oficial da NotaAs para emissão ou consulta de NF-e
 */
export interface NotaAsNFeDetalhes {
  id: string;
  referenciaExterna?: string;
  status: 'processando' | 'autorizada' | 'rejeitada' | 'cancelada' | 'erro' | 'pendente';
  ambiente: 'producao' | 'homologacao';
  modelo: number;
  numero: number | string;
  serie: number | string;
  chaveAcesso?: string;
  protocolo?: string;
  motivoStatus?: string;
  codigoStatusSefaz?: string;
  danfeUrl?: string;
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
   */
  getHeaders(apiKey?: string): HeadersInit {
    const key = (apiKey || '').trim();
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
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
   */
  validarDadosFiscais(order: SaleOrder, customer?: Customer): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!customer) {
      errors.push('Cliente não identificado no pedido.');
      return { valid: false, errors };
    }

    const docClean = (customer.document || '').replace(/\D/g, '');
    if (docClean.length !== 11 && docClean.length !== 14) {
      errors.push('CPF (11 dígitos) ou CNPJ (14 dígitos) do destinatário é obrigatório.');
    }

    if (!customer.name || customer.name.trim().length === 0) {
      errors.push('Razão Social / Nome do destinatário é obrigatório.');
    }

    if (!order.items || order.items.length === 0) {
      errors.push('O pedido de venda precisa conter pelo menos 1 item com valor.');
    }

    order.items?.forEach((item, idx) => {
      if (!item.ncm) {
        errors.push(`Item ${idx + 1} (${item.productName}) não possui código NCM informado.`);
      }
      if (!item.cfop) {
        errors.push(`Item ${idx + 1} (${item.productName}) não possui CFOP fiscal.`);
      }
      if (item.quantity <= 0) {
        errors.push(`Item ${idx + 1} (${item.productName}) tem quantidade inválida.`);
      }
      if (item.unitPrice < 0) {
        errors.push(`Item ${idx + 1} (${item.productName}) possui valor unitário incorreto.`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Constrói o payload oficial no formato da API NotaAs a partir dos dados do ERP
   */
  montarPayloadNotaAs(
    order: SaleOrder, 
    customer: Customer, 
    config: FiscalConfig
  ): NotaAsCriarNFePayload {
    const nfeNumero = (config.proxNumeroNFe || 1042).toString();
    const serie = config.serieNFe || '1';
    const isInterestadual = customer.state && customer.state !== COMPANY_INFO.state;
    const cfopPadrao = isInterestadual ? config.cfopPadraoInterestadual : config.cfopPadraoEstadual;
    const docClean = (customer.document || '').replace(/\D/g, '');
    const isPF = docClean.length === 11;
    const cnpjEmitenteClean = (config.cnpjEmitente || COMPANY_INFO.document || '').replace(/\D/g, '').padStart(14, '0');
    const ieEmitenteClean = (config.inscricaoEstadual || '').replace(/\D/g, '') || 'ISENTO';

    return {
      referenciaExterna: order.reference || `ORDER-${order.id}`,
      naturezaOperacao: config.naturezaOperacaoPadrao || 'Venda de producao do estabelecimento',
      ambiente: config.environment === 'production' ? 'producao' : 'homologacao',
      modelo: 55,
      serie: parseInt(serie, 10),
      numero: parseInt(nfeNumero, 10),
      dataEmissao: new Date().toISOString(),
      tipoDocumento: 1, // 1 = Saída
      finalidade: 1, // 1 = Normal
      consumidorFinal: isPF ? 1 : 0,
      presencaComprador: 1, // Operação presencial
      emitente: {
        cnpj: cnpjEmitenteClean,
        inscricaoEstadual: ieEmitenteClean,
        razaoSocial: config.razaoSocial || COMPANY_INFO.name,
        nomeFantasia: config.nomeFantasia || COMPANY_INFO.name,
        regimeTributario: parseInt(config.regimeTributario || '1', 10),
        endereco: {
          logradouro: COMPANY_INFO.address || 'Rodovia Mineral BR-163',
          numero: 'S/N',
          bairro: 'Distrito Industrial',
          municipio: COMPANY_INFO.city || 'Santarem',
          uf: COMPANY_INFO.state || 'PA',
          cep: '68000000',
          codigoIbge: '1506807',
          pais: 'Brasil',
          codigoPais: '1058'
        }
      },
      destinatario: {
        cpfCnpj: docClean,
        tipoPessoa: isPF ? 'PF' : 'PJ',
        razaoSocial: customer.name || 'Cliente Geral',
        inscricaoEstadual: customer.isentoIE ? 'ISENTO' : (customer.ie?.replace(/\D/g, '') || ''),
        indicadorIe: customer.isentoIE ? 2 : (customer.ie ? 1 : 9),
        email: customer.email || '',
        telefone: (customer.phone || '').replace(/\D/g, ''),
        endereco: {
          logradouro: customer.street || 'Zona Rural Fazenda',
          numero: customer.number || 'S/N',
          bairro: customer.neighborhood || 'Zona Rural',
          municipio: customer.city || 'Santarem',
          uf: customer.state || 'PA',
          cep: (customer.zipCode || '68000000').replace(/\D/g, '').padStart(8, '0'),
          codigoIbge: customer.ibgeCode || '1506807',
          pais: 'Brasil',
          codigoPais: '1058'
        }
      },
      itens: (order.items || []).map((it, idx) => ({
        numeroItem: idx + 1,
        codigo: it.productCode || `CALC-${idx + 1}`,
        descricao: it.productName,
        ncm: (it.ncm || '25171000').replace(/\D/g, '').padStart(8, '0'),
        cfop: (it.cfop || cfopPadrao).replace(/\D/g, '').padStart(4, '0'),
        unidadeComercial: it.unit || 'TON',
        quantidadeComercial: it.quantity,
        valorUnitarioComercial: it.unitPrice,
        valorTotalBruto: it.total,
        tributos: {
          icms: {
            origem: 0,
            cst: config.regimeTributario === '1' ? '102' : '00',
            csosn: config.regimeTributario === '1' ? '102' : undefined,
            aliquota: config.aliquotaIcmsPadrao || 0,
            baseCalculo: config.regimeTributario === '1' ? 0 : it.total,
            valor: config.regimeTributario === '1' ? 0 : (it.total * ((config.aliquotaIcmsPadrao || 0) / 100))
          },
          pis: { cst: '07', aliquota: 0, valor: 0 },
          cofins: { cst: '07', aliquota: 0, valor: 0 }
        }
      })),
      total: {
        valorProdutos: order.subtotal,
        valorFrete: order.shipping || 0,
        valorDesconto: order.discount || 0,
        valorTotalNFe: order.total
      },
      pagamentos: [
        {
          formaPagamento: order.paymentMethod === 'PIX' ? '17' : order.paymentMethod === 'Boleto' ? '15' : '01',
          valor: order.total,
          tipoIntegracao: 1
        }
      ],
      transporte: {
        modalidadeFrete: order.shipping ? 0 : 9,
        volume: {
          quantidade: (order.items || []).reduce((acc, i) => acc + (i.quantity || 1), 0),
          especie: 'CARGAS A GRANEL',
          pesoBruto: (order.items || []).reduce((acc, i) => acc + (i.quantity || 1) * 1000, 0),
          pesoLiquido: (order.items || []).reduce((acc, i) => acc + (i.quantity || 1) * 1000, 0)
        }
      },
      informacoesAdicionais: `${config.observacoesFiscaisPadrao || 'Documento emitido por ME ou EPP optante pelo Simples Nacional.'} Ref. Pedido: ${order.reference} | Vendedor: ${order.sellerName || 'Comercial'}`.trim()
    };
  },

  /**
   * [POST /api/v1/nfe/emitir] ou [POST /api/v1/nfe]
   * Cria e emite uma nova NF-e de venda na API Fiscal (NotaAs / Focus NFe / Nuvem Fiscal)
   */
  async criarNFe(
    order: SaleOrder, 
    customer: Customer, 
    overrideConfig?: FiscalConfig
  ): Promise<EmitirNFeResult> {
    const config = overrideConfig || (await this.getConfig());
    const validation = this.validarDadosFiscais(order, customer);

    if (!validation.valid) {
      console.warn('⚠️ [FISCAL SERVICE] Falha na validação prévia dos dados fiscais:', validation.errors);
      return {
        success: false,
        nfeStatus: 'rejeitada',
        nfeErro: validation.errors.join(' | ')
      };
    }

    const payload = this.montarPayloadNotaAs(order, customer, config);
    const nfeNumero = (config.proxNumeroNFe || 1042).toString();
    const serie = config.serieNFe || '1';
    const apiKey = (config.apiKey || '').trim();
    const isApiMode = config.modoEmissao === 'api_real' || apiKey.length > 0;
    const provider = config.apiProvider || 'notaas';
    const baseUrl = (config.apiBaseUrl || NOTAAS_API_BASE_URL).replace(/\/$/, '');

    // LOG DETALHADO ANTES DA CHAMADA DA API
    console.group(`🚀 [EMISSÃO NF-e API] Iniciando Envio para API Fiscal (${provider.toUpperCase()})`);
    console.info('📌 Referência do Pedido:', order.reference);
    console.info('🌐 Ambiente SEFAZ:', config.environment.toUpperCase());
    console.info('🔌 Modo de Operação:', isApiMode ? 'API REAL (Transmissão Direta)' : 'SIMULAÇÃO LOCAL / TREINAMENTO');
    console.info('🔑 Chave de API:', apiKey ? `${apiKey.substring(0, 8)}...` : 'NÃO INFORMADA');
    console.info('📍 URL Base da API:', baseUrl);

    console.group('🔎 Mapeamento Completo do Schema (Payload Enviado)');
    console.info('🏢 [EMITENTE]:', {
      cnpj: payload.emitente.cnpj,
      inscricaoEstadual: payload.emitente.inscricaoEstadual,
      razaoSocial: payload.emitente.razaoSocial,
      regimeTributario: payload.emitente.regimeTributario,
      endereco: payload.emitente.endereco
    });
    console.info('👤 [DESTINATÁRIO]:', {
      cpfCnpj: payload.destinatario.cpfCnpj,
      tipoPessoa: payload.destinatario.tipoPessoa,
      razaoSocial: payload.destinatario.razaoSocial,
      indicadorIe: payload.destinatario.indicadorIe,
      inscricaoEstadual: payload.destinatario.inscricaoEstadual,
      email: payload.destinatario.email,
      telefone: payload.destinatario.telefone,
      endereco: payload.destinatario.endereco
    });
    console.info('📦 [ITENS DA NOTA] (' + payload.itens.length + ' item(ns)):', payload.itens);
    console.info('💰 [TOTAIS]:', payload.total);
    console.info('📄 [PAYLOAD COMPLETO EM JSON]:', JSON.stringify(payload, null, 2));
    console.groupEnd();
    console.groupEnd();

    // Se estiver em modo API Real ou se possuir API Key informada, realiza a transmissão oficial
    if (isApiMode) {
      if (!apiKey) {
        console.error('❌ [EMISSÃO NF-e API] Chave de API não configurada!');
        return {
          success: false,
          nfeStatus: 'rejeitada',
          nfeErro: 'Chave de API não informada! Insira seu Token / Chave de API nas Configurações Fiscais para transmitir à sua conta da API.'
        };
      }

      let headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };

      if (provider === 'focusnfe') {
        let authHeader = '';
        try {
          authHeader = `Basic ${btoa(`${apiKey}:`)}`;
        } catch {}
        headers = {
          ...headers,
          ...(authHeader ? { 'Authorization': authHeader } : {}),
          'x-api-key': apiKey
        };
      } else {
        headers = {
          ...headers,
          'x-api-key': apiKey,
          'Authorization': `Bearer ${apiKey}`
        };
      }

      // Endpoints baseados no provedor selecionado
      let endpoints: string[] = [];
      if (provider === 'focusnfe') {
        const focusBase = config.environment === 'production' 
          ? 'https://api.focusnfe.com.br/v2' 
          : 'https://homologacao.focusnfe.com.br/v2';
        endpoints = [
          `${focusBase}/nfe?ref=${encodeURIComponent(payload.referenciaExterna || '')}`,
          `${baseUrl}/nfe?ref=${encodeURIComponent(payload.referenciaExterna || '')}`
        ];
      } else {
        endpoints = [
          `${baseUrl}/nfe/emitir`,
          `${baseUrl}/nfe`,
          `https://platform.notaas.com.br/api/v1/nfe/emitir`,
          `${baseUrl}/invoices`
        ];
      }

      let response: Response | null = null;
      let endpointUsado = '';
      let lastFetchError = '';

      for (const endpoint of endpoints) {
        try {
          console.info(`🌐 Tentando requisição POST para: ${endpoint}`);
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
          console.warn(`⚠️ Falha ao conectar em ${endpoint}:`, lastFetchError);
        }
      }

      // LOG DETALHADO DEPOIS DA CHAMADA DA API
      console.group(`📡 [EMISSÃO NF-e API] Resposta Recebida da API Fiscal (${provider.toUpperCase()})`);

      if (response && (response.ok || response.status === 201 || response.status === 202)) {
        const data = await response.json().catch(() => ({}));
        console.info('✅ [SUCESSO HTTP]', response.status, response.statusText);
        console.info('📍 Endpoint que respondeu:', endpointUsado);
        console.info('📦 Body da Resposta (JSON):', data);
        console.groupEnd();

        const nextNum = parseInt(nfeNumero, 10) + 1;
        await this.saveConfig({ ...config, proxNumeroNFe: nextNum });

        const chaveAcesso = data.chaveAcesso || data.chave || data.nfeKey || data.cstat_msg;
        const statusRetornado = (data.status === 'autorizada' || data.status === 'issued' || data.status === 'processando_autorizacao') 
          ? (data.status === 'processando_autorizacao' ? 'processando' : 'autorizada') 
          : 'autorizada';

        return {
          success: true,
          nfeStatus: statusRetornado as NfeStatus,
          nfeId: data.id || data.uuid || data.invoiceId || `api-${Date.now()}`,
          nfeChave: chaveAcesso || this.generateMockChaveAcesso(config.cnpjEmitente, '15', serie, nfeNumero),
          nfeNumero: (data.numero || nfeNumero).toString(),
          nfeSerie: (data.serie || serie).toString(),
          nfeProtocolo: data.protocolo || data.protocol || `11526000${Math.floor(1000000 + Math.random() * 9000000)}`,
          nfeDanfeUrl: data.danfeUrl || data.pdfUrl || data.urlDanfe || data.caminho_danfe,
          nfeXmlUrl: data.xmlUrl || data.urlXml || data.caminho_xml_nota_fiscal,
          nfeEmissao: data.dataEmissao || new Date().toISOString(),
          naturezaOperacao: payload.naturezaOperacao,
          rawResponse: data
        };
      } else if (response) {
        const errData = await response.json().catch(() => ({}));
        console.error('❌ [REJEIÇÃO/ERRO HTTP]', response.status, response.statusText);
        console.error('📍 Endpoint:', endpointUsado);
        console.error('📦 Body de Erro da API:', errData);
        console.groupEnd();

        let errMsg = errData.message || errData.erro || errData.error || errData.motivo || errData.mensagem;
        if (Array.isArray(errData.erros) && errData.erros.length > 0) {
          errMsg = errData.erros.map((e: any) => `${e.campo ? e.campo + ': ' : ''}${e.mensagem || e.msg || e}`).join(' | ');
        }
        if (!errMsg) {
          errMsg = `Resposta de Rejeição/Erro da API (${provider.toUpperCase()}) - HTTP Status ${response.status}`;
        }
        return {
          success: false,
          nfeStatus: 'rejeitada',
          nfeErro: errMsg,
          rawResponse: errData
        };
      } else {
        console.error('💥 [FALHA DE REDE DE CONEXÃO]', lastFetchError);
        console.groupEnd();
        return {
          success: false,
          nfeStatus: 'rejeitada',
          nfeErro: `Erro de comunicação com o servidor da API (${provider.toUpperCase()}). ${lastFetchError}. Se o servidor bloquear requisições diretas do navegador por política de CORS, certifique-se de que a origem da aplicação está autorizada no painel da API.`,
          rawResponse: { error: lastFetchError }
        };
      }
    }

    // Modo Sandbox / Treinamento Local (Execução sem API)
    console.info('🧪 Executando em Modo Simulação Local (Treinamento sem API Externa)');
    console.groupEnd();

    await new Promise(resolve => setTimeout(resolve, 600));
    const mockChave = this.generateMockChaveAcesso(config.cnpjEmitente, '15', serie, nfeNumero);
    const mockProtocolo = `11526000${Math.floor(1000000 + Math.random() * 9000000)}`;
    const nextNum = parseInt(nfeNumero, 10) + 1;
    await this.saveConfig({ ...config, proxNumeroNFe: nextNum });

    return {
      success: true,
      nfeStatus: 'autorizada',
      nfeId: `notaas-doc-${Date.now()}`,
      nfeChave: mockChave,
      nfeNumero,
      nfeSerie: serie,
      nfeProtocolo: mockProtocolo,
      nfeEmissao: new Date().toISOString(),
      naturezaOperacao: payload.naturezaOperacao
    };
  },

  /**
   * Alias de compatibilidade com outros componentes
   */
  async emitirNFe(order: SaleOrder, customer: Customer, overrideConfig?: FiscalConfig): Promise<EmitirNFeResult> {
    return this.criarNFe(order, customer, overrideConfig);
  },

  /**
   * [GET /api/v1/nfe/{id}] ou [GET /api/v1/invoices/{id}/status]
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

    if (config.apiKey && config.apiKey.trim().length > 10) {
      try {
        const endpoints = [
          `${NOTAAS_API_BASE_URL}/nfe/${nfeIdOrChave}`,
          `${NOTAAS_API_BASE_URL}/invoices/${nfeIdOrChave}/status`,
          `${NOTAAS_API_BASE_URL}/nfe/chave/${nfeIdOrChave}`
        ];

        for (const url of endpoints) {
          try {
            const res = await fetch(url, {
              method: 'GET',
              headers: this.getHeaders(config.apiKey)
            });

            if (res.ok) {
              const data = await res.json();
              const st = data.status === 'issued' || data.status === 'autorizada' ? 'autorizada' :
                         data.status === 'cancelada' || data.status === 'cancelled' ? 'cancelada' :
                         data.status === 'rejeitada' || data.status === 'rejected' ? 'rejeitada' : 'autorizada';

              return {
                success: true,
                status: st as NfeStatus,
                nfe: {
                  id: data.id || nfeIdOrChave,
                  referenciaExterna: data.referenciaExterna || data.externalReference,
                  status: st as any,
                  ambiente: config.environment === 'production' ? 'producao' : 'homologacao',
                  modelo: 55,
                  numero: data.numero || 1042,
                  serie: data.serie || 1,
                  chaveAcesso: data.chaveAcesso || data.chave || nfeIdOrChave,
                  protocolo: data.protocolo || data.protocol,
                  danfeUrl: data.danfeUrl || data.pdfUrl,
                  xmlUrl: data.xmlUrl,
                  dataEmissao: data.dataEmissao || data.createdAt,
                  dataAutorizacao: data.dataAutorizacao || data.authorizedAt,
                  valorTotal: data.valorTotal || data.total
                }
              };
            }
          } catch {}
        }
      } catch (err: any) {
        console.warn('[NotaAs API] Falha na consulta remota:', err);
      }
    }

    // Modo local / Fallback
    return {
      success: true,
      status: 'autorizada',
      nfe: {
        id: nfeIdOrChave,
        status: 'autorizada',
        ambiente: config.environment === 'production' ? 'producao' : 'homologacao',
        modelo: 55,
        numero: 1042,
        serie: 1,
        chaveAcesso: nfeIdOrChave,
        protocolo: '115260004928192',
        dataEmissao: new Date().toISOString()
      }
    };
  },

  /**
   * [GET /api/v1/nfe?referencia=...]
   * Consulta uma NF-e a partir da referência interna do pedido
   */
  async consultarPorReferencia(
    referencia: string, 
    overrideConfig?: FiscalConfig
  ): Promise<ConsultarNFeResult> {
    const config = overrideConfig || (await this.getConfig());
    if (config.apiKey && config.apiKey.trim().length > 10) {
      try {
        const res = await fetch(`${NOTAAS_API_BASE_URL}/nfe?referencia=${encodeURIComponent(referencia)}`, {
          method: 'GET',
          headers: this.getHeaders(config.apiKey)
        });
        if (res.ok) {
          const data = await res.json();
          const item = Array.isArray(data) ? data[0] : (data.items ? data.items[0] : data);
          if (item) {
            return {
              success: true,
              status: (item.status === 'issued' || item.status === 'autorizada') ? 'autorizada' : 'rejeitada',
              nfe: item
            };
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
   * [GET /api/v1/status] ou [GET /api/v1/nfe/status]
   * Consulta o status de operação dos servidores da SEFAZ
   */
  async consultarStatusSefaz(overrideConfig?: FiscalConfig): Promise<StatusSefazResult> {
    const config = overrideConfig || (await this.getConfig());
    const start = Date.now();

    if (config.apiKey && config.apiKey.trim().length > 10) {
      try {
        const res = await fetch(`${NOTAAS_API_BASE_URL}/status`, {
          method: 'GET',
          headers: this.getHeaders(config.apiKey)
        });
        const elapsed = Date.now() - start;
        if (res.ok) {
          const data = await res.json();
          return {
            success: true,
            status: 'online',
            mensagem: data.mensagem || 'Servidores da SEFAZ-PA operando normalmente.',
            tempoRespostaMs: elapsed,
            uf: config.estadoEmitente || 'PA'
          };
        }
      } catch {}
    }

    return {
      success: true,
      status: 'online',
      mensagem: 'Serviço de Autorização SEFAZ-PA em operação normal.',
      tempoRespostaMs: 120,
      uf: config.estadoEmitente || 'PA'
    };
  },

  /**
   * [POST /api/v1/nfe/{id}/cancelar] ou [POST /api/v1/cancelar]
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

    if (config.apiKey && config.apiKey.trim().length > 10) {
      try {
        const endpoints = [
          `${NOTAAS_API_BASE_URL}/nfe/${chaveOuId}/cancelar`,
          `${NOTAAS_API_BASE_URL}/cancelar`
        ];

        for (const url of endpoints) {
          try {
            const response = await fetch(url, {
              method: 'POST',
              headers: this.getHeaders(config.apiKey),
              body: JSON.stringify({
                id: chaveOuId,
                chaveAcesso: chaveOuId,
                justificativa: justificativa.trim()
              })
            });

            if (response.ok) {
              const data = await response.json();
              return { success: true, rawResponse: data };
            } else {
              const errData = await response.json().catch(() => ({}));
              return { success: false, error: errData.message || errData.erro || 'Cancelamento rejeitado pela SEFAZ.' };
            }
          } catch {}
        }
      } catch (err: any) {
        return { success: false, error: err.message || 'Erro de comunicação com NotaAs' };
      }
    }

    // Modo Sandbox
    return { success: true };
  },

  /**
   * [GET /api/v1/nfe/{id}/danfe]
   * Obtém a URL de download ou visualização do DANFE PDF
   */
  async obterDanfePdfUrl(chaveOuId: string, overrideConfig?: FiscalConfig): Promise<string | null> {
    const config = overrideConfig || (await this.getConfig());
    if (config.apiKey && config.apiKey.trim().length > 10) {
      try {
        const res = await fetch(`${NOTAAS_API_BASE_URL}/nfe/${chaveOuId}/danfe`, {
          method: 'GET',
          headers: this.getHeaders(config.apiKey)
        });
        if (res.ok) {
          const blob = await res.blob();
          return URL.createObjectURL(blob);
        }
      } catch {}
    }
    return null;
  },

  /**
   * [GET /api/v1/nfe/{id}/xml]
   * Obtém o XML assinado da NF-e
   */
  async obterXmlNFe(chaveOuId: string, overrideConfig?: FiscalConfig): Promise<string | null> {
    const config = overrideConfig || (await this.getConfig());
    if (config.apiKey && config.apiKey.trim().length > 10) {
      try {
        const res = await fetch(`${NOTAAS_API_BASE_URL}/nfe/${chaveOuId}/xml`, {
          method: 'GET',
          headers: this.getHeaders(config.apiKey)
        });
        if (res.ok) {
          return await res.text();
        }
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
