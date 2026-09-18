import { getAdminSupabase, getAdminSupabaseConfigError } from '../_lib/supabaseAdmin.js';
import { createPairingCode, listLinks, revokeLink } from '../_lib/telegramStore.js';

export const config = { runtime: 'nodejs', maxDuration: 20 };

const ADMIN_ROLE = 'Administrador';

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'DELETE,GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function getBearerToken(req: any): string | null {
  const header = String(req.headers?.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

/**
 * Qualquer membro da empresa pode vincular o próprio Telegram; só o
 * administrador enxerga e revoga os chats dos outros.
 */
async function requireMember(req: any, res: any) {
  const admin = getAdminSupabase();
  if (!admin) {
    res.status(503).json({ error: getAdminSupabaseConfigError() || 'Configuração do Supabase indisponível no servidor.' });
    return null;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Sessão de acesso ausente.' });
    return null;
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    return null;
  }

  const { data: membership, error: membershipError } = await admin
    .from('company_memberships')
    .select('company_id, role')
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    res.status(403).json({ error: 'Usuário sem empresa vinculada.' });
    return null;
  }

  return {
    admin,
    userId: authData.user.id,
    companyId: membership.company_id as string,
    role: (membership.role as string) || 'Operador',
    isAdmin: membership.role === ADMIN_ROLE,
    email: authData.user.email || '',
    name: (authData.user.user_metadata as any)?.name || authData.user.email || 'Usuário'
  };
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const context = await requireMember(req, res);
  if (!context) return;

  try {
    if (req.method === 'GET') {
      const links = await listLinks(context.companyId);
      const visible = context.isAdmin ? links : links.filter((link) => link.userId === context.userId);
      return res.status(200).json({
        links: visible,
        botUsername: (process.env.TELEGRAM_BOT_USERNAME || '').trim() || null
      });
    }

    if (req.method === 'POST') {
      const profile = await loadErpProfile(context.admin, context.companyId, context.userId);
      const { code, expiresAt } = await createPairingCode({
        companyId: context.companyId,
        userId: context.userId,
        erpUserId: context.userId,
        displayName: profile?.name || context.name,
        role: profile?.role || context.role,
        permissions: profile?.permissions || {}
      });

      const botUsername = (process.env.TELEGRAM_BOT_USERNAME || '').trim();
      return res.status(201).json({
        code,
        expiresAt,
        botUsername: botUsername || null,
        deepLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : null
      });
    }

    if (req.method === 'DELETE') {
      const chatId = String(req.body?.chatId || '').trim();
      if (!chatId) return res.status(400).json({ error: 'Informe o chat que deve ser revogado.' });

      if (!context.isAdmin) {
        const links = await listLinks(context.companyId);
        const own = links.find((link) => link.chatId === chatId && link.userId === context.userId);
        if (!own) {
          return res.status(403).json({ error: 'Só o administrador pode revogar o Telegram de outro usuário.' });
        }
      }

      await revokeLink(context.companyId, chatId);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (error: any) {
    console.error('[TELEGRAM] Erro no pareamento:', error);
    return res.status(500).json({ error: error?.message || 'Falha ao processar o pareamento.' });
  }
}

async function loadErpProfile(admin: any, companyId: string, userId: string) {
  const { data } = await admin
    .from('app_records')
    .select('data')
    .eq('table_name', 'users')
    .eq('company_id', companyId)
    .eq('id', userId)
    .maybeSingle();
  return data?.data || null;
}
