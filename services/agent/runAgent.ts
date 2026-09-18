import { GoogleGenAI } from '@google/genai';
import { AgentContext, ToolOutcome, executeTool, toolDeclarations } from './tools';

export interface AgentAttachment {
  mimeType: string;
  /** Conteúdo em base64, como o Telegram entrega depois do download. */
  data: string;
}

export interface AgentRequest {
  text?: string;
  attachments?: AgentAttachment[];
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
- Responda em português do Brasil, curto e direto, como quem manda mensagem. Nada de tabelas grandes.
- Você NUNCA calcula números de cabeça: todo valor vem de uma ferramenta. Se não tiver o dado, chame a ferramenta.
- Antes de qualquer abatimento ou recebimento, use listar_recebiveis_em_aberto para pegar o parcelaId.
- Se houver mais de uma parcela em aberto, PERGUNTE ao usuário em qual aplicar. Não escolha sozinho.
- As ferramentas de lançamento não gravam nada: elas devolvem um resumo que o usuário confirma no botão.
- Emissão de NF-e não é feita aqui. Se pedirem, explique que a nota sai pelo ERP.
- Áudio e foto servem para entender o pedido e extrair campos (valor, data, cliente). O valor final sempre passa pela confirmação.
- Se a ferramenta devolver erro, explique o erro em linguagem simples e diga o que falta.
`.trim();

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

  const contents: any[] = [{ role: 'user', parts: userParts }];
  let pending: AgentReply['pending'];

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
      return { text: response.text?.trim() || 'Não consegui formular a resposta. Pode repetir?', pending };
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
    text: 'Me embananei com essa consulta. Tenta perguntar de um jeito mais específico?',
    pending
  };
}
