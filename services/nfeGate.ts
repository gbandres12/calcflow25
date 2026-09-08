import { Customer, FiscalConfig, SaleOrder } from '../types';
import { fiscalService } from './fiscalService';

export type NfeGateResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: string;
};

function onlyDigits(value?: string) {
  return (value || '').replace(/\D/g, '');
}

export function validarConfigFiscal(config?: FiscalConfig | null): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!config) {
    errors.push('Configuração fiscal ainda não foi carregada. Abra Configurações e salve os dados do emitente.');
    return { errors, warnings };
  }

  const cnpj = onlyDigits(config.cnpjEmitente);
  if (cnpj.length !== 14) {
    errors.push('CNPJ do emitente está incompleto. Ajuste em Configurações > Fiscal.');
  }
  if (!config.razaoSocial || config.razaoSocial.trim().length < 3) {
    errors.push('Razão social do emitente não foi preenchida. Ajuste em Configurações > Fiscal.');
  }
  if (!config.inscricaoEstadual || !config.inscricaoEstadual.trim()) {
    warnings.push('Inscrição estadual do emitente está vazia.');
  }

  const apiKey = (config.apiKey || '').trim();
  const modoLocal = config.modoEmissao === 'sandbox_local';
  if (!apiKey && !modoLocal) {
    errors.push('Chave da API NotaAs não configurada. Sem ela a SEFAZ não autoriza a nota. Preencha em Configurações > Fiscal.');
  }

  return { errors, warnings };
}

export function explicarBloqueioEmissao(
  order: SaleOrder,
  customer: Customer | undefined,
  config?: FiscalConfig | null
): NfeGateResult {
  const dados = fiscalService.validarDadosFiscais(order, customer);
  const cfg = validarConfigFiscal(config);

  const errors = [...dados.errors, ...cfg.errors];
  const warnings = [...(dados.warnings || []), ...cfg.warnings];

  if (order.nfeStatus === 'autorizada') {
    errors.push('Esta nota já foi autorizada pela SEFAZ. Use DANFE ou emissão de devolução.');
  }

  const valid = errors.length === 0;
  const summary = valid
    ? (warnings[0] || 'Pronto para transmitir a NF-e.')
    : errors[0];

  return { valid, errors, warnings, summary };
}

export function rotuloStatusNfe(status?: string) {
  switch (status) {
    case 'autorizada':
      return 'Autorizada';
    case 'cancelada':
      return 'Cancelada';
    case 'processando':
      return 'Processando';
    case 'rejeitada':
      return 'Rejeitada';
    case 'simulada':
      return 'Simulada (local)';
    default:
      return 'Não emitida';
  }
}
