import { getTable, upsert } from '../_lib/erpRepository.js';
import {
  answerCallbackQuery,
  downloadFileAsBase64,
  editMessageReplyMarkup,
  sendChatAction,
  sendDocument,
  sendMessage
} from '../_lib/telegramApi.js';
import {
  TelegramLink,
  claimUpdate,
  consumePairingCode,
  consumePendingAction,
  getLink,
  loadChatHistory,
  saveChatTurn,
  savePendingAction,
  touchLink,
  writeAudit
} from '../_lib/telegramStore.js';
// Imports dinâmicos: o bundle serverless da Vercel quebra se @google/genai e
// o restante do agente carregam no cold start desta função.
type AgentAttachment = { mimeType: string; data: string };
type AgentContext = {
  companyId: string;
  user: { id: string; name: string; role: string; permissions: Record<string, boolean> };
  repo: { getTable: typeof getTable; upsert: typeof upsert };
  allowWrites: boolean;
  today: string;
};

async function loadAgentModules() {
  const [commands, runAgentMod, toolsMod] = await Promise.all([
    import('../../services/agent/commands.js'),
    import('../../services/agent/runAgent.js'),
    import('../../services/agent/tools.js')
  ]);
  return {
    HELP_TEXT: commands.HELP_TEXT,
    isCommand: commands.isCommand,
    runCommand: commands.runCommand,
    runAgent: runAgentMod.runAgent,
    commitAction: toolsMod.commitAction
  };
}

export const config = { runtime: 'nodejs', maxDuration: 30 };

const repo = { getTable, upsert };

const writesEnabled = (): boolean =>
  String(process.env.TELEGRAM_AGENT_WRITES || '').trim().toLowerCase() === 'true';

function webhookAuthorized(req: any): boolean {
  const expected = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (!expected) return true;
  const received = String(req.headers['x-telegram-bot-api-secret-token'] || '').trim();
  return received === expected;
}

function buildContext(link: TelegramLink): AgentContext {
  return {
    companyId: link.companyId,
    user: {
      id: link.erpUserId || link.userId,
      name: link.displayName || 'Usuário',
      role: link.role,
      permissions: link.permissions || {}
    },
    repo,
    allowWrites: writesEnabled(),
    today: new Date().toISOString().split('T')[0]
  };
}

async function collectAttachments(message: any): Promise<AgentAttachment[]> {
  const attachments: AgentAttachment[] = [];
  const fileIds: string[] = [];

  if (message.voice?.file_id) fileIds.push(message.voice.file_id);
  if (message.audio?.file_id) fileIds.push(message.audio.file_id);
  if (Array.isArray(message.photo) && message.photo.length) {
    // O array vem do menor para o maior; o último é a melhor resolução.
    fileIds.push(message.photo[message.photo.length - 1].file_id);
  }
  if (message.document?.file_id && /^(image|application\/pdf)/.test(message.document.mime_type || '')) {
    fileIds.push(message.document.file_id);
  }

  for (const fileId of fileIds) {
    const file = await downloadFileAsBase64(fileId);
    if (file) attachments.push(file);
  }

  return attachments;
}

async function handlePairing(chatId: string, text: string): Promise<boolean> {
  const match = String(text || '')
    .trim()
    .match(/^\/(?:vincular|start)(?:@\w+)?\s+([A-Za-z0-9]{4,12})$/);

  if (!match) return false;

  const link = await consumePairingCode(match[1], chatId);
  if (!link) {
    await sendMessage(chatId, 'Esse código não vale mais. Gere outro no ERP, em Usuários e Acessos.');
    return true;
  }

  await writeAudit({
    chatId,
    companyId: link.companyId,
    userId: link.userId,
    action: 'vincular_chat',
    result: 'ok'
  });

  const { HELP_TEXT } = await loadAgentModules();
  await sendMessage(
    chatId,
    [
      `Pronto, ${link.displayName || 'tudo certo'}! Este chat está ligado ao CalcárioFlow.`,
      '',
      HELP_TEXT
    ].join('\n')
  );
  return true;
}

async function handleMessage(message: any): Promise<void> {
  const chatId = String(message.chat?.id || '');
  if (!chatId) return;

  const text = String(message.text || message.caption || '').trim();
  const link = await getLink(chatId);

  if (!link) {
    const paired = await handlePairing(chatId, text);
    if (!paired) {
      await sendMessage(
        chatId,
        [
          'Este chat ainda não está ligado a nenhuma empresa.',
          '',
          'Abra o CalcárioFlow em Usuários e Acessos, toque em Conectar Telegram e me mande:',
          '/vincular SEUCODIGO'
        ].join('\n')
      );
    }
    return;
  }

  await touchLink(chatId);
  const ctx = buildContext(link);

  const agent = await loadAgentModules();
  if (agent.isCommand(text)) {
    const reply = await agent.runCommand(text, ctx);
    if (reply) {
      await saveChatTurn({
        chatId,
        companyId: link.companyId,
        userId: link.userId,
        userText: text,
        assistantText: reply.text
      });
      await deliver(chatId, link, reply);
      return;
    }
  }

  await sendChatAction(chatId, 'typing');

  let attachments: AgentAttachment[] = [];
  try {
    attachments = await collectAttachments(message);
  } catch (error: any) {
    await sendMessage(chatId, error?.message || 'Não consegui baixar esse arquivo.');
    return;
  }

  if (!text && !attachments.length) {
    await sendMessage(chatId, agent.HELP_TEXT);
    return;
  }

  try {
    const history = await loadChatHistory(chatId);
    const reply = await agent.runAgent({ text, attachments, history, ctx });
    await saveChatTurn({
      chatId,
      companyId: link.companyId,
      userId: link.userId,
      userText: text || (attachments.length ? '(áudio ou foto)' : ''),
      assistantText: reply.text
    });
    await deliver(chatId, link, reply);
  } catch (error: any) {
    console.error('[TELEGRAM] Falha no agente:', error);
    await sendMessage(
      chatId,
      [
        'A IA não respondeu agora. Os comandos diretos continuam funcionando:',
        '',
        agent.HELP_TEXT
      ].join('\n')
    );
  }
}

async function deliver(
  chatId: string,
  link: TelegramLink,
  reply: { text: string; pending?: { action: string; payload: any; summary: string } }
): Promise<void> {
  if (!reply.pending) {
    await sendMessage(chatId, reply.text);
    return;
  }

  const pendingId = await savePendingAction({
    chatId,
    companyId: link.companyId,
    userId: link.userId,
    action: reply.pending.action,
    payload: reply.pending.payload,
    summary: reply.pending.summary
  });

  const body = reply.text?.trim() && reply.text.trim() !== reply.pending.summary
    ? `${reply.text.trim()}\n\n${reply.pending.summary}`
    : reply.pending.summary;

  const confirmPrompt =
    reply.pending.action === 'criar_pedido_venda'
      ? 'Confere esses dados. Se estiver certo, toque em Confirmar. Aí eu gravo o pedido e mando o PDF.'
      : 'Confirma o lançamento?';

  await sendMessage(chatId, `${body}\n\n${confirmPrompt}`, [
    [
      { text: reply.pending.action === 'criar_pedido_venda' ? 'Confirmar pedido' : 'Confirmar', callback_data: `ok:${pendingId}` },
      { text: 'Cancelar', callback_data: `no:${pendingId}` }
    ]
  ]);
}

async function handleCallback(callback: any): Promise<void> {
  const chatId = String(callback.message?.chat?.id || '');
  const data = String(callback.data || '');
  const [verb, pendingId] = data.split(':');

  if (!chatId || !pendingId) {
    await answerCallbackQuery(callback.id, 'Não entendi esse botão.');
    return;
  }

  if (callback.message?.message_id) {
    await editMessageReplyMarkup(chatId, callback.message.message_id);
  }

  const link = await getLink(chatId);
  if (!link) {
    await answerCallbackQuery(callback.id, 'Chat não vinculado.');
    return;
  }

  const pending = await consumePendingAction(pendingId, chatId);
  if (!pending) {
    await answerCallbackQuery(callback.id, 'Essa confirmação expirou.');
    await sendMessage(chatId, 'Essa confirmação expirou ou já foi usada. Refaça o pedido, por favor.');
    return;
  }

  if (verb === 'no') {
    await answerCallbackQuery(callback.id, 'Cancelado.');
    await writeAudit({
      chatId,
      companyId: link.companyId,
      userId: link.userId,
      action: pending.action,
      payload: pending.payload,
      result: 'cancelado'
    });
    await sendMessage(chatId, 'Cancelado. Nada foi lançado.');
    return;
  }

  await answerCallbackQuery(callback.id, 'Lançando...');

  try {
    const { commitAction } = await loadAgentModules();
    const result = await commitAction(pending.action, pending.payload, buildContext(link));
    await writeAudit({
      chatId,
      companyId: link.companyId,
      userId: link.userId,
      action: pending.action,
      payload: { ...pending.payload, records: result.records },
      result: 'confirmado'
    });
    await sendMessage(chatId, result.message);
    if (result.document) {
      await sendChatAction(chatId, 'upload_document');
      try {
        await sendDocument(chatId, result.document, result.document.caption);
      } catch (error: any) {
        console.error('[TELEGRAM] Pedido gravado, PDF não saiu:', error);
        await sendMessage(
          chatId,
          'O pedido foi gravado no ERP, mas o PDF não foi. Abra o pedido no sistema e imprima por lá.'
        );
      }
    }
  } catch (error: any) {
    console.error('[TELEGRAM] Falha ao gravar:', error);
    await writeAudit({
      chatId,
      companyId: link.companyId,
      userId: link.userId,
      action: pending.action,
      payload: pending.payload,
      result: `erro: ${error?.message || 'desconhecido'}`
    });
    await sendMessage(chatId, `Não consegui lançar: ${error?.message || 'erro inesperado'}`);
  }
}

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'CalcárioFlow ERP - Agente Telegram',
      writes: writesEnabled() ? 'habilitadas' : 'somente consulta',
      timestamp: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  if (!webhookAuthorized(req)) {
    return res.status(401).json({ error: 'Webhook não autorizado.' });
  }

  const update = req.body || {};

  try {
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    const fresh = await claimUpdate(Number(update.update_id), chatId ? String(chatId) : undefined);
    if (!fresh) {
      // Reentrega do Telegram: já processamos este update.
      return res.status(200).json({ ok: true, duplicated: true });
    }

    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('[TELEGRAM] Erro no webhook:', error);

    // O update_id já foi marcado como processado, então o Telegram não reenvia:
    // sem este aviso o usuário ficaria esperando uma resposta que não vem.
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    if (chatId) {
      await sendMessage(String(chatId), 'Deu problema aqui no servidor e não consegui concluir. Tente de novo.').catch(
        () => undefined
      );
    }

    // 200 de propósito: erro nosso não deve virar reentrega infinita do Telegram.
    return res.status(200).json({ ok: false, error: error?.message || 'erro interno' });
  }
}
