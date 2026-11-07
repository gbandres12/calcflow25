import { AgentContext, ToolDocument, ToolOutcome, executeTool } from './tools.js';
import { formatBRL } from '../domain/telegramWrites.js';

/**
 * Comandos fixos, sem IA nenhuma.
 *
 * É o último degrau de fallback: se o Gemini estiver fora do ar ou sem cota,
 * o operador ainda consulta saldo e dá baixa pelo Telegram. Chamam exatamente
 * as mesmas ferramentas que o agente usa.
 */

export interface CommandInlineButton {
  text: string;
  callback_data: string;
}

export interface CommandReply {
  text: string;
  pending?: { action: string; payload: any; summary: string };
  document?: ToolDocument;
  buttons?: CommandInlineButton[][];
}

export const HELP_TEXT = [
  'Posso responder em texto, áudio ou foto — ou você pode tocar nos botões aqui embaixo:',
  '',
  '• Novo Pedido — lança pedido de venda e gera o PDF',
  '• Consultar Pedido — lista os últimos pedidos lançados',
  '• Emitir NF-e — emite nota de um pedido ou nota avulsa',
  '• Estoque — posição atual dos produtos',
  '• Caixa hoje — entradas, saídas de hoje e saldo das contas',
  '• Cancelar — cancela a operação atual',
  '',
  'Comandos adicionais:',
  '/saldo · /receber · /baixar <id> <valor> · /abater <id> <valor> · /danfe <pedido> · /conferir'
].join('\n');

const SHORTCUT_MAP: Record<string, string> = {
  'novo pedido': '/novo_pedido',
  'criar pedido': '/novo_pedido',
  'consultar pedido': '/vendas',
  'consultar pedidos': '/vendas',
  'ultimas vendas': '/vendas',
  'vendas': '/vendas',
  'emitir nfe': '/nfe',
  'emitir nf e': '/nfe',
  'emitir nota': '/nfe',
  'estoque': '/estoque',
  'caixa hoje': '/caixa',
  'caixa': '/caixa',
  'saldo caixa': '/saldo',
  'saldo': '/saldo',
  'resumo do dia': '/resumo',
  'resumo': '/resumo',
  'contas a receber': '/receber',
  'receber': '/receber',
  'cancelar': '/cancelar',
  'ajuda menu': '/ajuda',
  'ajuda': '/ajuda',
  'menu': '/ajuda'
};

export function normalizeShortcutToCommand(text: string): string | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (/^\//.test(raw)) return raw;

  const cleaned = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return SHORTCUT_MAP[cleaned] || null;
}

export function isCommand(text: string): boolean {
  return normalizeShortcutToCommand(text) !== null;
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
  const normalized = normalizeShortcutToCommand(text);
  if (!normalized) return null;

  const [commandToken, ...rest] = normalized.split(/\s+/);
  const command = commandToken.replace(/@\w+$/, '').toLowerCase();
  const argument = rest.join(' ').trim();

  try {
    switch (command) {
      case '/ajuda':
      case '/help':
      case '/start':
      case '/menu':
        return {
          text: HELP_TEXT
        };

      case '/novo_pedido': {
        let stockLines: string[] = [];
        try {
          const stockOutcome = await executeTool('consultar_estoque', {}, ctx);
          const stockData = dataOf(stockOutcome);
          if (Array.isArray(stockData?.produtos) && stockData.produtos.length) {
            stockLines = [
              '',
              'Produtos disponíveis no estoque:',
              ...stockData.produtos.slice(0, 8).map(
                (p: any) =>
                  `• ${p.nome}: ${formatBRL(Number(p.preco || 0))}/${p.unidade || 't'} (${p.quantidade} ${p.unidade || 't'} em estoque)`
              )
            ];
          }
        } catch {
          // Segue sem lista de estoque se o usuário não tiver permissão.
        }

        return {
          text: [
            'Vamos lançar um pedido de venda!',
            '',
            'Me mande em texto ou áudio: Cliente, Produto, Quantidade e Preço (e a forma de pagamento).',
            'Exemplo: "Pedido pro Gabriel Andres, 10t de Calcário Dolomítico a 160 no PIX".',
            ...stockLines
          ].join('\n')
        };
      }

      case '/cancelar':
        return {
          text: 'Operação cancelada. Escolha um botão abaixo ou me mande uma mensagem.'
        };

      case '/caixa': {
        const [resumoOutcome, caixaOutcome] = await Promise.all([
          executeTool('resumo_do_dia', {}, ctx),
          executeTool('consultar_caixa', {}, ctx)
        ]);
        const resumo = dataOf(resumoOutcome);
        const caixa = dataOf(caixaOutcome);
        const contasLines = caixa.contas.map((conta: any) => `• ${conta.nome}: ${formatBRL(conta.saldo)}`);
        return {
          text: [
            `Caixa hoje (${resumo.data}):`,
            `Entradas: ${formatBRL(resumo.entradas)}`,
            `Saídas: ${formatBRL(resumo.saidas)}`,
            `Abatimentos: ${formatBRL(resumo.abatimentos)}`,
            `Resultado do dia: ${formatBRL(resumo.resultado)}`,
            '',
            `Saldo total das contas: ${formatBRL(caixa.saldoTotal)}`,
            ...contasLines
          ].join('\n')
        };
      }

      case '/saldo': {
        const outcome = await executeTool('consultar_caixa', {}, ctx);
        const data = dataOf(outcome);
        const lines = data.contas.map((conta: any) => `• ${conta.nome}: ${formatBRL(conta.saldo)}`);
        return {
          text: [`Saldo total: ${formatBRL(data.saldoTotal)}`, ...lines].join('\n')
        };
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

        return {
          text: [
            'Últimos pedidos de venda:',
            ...lines,
            '',
            'Qual o número do pedido? Ex: PED-2026-0064 (ou envie /nfe PED-2026-0064 para emitir nota)'
          ].join('\n')
        };
      }

      case '/estoque': {
        const outcome = await executeTool('consultar_estoque', argument ? { termo: argument } : {}, ctx);
        const data = dataOf(outcome);
        if (!data.produtos.length) return { text: 'Nenhum produto encontrado.' };
        const lines = data.produtos.map(
          (produto: any) =>
            `• ${produto.nome}: ${produto.quantidade} ${produto.unidade} · ${formatBRL(Number(produto.preco || 0))}/${produto.unidade}${
              produto.critico ? ' (abaixo do mínimo)' : ''
            }`
        );
        return {
          text: lines.join('\n')
        };
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

      case '/nfe': {
        if (!argument) {
          let recentLines: string[] = [];
          try {
            const salesOutcome = await executeTool('listar_vendas', { limite: 5 }, ctx);
            const salesData = dataOf(salesOutcome);
            if (Array.isArray(salesData?.pedidos) && salesData.pedidos.length) {
              recentLines = [
                '',
                'Últimos pedidos:',
                ...salesData.pedidos
                  .slice(0, 5)
                  .filter((p: any) => p.referencia && p.status !== 'Cancelado')
                  .map((p: any) => `• ${p.referencia} — ${p.cliente || 'Cliente'} (${formatBRL(p.total)})`)
              ];
            }
          } catch {
            // Segue apenas com instruções se falhar listagem
          }

          return {
            text: [
              'Qual o número do pedido para emitir a NF-e? Ex: /nfe PED-2026-0064',
              'Ou me diga em texto/áudio: "Quero emitir uma nota fiscal pro cliente X" que montamos passo a passo.',
              ...recentLines
            ].join('\n')
          };
        }
        const outcome = await executeTool('emitir_nfe_pedido', { pedidoRef: argument }, ctx);
        if (outcome.kind !== 'confirm') {
          const data = dataOf(outcome);
          return { text: data?.erro || 'Não consegui preparar a NF-e desse pedido.' };
        }
        return {
          text: outcome.summary,
          pending: { action: outcome.action, payload: outcome.payload, summary: outcome.summary }
        };
      }

      case '/nfe_avulsa': {
        return {
          text: [
            'Vamos emitir uma NF-e Avulsa (sem precisar de pedido prévio)!',
            '',
            'Me mande em texto ou áudio:',
            '• Nome ou CPF/CNPJ do cliente;',
            '• Produto, quantidade (toneladas) e valor unitário;',
            '• Se quiser: placa do caminhão, motorista e modalidade de frete (CIF, FOB ou Sem frete).',
            '',
            'Exemplo: "Emitir NF-e avulsa pro Gabriel Andres de 12t de Calcário Dolomítico a R$ 160, sem frete".'
          ].join('\n')
        };
      }

      case '/danfe': {
        if (!argument) {
          return { text: 'Use assim: /danfe PED-2026-0001 para receber o PDF da NF-e autorizada.' };
        }
        const [pedidoRef, numeroNota] = rest;
        const outcome = await executeTool('enviar_danfe_nfe', { pedidoRef, numeroNota }, ctx);
        const data = dataOf(outcome);
        return {
          text: `DANFE da NF-e nº ${data.numeroNota} (${data.referencia}) baixado. Enviando o PDF em seguida.`,
          document: outcome.kind === 'data' ? outcome.document : undefined
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
