import { getAdminSupabase, getAdminSupabaseConfigError } from './supabaseAdmin.js';
import { pickAdminMembership, pickMembershipCompanyId, MembershipRow } from '../../services/membershipCompany.js';

export const ADMIN_ROLE = 'Administrador';

export function getBearerToken(req: any): string | null {
  const header = String(req.headers?.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

async function loadCompanyContext(req: any, res: any, forbiddenMessage: string) {
  const token = getBearerToken(req);
  const admin = getAdminSupabase();
  if (!admin) {
    res.status(503).json({ error: getAdminSupabaseConfigError() || 'Configuração do Supabase indisponível no servidor.' });
    return null;
  }
  if (!token) {
    res.status(401).json({ error: 'Sessão de acesso ausente.' });
    return null;
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    return null;
  }

  const { data: memberships, error: membershipError } = await admin
    .from('company_memberships')
    .select('company_id, role, created_at')
    .eq('user_id', authData.user.id);

  if (membershipError || !Array.isArray(memberships) || memberships.length === 0) {
    res.status(403).json({ error: forbiddenMessage });
    return null;
  }

  return { admin, authData, memberships: memberships as MembershipRow[] };
}

export async function requireCompanyAccess(req: any, res: any) {
  const loaded = await loadCompanyContext(req, res, 'A conta autenticada não está vinculada a uma empresa.');
  if (!loaded) return null;

  const preferred =
    String(req.body?.companyId || req.query?.companyId || '').trim() ||
    String(loaded.authData.user.user_metadata?.companyId || '').trim();
  const companyId = pickMembershipCompanyId(loaded.memberships, preferred);
  const membership = loaded.memberships.find((row) => row.company_id === companyId);
  if (!companyId || !membership) {
    res.status(403).json({ error: 'A conta autenticada não está vinculada a uma empresa.' });
    return null;
  }

  return {
    admin: loaded.admin,
    userId: loaded.authData.user.id,
    companyId,
    role: membership.role,
    email: loaded.authData.user.email || '',
    metadataCompanyId: String(loaded.authData.user.user_metadata?.companyId || '')
  };
}

export async function requireCompanyAdmin(req: any, res: any) {
  const loaded = await loadCompanyContext(req, res, 'Apenas administradores da empresa podem gerir acessos.');
  if (!loaded) return null;

  const preferred =
    String(req.body?.companyId || req.query?.companyId || '').trim() ||
    String(loaded.authData.user.user_metadata?.companyId || '').trim();
  const membership = pickAdminMembership(loaded.memberships, preferred);
  if (!membership || membership.role !== ADMIN_ROLE) {
    res.status(403).json({ error: 'Apenas administradores da empresa podem gerir acessos.' });
    return null;
  }

  return {
    admin: loaded.admin,
    userId: loaded.authData.user.id,
    companyId: membership.company_id,
    email: loaded.authData.user.email || '',
    metadataCompanyId: String(loaded.authData.user.user_metadata?.companyId || '')
  };
}
