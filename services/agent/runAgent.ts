import { GoogleGenAI } from '@google/genai';
import { AgentContext, ToolDocument, ToolOutcome, executeTool, toolDeclarations } from './tools.js';

export interface AgentAttachment {
  mimeType: string;
  /** Conteúdo em base64, como o Telegram entrega depois do download. */
  data: string;
}

export interface AgentHistoryTurn {
  role: 'user' | 'model';
  text: string;
}

export interface AgentRequest {
  text?: string;
  attachments?: AgentAttachment[];
  history?: AgentHistoryTurn[];
  ctx: AgentContext;
}

export interface AgentReply {
  text: string;
  /** Preenchido quando o agente propôs um lançamento que precisa do Confirmar. */
  pending?: { action: string; payload: any; summary: string };
  /** Documento gerado por ferramenta (ex: 2ª via do DANFE). */
  document?: ToolDocument;
}

const PRIMARY_MODEL = 'gemini-3.5-flash';
const FALLBACK_MODEL = 'gemini-3.5-flash-lite';
const LEGACY_FALLBACK_MODEL = 'gemini-2.5-flash';
const MAX_TOOL_ROUNDS = 6;

const systemInstruction = (ctx: AgentContext) => `
Você é o assessor financeiro e fiscal da CalcárioFlow, um ERP de usina de calcário, e atende pelo Telegram.
Fala com ${ctx.user.name} (perfil ${ctx.user.role}). Hoje é ${ctx.today}.

Como se comportar:
- Responda em português do Brasil, curto, claro e consultivo, como quem conversa no WhatsApp/Telegram. Sem markdown: nada de **negrito**, listas com asterisco ou tabelas.
- Você NUNCA calcula números de cabeça: todo valor vem de uma ferramenta. Se não tiver o dado, chame a ferramenta.
- O histórico recente do chat vem junto. Se o usuário estiver continuando um pedido ou uma emissão de NF-e, reaproveite todos os dados já ditos (cliente, pedido, produto, quantidade, preço, placa, motorista, frete, observação). Não peça de novo o que já foi informado.
- Nome parcial vale: "GABRIEL ANDRES" é o mesmo cliente que "Gabriel Lima Andres". Sempre busque o cliente antes. Se vierem sugestões, liste os nomes e pergunte qual é.
- Produto incompleto também: se "calcário dolomítico" não bater certo, chame consultar_estoque e ofereça as opções.
- Pedido de venda / "fazer um pedido" = ferramenta criar_pedido_venda. NÃO use criar_orcamento a não ser que a pessoa peça orçamento explicitamente.
- Antes de criar_pedido_venda, chame buscar_cliente e confira produto, quantidade e preço. Repita TODOS os números no texto: cliente, produto, quantidade, preço unitário e total.
- Só chame criar_pedido_venda quando cliente e produto estiverem fechados. NUNCA diga "toque em Confirmar" sem ter chamado a ferramenta: o botão só aparece depois dela.
- Antes de qualquer abatimento ou recebimento, use listar_recebiveis_em_aberto para pegar o parcelaId. Se houver mais de uma parcela em aberto, PERGUNTE ao usuário em qual aplicar.

FLUXO CONSULTIVO DE EMISSÃO DE NF-e (MUITO IMPORTANTE):
- Quando o usuário pedir para emitir nota fiscal ("emitir nota", "tirar uma NF-e", "faturar pedido", "nota pro cliente X"), aja de forma CONSULTIVA passo a passo:
  1. Chame PRIMEIRO diagnosticar_emissao_nfe passando clienteNome e/ou pedidoRef (se informados). Se o usuário só disse "quero emitir uma nota", pergunte para qual cliente ou número de pedido é a nota.
  2. Analise o diagnóstico com o usuário:
     • Cadastro do cliente: se o cliente não existir ou faltar CPF/CNPJ obrigatório, peça os dados no chat e salve na hora usando salvar_cliente_fiscal. Se faltar IE (Inscrição Estadual / Produtor Rural) ou endereço completo, avise e pergunte se quer informar agora (você salva com salvar_cliente_fiscal) ou seguir como não contribuinte / endereço padrão.
     • Escolha do Pedido ou Avulsa: se o cliente tiver pedidos com saldo a faturar (pedidosDoCliente), mostre os pedidos e o saldo pendente em toneladas (e os tickets de pesagem/carregamentos da balança, se houver) e pergunte: vai faturar o pedido inteiro, uma carga parcial (qual peso/ticket?) ou uma nota avulsa solta?
     • Transporte, Pagamento e Observações: pergunte ou confirme se quer incluir placa do caminhão, motorista, modalidade/valor do frete (CIF, FOB ou Sem frete), forma de pagamento (PIX, Boleto, A prazo, Sem pagamento) e observações na nota (ex: número do ticket, fazenda, inscrição estadual).
  3. Assim que cliente e itens/pedido estiverem definidos, chame emitir_nfe_pedido (para nota do pedido, total ou parcial) ou emitir_nfe_avulsa (para nota avulsa parcial ou solta) passando todos os detalhes combinados (itens, placaVeiculo, ufPlaca, motoristaNome, modalidadeFrete, valorFrete, ticketPesagem, formaPagamento, cfop, naturezaOperacao, observacao).
  4. Sempre que o usuário pedir qualquer ajuste depois de ver o rascunho ("coloca placa QVA1B23", "muda para 25 ton", "atualiza o CPF/IE dele", "adiciona observação X"), aplique a mudança (chamando salvar_cliente_fiscal se for dado do cliente, e chamando emitir_nfe_pedido ou emitir_nfe_avulsa novamente) para gerar o novo cartão atualizado com o botão Emitir NF-e.
  5. NUNCA diga que a NF-e só sai no ERP e NUNCA diga "toque em Emitir NF-e" sem ter chamado emitir_nfe_pedido ou emitir_nfe_avulsa na rodada atual.
  6. Se o usuário pedir a 2ª via do PDF da nota ou o DANFE, chame enviar_danfe_nfe. Para consultar se a SEFAZ autorizou, chame status_nfe_pedido.
- Áudio e foto servem para entender o pedido ou ler ticket de balança/dados do cliente/placa do caminhão. Extraia os dados da imagem/áudio e confirme com o usuário.
`.trim();

const stripTelegramMarkdown = (text: string): string =>
  String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|\n)\s*\*\s+/g, '$1• ')
    .trim();

function getApiKey(): string {
  const key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY || '').trim();
  if (!key) throw new Error('Configure GEMINI_API_KEY no servidor para o agente responder.');
  return key;
}

const isRetryableModelError = (error: any): boolean => {
  const status = Number(error?.status || error?.code || 0);
  const message = String(error?.message || '').toLowerCase();
  return (
    status === 404 ||
    status === 429 ||
    status === 503 ||
    message.includes('overloaded') ||
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('unavailable') ||
    message.includes('no longer available') ||
    message.includes('not found')
  );
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Único degrau de fallback: repete e cai para o modelo mais leve quando o
 * Gemini devolve sobrecarga ou limite. Se nem assim responder, o webhook
 * oferece os comandos determinísticos, que não dependem de modelo nenhum.
 */
async function generateWithFallback(ai: GoogleGenAI, params: any): Promise<any> {
  const attempts: { model: string; waitMs: number }[] = [
    { model: PRIMARY_MODEL, waitMs: 0 },
    { model: PRIMARY_MODEL, waitMs: 800 },
    { model: FALLBACK_MODEL, waitMs: 400 },
    { model: LEGACY_FALLBACK_MODEL, waitMs: 400 }
  ];

  let lastError: any;
  for (const attempt of attempts) {
    if (attempt.waitMs) await sleep(attempt.waitMs);
    try {
      return await ai.models.generateContent({ ...params, model: attempt.model });
    } catch (error: any) {
      lastError = error;
      if (!isRetryableModelError(error)) throw error;
      console.warn(`[AGENTE] ${attempt.model} indisponível, tentando de novo:`, error?.message);
    }
  }
  throw lastError;
}

export async function runAgent(request: AgentRequest): Promise<AgentReply> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const ctx = request.ctx;

  const userParts: any[] = [];
  if (request.text) userParts.push({ text: request.text });
  for (const attachment of request.attachments || []) {
    userParts.push({ inlineData: { mimeType: attachment.mimeType, data: attachment.data } });
  }
  if (!userParts.length) userParts.push({ text: 'Oi' });

  const contents: any[] = [];
  for (const turn of request.history || []) {
    const text = String(turn.text || '').trim();
    if (!text) continue;
    contents.push({
      role: turn.role === 'model' ? 'model' : 'user',
      parts: [{ text: text.slice(0, 800) }]
    });
  }
  if (contents[0]?.role === 'model') contents.shift();
  contents.push({ role: 'user', parts: userParts });

  let pending: AgentReply['pending'];
  let document: AgentReply['document'];
  let emptyRetries = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await generateWithFallback(ai, {
      contents,
      config: {
        systemInstruction: systemInstruction(ctx),
        tools: [{ functionDeclarations: toolDeclarations }],
        temperature: 0.2
      }
    });

    const calls = response.functionCalls || [];
    if (!calls.length) {
      const text = stripTelegramMarkdown(response.text || '');
      if (text) return { text, pending, document };
      if (emptyRetries >= 1) {
        return {
          text: pending
            ? pending.summary
            : 'Não fechei essa consulta. Manda de novo o nome do cliente ou o que você quer lançar.',
          pending,
          document
        };
      }
      emptyRetries += 1;
      contents.push({
        role: 'user',
        parts: [
          {
            text: pending
              ? 'Responda agora em texto curto ao usuário, sem markdown e sem chamar ferramenta. O resumo do lançamento já está pronto.'
              : 'Responda agora em texto curto ao usuário. Se faltar dado, chame a ferramenta. Sem markdown e sem mensagem vazia.'
          }
        ]
      });
      continue;
    }

    const modelParts = response.candidates?.[0]?.content?.parts || calls.map((call: any) => ({ functionCall: call }));
    contents.push({ role: 'model', parts: modelParts });

    const responseParts: any[] = [];
    for (const call of calls) {
      try {
        const outcome: ToolOutcome = await executeTool(call.name, call.args, ctx);

        if (outcome.kind === 'confirm') {
          pending = { action: outcome.action, payload: outcome.payload, summary: outcome.summary };
          responseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: {
                output: {
                  status: 'aguardando_confirmacao',
                  resumo: outcome.summary,
                  instrucao:
                    'O resumo já foi montado. Diga ao usuário, em uma frase, que é só conferir os dados (ou pedir qualquer ajuste) e tocar no botão abaixo.'
                }
              }
            }
          });
        } else {
          if (outcome.document) document = outcome.document;
          responseParts.push({
            functionResponse: { id: call.id, name: call.name, response: { output: outcome.data } }
          });
        }
      } catch (error: any) {
        responseParts.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: { error: error?.message || 'Falha ao executar a ferramenta.' }
          }
        });
      }
    }

    contents.push({ role: 'user', parts: responseParts });
  }

  return {
    text: pending
      ? pending.summary
      : 'Me embananei com essa consulta. Tenta perguntar de um jeito mais específico?',
    pending,
    document
  };
}
