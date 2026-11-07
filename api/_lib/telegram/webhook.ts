import { getTable, upsert } from '../erpRepository.js';
import {
  InlineButton,
  answerCallbackQuery,
  downloadFileAsBase64,
  editMessageReplyMarkup,
  ensureBotMenuCommands,
  sendChatAction,
  sendDocument,
  sendMessage
} from '../telegramApi.js';
import {
  TelegramLink,
  claimUpdate,
  consumeLatestPending,
  consumePairingCode,
  consumePendingAction,
  getLink,
  loadChatHistory,
  saveChatTurn,
  savePendingAction,
  touchLink,
  writeAudit
} from '../telegramStore.js';
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
    import('../../../services/agent/commands.js'),
    import('../../../services/agent/runAgent.js'),
    import('../../../services/agent/tools.js')
  ]);
  return {
    HELP_TEXT: commands.HELP_TEXT,
    isCommand: commands.isCommand,
    runCommand: commands.runCommand,
    runAgent: runAgentMod.runAgent,
    commitAction: toolsMod.commitAction
  };
}

export const config = { runtime: 'nodejs', maxDuration: 60 };

const repo = { getTable, upsert };

const writesEnabled = (): boolean =>
  String(process.env.TELEGRAM_AGENT_WRITES || '').trim().toLowerCase() === 'true';

function webhookAuthorized(req: any): boolean {
  const expected = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (!expected) return true;
  const received = String(req.headers['x-telegram-bot-api-secret-token'] || '').trim();
  return received === expected;
}

const todayInBrazil = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

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
    today: todayInBrazil()
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

  if (isAffirmative(text)) {
    const pending = await consumeLatestPending(chatId);
    if (pending) {
      await fulfillPending(chatId, link, pending);
      return;
    }
  }

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
      'Não fechei essa agora. Manda de novo o produto certinho (como está no estoque), quantidade e preço.'
    );
  }
}

async function deliver(
  chatId: string,
  link: TelegramLink,
  reply: {
    text: string;
    pending?: { action: string; payload: any; summary: string };
    document?: { filename: string; bytes: Uint8Array; caption: string };
    buttons?: InlineButton[][];
  }
): Promise<void> {
  if (!reply.pending) {
    await sendMessage(chatId, reply.text, reply.buttons);
    if (reply.document) {
      await sendChatAction(chatId, 'upload_document');
      await sendDocument(chatId, reply.document, reply.document.caption);
    }
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

  const isNfe = reply.pending.action === 'emitir_nfe_pedido' || reply.pending.action === 'emitir_nfe_avulsa';
  const confirmPrompt =
    reply.pending.action === 'criar_pedido_venda'
      ? 'Confere esses dados. Se estiver certo, toque em Confirmar. Aí eu gravo o pedido e mando o PDF.'
      : isNfe
        ? body.includes('Emitir NF-e')
          ? ''
          : 'Confere esses dados. Se estiver certo, toque em Emitir NF-e. A nota vai para a SEFAZ e não tem como desfazer pelo chat.'
        : 'Confirma o lançamento?';

  const confirmLabel =
    reply.pending.action === 'criar_pedido_venda'
      ? 'Confirmar pedido'
      : isNfe
        ? 'Emitir NF-e'
        : 'Confirmar';

  const fullText = confirmPrompt ? `${body}\n\n${confirmPrompt}` : body;

  await sendMessage(chatId, fullText, [
    [
      { text: confirmLabel, callback_data: `ok:${pendingId}` },
      { text: 'Cancelar', callback_data: `no:${pendingId}` }
    ]
  ]);
}

async function handleCallback(callback: any): Promise<void> {
  const chatId = String(callback.message?.chat?.id || '');
  const data = String(callback.data || '');
  const parts = data.split(':');
  const verb = parts[0];
  const rest = parts.slice(1).join(':');

  if (!chatId || !verb || !rest) {
    await answerCallbackQuery(callback.id, 'Não entendi esse botão.');
    return;
  }

  const link = await getLink(chatId);
  if (!link) {
    await answerCallbackQuery(callback.id, 'Chat não vinculado.');
    return;
  }

  await touchLink(chatId);

  // Atalhos rápidos inline (ex: cmd:nfe:PED-2026-0064, cmd:novo_pedido, pay:tx-123:160.00)
  if (verb === 'cmd' || verb === 'pay') {
    await answerCallbackQuery(callback.id, 'Carregando...');
    const ctx = buildContext(link);
    const agent = await loadAgentModules();

    let cmdText = '';
    if (verb === 'cmd') {
      const [subCmd, ...argParts] = rest.split(':');
      const arg = argParts.join(':').trim();
      cmdText = arg ? `/${subCmd} ${arg}` : `/${subCmd}`;
    } else {
      const [parcelaId, amount] = rest.split(':');
      cmdText = `/baixar ${parcelaId} ${amount}`;
    }

    const reply = await agent.runCommand(cmdText, ctx);
    if (reply) {
      await saveChatTurn({
        chatId,
        companyId: link.companyId,
        userId: link.userId,
        userText: cmdText,
        assistantText: reply.text
      });
      await deliver(chatId, link, reply);
    }
    return;
  }

  const pendingId = rest;

  if (callback.message?.message_id) {
    await editMessageReplyMarkup(chatId, callback.message.message_id);
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
  await fulfillPending(chatId, link, pending);
}

function isAffirmative(text: string): boolean {
  const clean = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .trim();
  return /^(ok|sim|s|pode|fechou|isso|confirmo|confirmado|confirma|pode confirmar|pode mandar|manda|isso mesmo|pode gravar)$/.test(
    clean
  );
}

function buildPostActionButtons(action: string, message: string): InlineButton[][] | undefined {
  const refMatch = String(message || '').match(/\b((?:PED|AVU)-\d{4}-\d{4,})\b/);
  const orderRef = refMatch ? refMatch[1] : null;

  if (action === 'criar_pedido_venda' && orderRef) {
    return [
      [
        { text: `📄 Emitir NF-e (${orderRef})`, callback_data: `cmd:nfe:${orderRef}`.slice(0, 64) },
        { text: `💵 Dar baixa (${orderRef})`, callback_data: `cmd:receber:${orderRef}`.slice(0, 64) }
      ],
      [{ text: '🛒 Novo Pedido', callback_data: 'cmd:novo_pedido' }]
    ];
  }

  if ((action === 'emitir_nfe_pedido' || action === 'emitir_nfe_avulsa') && orderRef) {
    return [
      [
        { text: `📥 Baixar DANFE (${orderRef})`, callback_data: `cmd:danfe:${orderRef}`.slice(0, 64) },
        { text: '🛒 Novo Pedido', callback_data: 'cmd:novo_pedido' }
      ]
    ];
  }

  if (action === 'registrar_recebimento' || action === 'registrar_abatimento') {
    return [
      [
        { text: '📥 Ver Contas a Receber', callback_data: 'cmd:receber' },
        { text: '💰 Ver Saldo / Caixa', callback_data: 'cmd:saldo' }
      ]
    ];
  }

  return undefined;
}

async function fulfillPending(chatId: string, link: TelegramLink, pending: { action: string; payload: any }): Promise<void> {
  try {
    const isNfe = pending.action === 'emitir_nfe_pedido' || pending.action === 'emitir_nfe_avulsa';
    if (isNfe) {
      await sendChatAction(chatId, 'typing');
      await sendMessage(chatId, 'Enviando a NF-e para a SEFAZ. Isso pode levar uns segundos.');
    }
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
    const followUpButtons = buildPostActionButtons(pending.action, result.message);
    await sendMessage(chatId, result.message, followUpButtons);
    if (result.document) {
      await sendChatAction(chatId, 'upload_document');
      try {
        await sendDocument(chatId, result.document, result.document.caption);
      } catch (error: any) {
        console.error('[TELEGRAM] Pedido gravado, PDF não saiu:', error);
        await sendMessage(
          chatId,
          isNfe
            ? 'A NF-e foi transmitida, mas o DANFE não saiu agora. Baixe no ERP, em Fiscal.'
            : 'O pedido foi gravado no ERP, mas o PDF não foi. Abra o pedido no sistema e imprima por lá.'
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
    await ensureBotMenuCommands().catch(() => undefined);
    return res.status(200).json({
      status: 'ok',
      service: 'CalcárioFlow ERP - Agente Telegram',
      writes: writesEnabled() ? 'habilitadas' : 'somente consulta',
      quickButtons: true,
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
    ensureBotMenuCommands().catch(() => undefined);
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
