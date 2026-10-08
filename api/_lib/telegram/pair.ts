import { requireMember } from '../telegramAuth.js';
import { createPairingCode, listLinks, revokeLink } from '../telegramStore.js';

export const config = { runtime: 'nodejs', maxDuration: 20 };

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'DELETE,GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
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
