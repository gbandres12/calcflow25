const API_BASE = 'https://api.telegram.org';

// O bot baixa arquivo de até 20 MB, o que cobre voz e foto com folga.
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function botToken(): string {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN não configurado no servidor.');
  return token;
}

async function callApi(method: string, body: any): Promise<any> {
  const response = await fetch(`${API_BASE}/bot${botToken()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const json = await response.json().catch(() => ({}));
  if (!json?.ok) {
    console.warn(`[TELEGRAM] ${method} falhou:`, json?.description || response.status);
  }
  return json;
}

export interface InlineButton {
  text: string;
  callback_data: string;
}

/**
 * Teclado fixo na parte inferior do Telegram (ReplyKeyboardMarkup),
 * no formato 3x2 limpo (idêntico ao modelo operacional solicitado).
 */
export const QUICK_REPLY_KEYBOARD = [
  [{ text: 'Novo Pedido' }, { text: 'Consultar Pedido' }],
  [{ text: 'Emitir NF-e' }, { text: 'Estoque' }],
  [{ text: 'Caixa hoje' }, { text: 'Cancelar' }]
];

export const DEFAULT_KEYBOARD_MARKUP = {
  keyboard: QUICK_REPLY_KEYBOARD,
  resize_keyboard: true,
  is_persistent: true,
  one_time_keyboard: false,
  input_field_placeholder: 'Escrever mensagem...'
};

export const BOT_MENU_COMMANDS = [
  { command: 'novo_pedido', description: 'Criar novo pedido de venda' },
  { command: 'vendas', description: 'Consultar últimos pedidos' },
  { command: 'nfe', description: 'Emitir NF-e de pedido ou avulsa' },
  { command: 'estoque', description: 'Posição atual do estoque' },
  { command: 'caixa', description: 'Resumo e saldo do caixa hoje' },
  { command: 'receber', description: 'Parcelas em aberto para dar baixa' },
  { command: 'danfe', description: 'Baixar PDF do DANFE de uma NF-e' },
  { command: 'ajuda', description: 'Ver atalhos e instruções' }
];

let menuCommandsConfigured = false;

export async function ensureBotMenuCommands(): Promise<void> {
  if (menuCommandsConfigured) return;
  menuCommandsConfigured = true;
  try {
    await callApi('setMyCommands', { commands: BOT_MENU_COMMANDS });
  } catch {
    menuCommandsConfigured = false;
  }
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  buttons?: InlineButton[][]
): Promise<void> {
  // Sem parse_mode de propósito: nome de cliente com _ ou * quebraria a mensagem.
  const replyMarkup = buttons?.length ? { inline_keyboard: buttons } : DEFAULT_KEYBOARD_MARKUP;

  await callApi('sendMessage', {
    chat_id: chatId,
    text: text.slice(0, 4000),
    reply_markup: replyMarkup
  });
}

export async function sendDocument(
  chatId: string | number,
  file: { bytes: Uint8Array; filename: string; mimeType?: string },
  caption?: string
): Promise<void> {
  const token = botToken();
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append(
    'document',
    new Blob([Buffer.from(file.bytes)], { type: file.mimeType || 'application/pdf' }),
    file.filename
  );
  if (caption) form.append('caption', caption.slice(0, 1024));
  form.append('reply_markup', JSON.stringify(DEFAULT_KEYBOARD_MARKUP));

  const response = await fetch(`${API_BASE}/bot${token}/sendDocument`, {
    method: 'POST',
    body: form
  });
  const json = await response.json().catch(() => ({}));
  if (!json?.ok) {
    console.warn('[TELEGRAM] sendDocument falhou:', json?.description || response.status);
    throw new Error(json?.description || 'Não consegui enviar o PDF.');
  }
}

export async function sendChatAction(chatId: string | number, action = 'typing'): Promise<void> {
  await callApi('sendChatAction', { chat_id: chatId, action });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await callApi('answerCallbackQuery', { callback_query_id: callbackQueryId, text: text?.slice(0, 200) });
}

export async function editMessageReplyMarkup(chatId: string | number, messageId: number): Promise<void> {
  await callApi('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
}

/** Baixa o arquivo do Telegram e devolve em base64, pronto para o inlineData do Gemini. */
export async function downloadFileAsBase64(
  fileId: string
): Promise<{ data: string; mimeType: string } | null> {
  const info = await callApi('getFile', { file_id: fileId });
  const filePath = info?.result?.file_path;
  if (!filePath) return null;

  if (Number(info.result.file_size || 0) > MAX_FILE_BYTES) {
    throw new Error('Arquivo grande demais para eu processar.');
  }

  const response = await fetch(`${API_BASE}/file/bot${botToken()}/${filePath}`);
  if (!response.ok) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  return { data: buffer.toString('base64'), mimeType: guessMimeType(filePath) };
}

function guessMimeType(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase() || '';
  switch (extension) {
    case 'oga':
    case 'ogg':
      return 'audio/ogg';
    case 'mp3':
      return 'audio/mp3';
    case 'm4a':
      return 'audio/mp4';
    case 'wav':
      return 'audio/wav';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

export async function setWebhook(url: string, secret: string): Promise<any> {
  return callApi('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true
  });
}

export async function getMe(): Promise<any> {
  return callApi('getMe', {});
}
