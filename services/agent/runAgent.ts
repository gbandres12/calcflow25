import { GoogleGenAI } from '@google/genai';
import { AgentContext, ToolOutcome, executeTool, toolDeclarations } from './tools.js';

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
}

const PRIMARY_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-2.5-flash-lite';
const MAX_TOOL_ROUNDS = 6;

const systemInstruction = (ctx: AgentContext) => `
Você é o assessor financeiro da CalcárioFlow, um ERP de usina de calcário, e atende pelo Telegram.
Fala com ${ctx.user.name} (perfil ${ctx.user.role}). Hoje é ${ctx.today}.

Como se comportar:
- Responda em português do Brasil, curto, como quem manda mensagem. Sem markdown: nada de **negrito**, listas com asterisco ou tabelas.
- Você NUNCA calcula números de cabeça: todo valor vem de uma ferramenta. Se não tiver o dado, chame a ferramenta.
- O histórico recente do chat vem junto. Se o usuário estiver continuando um pedido, reaproveite cliente, produto, quantidade e preço já ditos. Não peça de novo o que já foi informado.
- Nome parcial vale: "GABRIEL ANDRES" é o mesmo cliente que "Gabriel Lima Andres". Sempre chame buscar_cliente antes de criar_orcamento. Se vierem sugestões, liste os nomes e pergunte qual é — não diga para cadastrar se houver alguém parecido.
- Produto incompleto também: se "calcário dolomítico" não bater certo, chame consultar_estoque e ofereça as opções.
- Pedido de venda pelo Telegram vira orçamento (criar_orcamento). A confirmação da venda e a NF-e saem no ERP.
- Antes de qualquer abatimento ou recebimento, use listar_recebiveis_em_aberto para pegar o parcelaId.
- Se houver mais de uma parcela em aberto, PERGUNTE ao usuário em qual aplicar. Não escolha sozinho.
- As ferramentas de lançamento não gravam nada: elas devolvem um resumo que o usuário confirma no botão.
- Áudio e foto servem para entender o pedido e extrair campos (valor, data, cliente). O valor final sempre passa pela confirmação.
- Se a ferramenta devolver erro, explique em linguagem simples, mostre as sugestões e diga o que falta.
- Depois de usar ferramenta, SEMPRE responda em texto. Nunca devolva mensagem vazia.
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

const isOverloaded = (error: any): boolean => {
  const status = Number(error?.status || error?.code || 0);
  const message = String(error?.message || '').toLowerCase();
  return (
    status === 429 ||
    status === 503 ||
    message.includes('overloaded') ||
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('unavailable')
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
    { model: PRIMARY_MODEL, waitMs: 1200 },
    { model: FALLBACK_MODEL, waitMs: 800 }
  ];

  let lastError: any;
  for (const attempt of attempts) {
    if (attempt.waitMs) await sleep(attempt.waitMs);
    try {
      return await ai.models.generateContent({ ...params, model: attempt.model });
    } catch (error: any) {
      lastError = error;
      if (!isOverloaded(error)) throw error;
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
      if (text) return { text, pending };
      if (emptyRetries >= 1) {
        return {
          text: pending
            ? pending.summary
            : 'Não fechei essa consulta. Manda de novo o nome do cliente ou o que você quer lançar.',
          pending
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
                    'O resumo já foi montado. Diga ao usuário, em uma frase, que é só tocar em Confirmar abaixo.'
                }
              }
            }
          });
        } else {
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
    pending
  };
}
