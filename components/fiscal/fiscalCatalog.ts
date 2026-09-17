export const CST_ICMS_OPTIONS = [
  { value: '102', label: '102 — SN tributada sem crédito', group: 'Simples Nacional' },
  { value: '101', label: '101 — SN tributada com crédito', group: 'Simples Nacional' },
  { value: '103', label: '103 — SN isenção faixa de receita', group: 'Simples Nacional' },
  { value: '201', label: '201 — SN com crédito e ICMS-ST', group: 'Simples Nacional' },
  { value: '202', label: '202 — SN sem crédito e ICMS-ST', group: 'Simples Nacional' },
  { value: '300', label: '300 — Imune', group: 'Simples Nacional' },
  { value: '400', label: '400 — Não tributada no SN', group: 'Simples Nacional' },
  { value: '500', label: '500 — ICMS cobrado antes por ST', group: 'Simples Nacional' },
  { value: '900', label: '900 — Outros (SN)', group: 'Simples Nacional' },
  { value: '40', label: '40 — Isenta (Convênio 100/97)', group: 'Regime Normal' },
  { value: '41', label: '41 — Não tributada', group: 'Regime Normal' },
  { value: '51', label: '51 — Diferimento', group: 'Regime Normal' },
  { value: '00', label: '00 — Tributada integralmente', group: 'Regime Normal' },
  { value: '20', label: '20 — Redução de base de cálculo', group: 'Regime Normal' },
  { value: '10', label: '10 — Tributada com ICMS-ST', group: 'Regime Normal' },
  { value: '60', label: '60 — ICMS cobrado antes por ST', group: 'Regime Normal' },
  { value: '70', label: '70 — Redução de base + ST', group: 'Regime Normal' },
  { value: '90', label: '90 — Outras saídas', group: 'Regime Normal' }
];

export const CST_PIS_COFINS_OPTIONS = [
  { value: '07', label: '07 — Isenta da contribuição' },
  { value: '08', label: '08 — Sem incidência' },
  { value: '06', label: '06 — Alíquota zero' },
  { value: '01', label: '01 — Tributável alíquota básica' },
  { value: '02', label: '02 — Tributável alíquota diferenciada' },
  { value: '04', label: '04 — Monofásica alíquota zero' },
  { value: '49', label: '49 — Outras saídas' },
  { value: '99', label: '99 — Outras operações' }
];

export type NfeOperacao = 'venda' | 'devolucao' | 'transferencia';

export const CFOP_OPTIONS: Array<{ value: string; label: string; group: string; operacao: NfeOperacao | 'todos' }> = [
  { value: '5101', label: '5101 — Venda de produção do estabelecimento', group: 'Venda interna', operacao: 'venda' },
  { value: '5102', label: '5102 — Venda de mercadoria adquirida', group: 'Venda interna', operacao: 'venda' },
  { value: '5405', label: '5405 — Venda de produção com ST (interno)', group: 'Venda interna', operacao: 'venda' },
  { value: '6101', label: '6101 — Venda de produção (interestadual)', group: 'Venda interestadual', operacao: 'venda' },
  { value: '6102', label: '6102 — Venda de mercadoria adquirida (interestadual)', group: 'Venda interestadual', operacao: 'venda' },
  { value: '6404', label: '6404 — Venda de produção com ST (interestadual)', group: 'Venda interestadual', operacao: 'venda' },
  { value: '5201', label: '5201 — Devolução de compra para industrialização', group: 'Devolução interna', operacao: 'devolucao' },
  { value: '5202', label: '5202 — Devolução de venda de produção', group: 'Devolução interna', operacao: 'devolucao' },
  { value: '5411', label: '5411 — Devolução de venda com ST (interno)', group: 'Devolução interna', operacao: 'devolucao' },
  { value: '6201', label: '6201 — Devolução de compra (interestadual)', group: 'Devolução interestadual', operacao: 'devolucao' },
  { value: '6202', label: '6202 — Devolução de venda de produção (interestadual)', group: 'Devolução interestadual', operacao: 'devolucao' },
  { value: '6411', label: '6411 — Devolução de venda com ST (interestadual)', group: 'Devolução interestadual', operacao: 'devolucao' },
  { value: '5151', label: '5151 — Transferência de produção', group: 'Transferência interna', operacao: 'transferencia' },
  { value: '5152', label: '5152 — Transferência de mercadoria adquirida', group: 'Transferência interna', operacao: 'transferencia' },
  { value: '5409', label: '5409 — Transferência de produção com ST', group: 'Transferência interna', operacao: 'transferencia' },
  { value: '6151', label: '6151 — Transferência de produção (interestadual)', group: 'Transferência interestadual', operacao: 'transferencia' },
  { value: '6152', label: '6152 — Transferência de mercadoria adquirida (interestadual)', group: 'Transferência interestadual', operacao: 'transferencia' },
  { value: '5904', label: '5904 — Remessa para industrialização', group: 'Outras saídas', operacao: 'todos' },
  { value: '5910', label: '5910 — Remessa em bonificação / brinde', group: 'Outras saídas', operacao: 'todos' },
  { value: '5949', label: '5949 — Outra saída não especificada', group: 'Outras saídas', operacao: 'todos' },
  { value: '6949', label: '6949 — Outra saída não especificada (interestadual)', group: 'Outras saídas', operacao: 'todos' }
];

export const cfopsForOperacao = (operacao: NfeOperacao) =>
  CFOP_OPTIONS.filter((row) => row.operacao === operacao || row.operacao === 'todos');

export const suggestedCfop = (
  operacao: NfeOperacao,
  isInterestadual: boolean,
  defaults?: { vendaIn?: string; vendaOut?: string; transfIn?: string; transfOut?: string }
) => {
  if (operacao === 'devolucao') return isInterestadual ? '6202' : '5202';
  if (operacao === 'transferencia') {
    return isInterestadual ? (defaults?.transfOut || '6152') : (defaults?.transfIn || '5152');
  }
  return isInterestadual ? (defaults?.vendaOut || '6101') : (defaults?.vendaIn || '5101');
};

export const naturezaForOperacao = (operacao: NfeOperacao, fallback?: string) => {
  if (operacao === 'devolucao') return 'Devolucao de mercadoria';
  if (operacao === 'transferencia') return 'Transferencia de estoque';
  return fallback || 'Venda de producao do estabelecimento';
};

export const cstNeedsIcmsAliquot = (cst?: string) => ['00', '10', '20', '90'].includes((cst || '').trim());
