import { AgentContext, ToolOutcome, executeTool } from './tools.js';
import { formatBRL } from '../domain/telegramWrites.js';

/**
 * Comandos fixos, sem IA nenhuma.
 *
 * É o último degrau de fallback: se o Gemini estiver fora do ar ou sem cota,
 * o operador ainda consulta saldo e dá baixa pelo Telegram. Chamam exatamente
 * as mesmas ferramentas que o agente usa.
 */

export interface CommandReply {
  text: string;
  pending?: { action: string; payload: any; summary: string };
}

export const HELP_TEXT = [
  'Posso responder em texto, áudio ou foto — é só falar comigo normalmente.',
  '',
  'Se preferir comandos diretos (funcionam mesmo se a IA estiver fora do ar):',
  '/saldo — saldo das contas',
  '/receber [cliente ou pedido] — parcelas em aberto',
  '/baixar <parcelaId> <valor> — registra recebimento',
  '/abater <parcelaId> <valor> [motivo] — registra abatimento',
  '/vendas [cliente] — últimos pedidos',
  '/estoque [produto] — posição do estoque',
  '/resumo — entradas e saídas de hoje',
  '/conferir — procura divergência entre recibos e baixas',
  '/ajuda — esta lista'
].join('\n');

export function isCommand(text: string): boolean {
  return /^\//.test(String(text || '').trim());
}

const money = (value: string): number => {
  const clean = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function runCommand(text: string, ctx: AgentContext): Promise<CommandReply | null> {
  const raw = String(text || '').trim();
  if (!isCommand(raw)) return null;

  const [commandToken, ...rest] = raw.split(/\s+/);
  const command = commandToken.replace(/@\w+$/, '').toLowerCase();
  const argument = rest.join(' ').trim();

  try {
    switch (command) {
      case '/ajuda':
      case '/help':
      case '/start':
        return { text: HELP_TEXT };

      case '/saldo': {
        const outcome = await executeTool('consultar_caixa', {}, ctx);
        const data = dataOf(outcome);
        const lines = data.contas.map((conta: any) => `• ${conta.nome}: ${formatBRL(conta.saldo)}`);
        return { text: [`Saldo total: ${formatBRL(data.saldoTotal)}`, ...lines].join('\n') };
      }

      case '/receber': {
        const outcome = await executeTool(
          'listar_recebiveis_em_aberto',
          argument ? { clienteNome: argument, pedidoRef: argument } : {},
          ctx
        );
        const data = dataOf(outcome);
        if (!data.quantidade) return { text: 'Não há parcela em aberto por aqui.' };

        const lines = data.parcelas.map(
          (parcela: any) =>
            `• ${formatBRL(parcela.saldo)} — ${parcela.cliente || 'Cliente'}${
              parcela.pedido ? ` (${parcela.pedido})` : ''
            }\n  vence ${parcela.vencimento || 'sem data'} · id ${parcela.parcelaId}`
        );
        return {
          text: [
            `${data.quantidade} parcela(s) em aberto, total ${formatBRL(data.total)}:`,
            ...lines,
            '',
            'Para lançar: /baixar <id> <valor> ou /abater <id> <valor>'
          ].join('\n')
        };
      }

      case '/baixar':
      case '/abater': {
        const [target, amount, ...motivo] = rest;
        if (!target || !amount) {
          return { text: `Use assim: ${command} <parcelaId> <valor>. Veja os ids com /receber.` };
        }

        const outcome = await executeTool(
          command === '/abater' ? 'registrar_abatimento' : 'registrar_recebimento',
          {
            parcelaId: target.startsWith('tx-') ? target : undefined,
            pedidoRef: target.startsWith('tx-') ? undefined : target,
            valor: money(amount),
            motivo: motivo.join(' ') || undefined
          },
          ctx
        );

        if (outcome.kind !== 'confirm') return { text: 'Não consegui preparar o lançamento.' };
        return {
          text: outcome.summary,
          pending: { action: outcome.action, payload: outcome.payload, summary: outcome.summary }
        };
      }

      case '/vendas': {
        const outcome = await executeTool('listar_vendas', argument ? { clienteNome: argument } : {}, ctx);
        const data = dataOf(outcome);
        if (!data.pedidos.length) return { text: 'Nenhum pedido encontrado.' };
        const lines = data.pedidos.map(
          (pedido: any) =>
            `• ${pedido.referencia} — ${pedido.cliente || 'Cliente'} — ${formatBRL(pedido.total)} (${pedido.status})`
        );
        return { text: lines.join('\n') };
      }

      case '/estoque': {
        const outcome = await executeTool('consultar_estoque', argument ? { termo: argument } : {}, ctx);
        const data = dataOf(outcome);
        if (!data.produtos.length) return { text: 'Nenhum produto encontrado.' };
        const lines = data.produtos.map(
          (produto: any) =>
            `• ${produto.nome}: ${produto.quantidade} ${produto.unidade}${produto.critico ? ' (abaixo do mínimo)' : ''}`
        );
        return { text: lines.join('\n') };
      }

      case '/resumo': {
        const outcome = await executeTool('resumo_do_dia', {}, ctx);
        const data = dataOf(outcome);
        return {
          text: [
            `Movimento de ${data.data}:`,
            `Entradas: ${formatBRL(data.entradas)}`,
            `Saídas: ${formatBRL(data.saidas)}`,
            `Abatimentos: ${formatBRL(data.abatimentos)}`,
            `Resultado: ${formatBRL(data.resultado)}`
          ].join('\n')
        };
      }

      case '/conferir': {
        const outcome = await executeTool('conferir_lancamentos', {}, ctx);
        const data = dataOf(outcome);
        if (!data.divergencias) return { text: 'Conferência ok: recibos e baixas batem em todos os pedidos.' };
        const lines = data.detalhes.map(
          (item: any) =>
            `• ${item.reference}: recibos ${formatBRL(item.receiptsTotal)} × baixas ${formatBRL(
              item.paymentsTotal
            )} (diferença ${formatBRL(item.difference)})`
        );
        return {
          text: [`${data.divergencias} pedido(s) com divergência:`, ...lines].join('\n')
        };
      }

      default:
        return { text: `Não conheço ${command}.\n\n${HELP_TEXT}` };
    }
  } catch (error: any) {
    return { text: error?.message || 'Não consegui executar esse comando.' };
  }
}

function dataOf(outcome: ToolOutcome): any {
  if (outcome.kind !== 'data') throw new Error('Resposta inesperada da ferramenta.');
  return outcome.data;
}
