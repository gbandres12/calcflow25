import { getAdminSupabase } from './supabaseAdmin.js';

export interface TelegramLink {
  chatId: string;
  companyId: string;
  userId: string;
  erpUserId?: string;
  displayName?: string;
  role: string;
  permissions: Record<string, boolean>;
}

export interface PendingAction {
  id: string;
  chatId: string;
  companyId: string;
  action: string;
  payload: any;
  summary?: string;
}

const PAIRING_TTL_MINUTES = 10;
const PENDING_TTL_MINUTES = 5;

// Sem 0/O/1/I: o código é lido em voz alta e digitado no celular.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function requireSupabase() {
  const supabase = getAdminSupabase();
  if (!supabase) throw new Error('Supabase não configurado no servidor.');
  return supabase;
}

function randomCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

const minutesFromNow = (minutes: number): string =>
  new Date(Date.now() + minutes * 60_000).toISOString();

const mapLink = (row: any): TelegramLink => ({
  chatId: String(row.chat_id),
  companyId: String(row.company_id),
  userId: String(row.user_id),
  erpUserId: row.erp_user_id || undefined,
  displayName: row.display_name || undefined,
  role: row.role || 'Operador',
  permissions: (row.permissions && typeof row.permissions === 'object' ? row.permissions : {}) as Record<
    string,
    boolean
  >
});

export async function createPairingCode(input: {
  companyId: string;
  userId: string;
  erpUserId?: string;
  displayName?: string;
  role?: string;
  permissions?: Record<string, boolean>;
}): Promise<{ code: string; expiresAt: string }> {
  const supabase = requireSupabase();
  const expiresAt = minutesFromNow(PAIRING_TTL_MINUTES);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode();
    const { error } = await supabase.from('telegram_pairing_codes').insert({
      code,
      company_id: input.companyId,
      user_id: input.userId,
      erp_user_id: input.erpUserId || null,
      display_name: input.displayName || null,
      role: input.role || 'Operador',
      permissions: input.permissions || {},
      expires_at: expiresAt
    });

    if (!error) return { code, expiresAt };
    // 23505 é colisão de chave primária: sorteia outro código.
    if (error.code !== '23505') throw new Error(`Falha ao gerar código: ${error.message}`);
  }

  throw new Error('Não foi possível gerar um código de pareamento. Tente de novo.');
}

export async function consumePairingCode(code: string, chatId: string): Promise<TelegramLink | null> {
  const supabase = requireSupabase();
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return null;

  // Marca o código como usado antes de criar o vínculo: se dois chats tentarem
  // o mesmo código ao mesmo tempo, só um passa desta linha.
  const { data, error } = await supabase
    .from('telegram_pairing_codes')
    .update({ used_at: new Date().toISOString(), used_by_chat_id: String(chatId) })
    .eq('code', clean)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('*')
    .maybeSingle();

  if (error || !data) return null;

  const { error: linkError } = await supabase.from('telegram_links').upsert(
    {
      chat_id: String(chatId),
      company_id: data.company_id,
      user_id: data.user_id,
      erp_user_id: data.erp_user_id,
      display_name: data.display_name,
      role: data.role,
      permissions: data.permissions || {},
      revoked_at: null,
      last_seen_at: new Date().toISOString()
    },
    { onConflict: 'chat_id' }
  );

  if (linkError) {
    // Devolve o código para o usuário poder tentar de novo.
    await supabase
      .from('telegram_pairing_codes')
      .update({ used_at: null, used_by_chat_id: null })
      .eq('code', clean);
    throw new Error(`Falha ao vincular o chat: ${linkError.message}`);
  }

  return mapLink({ ...data, chat_id: chatId });
}

export async function getLink(chatId: string): Promise<TelegramLink | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('telegram_links')
    .select('*')
    .eq('chat_id', String(chatId))
    .is('revoked_at', null)
    .maybeSingle();

  if (error || !data) return null;
  return mapLink(data);
}

export async function listLinks(companyId: string): Promise<(TelegramLink & { createdAt?: string; lastSeenAt?: string })[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('telegram_links')
    .select('*')
    .eq('company_id', companyId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Falha ao listar chats vinculados: ${error.message}`);
  return (data || []).map((row: any) => ({
    ...mapLink(row),
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  }));
}

export async function revokeLink(companyId: string, chatId: string): Promise<boolean> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from('telegram_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('chat_id', String(chatId));

  if (error) throw new Error(`Falha ao revogar o chat: ${error.message}`);
  return true;
}

export async function touchLink(chatId: string): Promise<void> {
  const supabase = requireSupabase();
  await supabase
    .from('telegram_links')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('chat_id', String(chatId));
}

/** Devolve false quando o update já foi processado (reentrega do Telegram). */
export async function claimUpdate(updateId: number, chatId?: string): Promise<boolean> {
  const supabase = requireSupabase();
  if (!Number.isFinite(updateId)) return true;

  const { error } = await supabase
    .from('telegram_updates')
    .insert({ update_id: updateId, chat_id: chatId ? String(chatId) : null });

  if (!error) return true;
  if (error.code === '23505') return false;
  // Falha de infraestrutura não pode travar o atendimento; segue sem a trava.
  console.warn('[TELEGRAM] Falha ao registrar update_id:', error.message);
  return true;
}

export async function savePendingAction(input: {
  chatId: string;
  companyId: string;
  userId?: string;
  action: string;
  payload: any;
  summary?: string;
}): Promise<string> {
  const supabase = requireSupabase();
  const id = `pa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const { error } = await supabase.from('telegram_pending_actions').insert({
    id,
    chat_id: String(input.chatId),
    company_id: input.companyId,
    user_id: input.userId || null,
    action: input.action,
    payload: input.payload,
    summary: input.summary || null,
    expires_at: minutesFromNow(PENDING_TTL_MINUTES)
  });

  if (error) throw new Error(`Falha ao guardar a confirmação: ${error.message}`);
  return id;
}

export async function consumePendingAction(id: string, chatId: string): Promise<PendingAction | null> {
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from('telegram_pending_actions')
    .select('*')
    .eq('id', id)
    .eq('chat_id', String(chatId))
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;

  // O update marca consumed_at só se ainda estiver nulo, então dois cliques
  // rápidos no Confirmar não viram dois lançamentos.
  const { data: claimed, error: claimError } = await supabase
    .from('telegram_pending_actions')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', id)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle();

  if (claimError || !claimed) return null;

  return {
    id: data.id,
    chatId: String(data.chat_id),
    companyId: String(data.company_id),
    action: data.action,
    payload: data.payload,
    summary: data.summary || undefined
  };
}

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

/** Últimas falas visíveis do chat, para o agente não tratar cada mensagem como conversa nova. */
export async function loadChatHistory(chatId: string, limit = 6): Promise<ChatTurn[]> {
  try {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('telegram_audit')
      .select('payload, result, created_at')
      .eq('chat_id', String(chatId))
      .eq('action', 'chat_turn')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data?.length) return [];

    const turns: ChatTurn[] = [];
    for (const row of [...data].reverse()) {
      const user = String(row.payload?.user || '').trim();
      const assistant = String(row.result || '').trim();
      if (user) turns.push({ role: 'user', text: user.slice(0, 800) });
      if (assistant) turns.push({ role: 'model', text: assistant.slice(0, 800) });
    }
    return turns;
  } catch (error: any) {
    console.warn('[TELEGRAM] Falha ao ler histórico:', error?.message);
    return [];
  }
}

export async function saveChatTurn(input: {
  chatId: string;
  companyId: string;
  userId?: string;
  userText: string;
  assistantText: string;
}): Promise<void> {
  const user = String(input.userText || '').trim();
  const assistant = String(input.assistantText || '').trim();
  if (!user && !assistant) return;
  await writeAudit({
    chatId: input.chatId,
    companyId: input.companyId,
    userId: input.userId,
    action: 'chat_turn',
    payload: { user: user.slice(0, 1000) },
    result: assistant.slice(0, 1000)
  });
}

export async function writeAudit(input: {
  chatId?: string;
  companyId: string;
  userId?: string;
  action: string;
  payload?: any;
  result?: string;
}): Promise<void> {
  try {
    const supabase = requireSupabase();
    await supabase.from('telegram_audit').insert({
      chat_id: input.chatId ? String(input.chatId) : null,
      company_id: input.companyId,
      user_id: input.userId || null,
      action: input.action,
      payload: input.payload || null,
      result: input.result || null
    });
  } catch (error: any) {
    console.warn('[TELEGRAM] Falha ao gravar auditoria:', error?.message);
  }
}
