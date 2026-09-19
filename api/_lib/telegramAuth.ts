import { getAdminSupabase, getAdminSupabaseConfigError } from './supabaseAdmin.js';

const ADMIN_ROLE = 'Administrador';

export interface MemberContext {
  admin: any;
  userId: string;
  companyId: string;
  role: string;
  isAdmin: boolean;
  email: string;
  name: string;
}

function getBearerToken(req: any): string | null {
  const header = String(req.headers?.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

/**
 * Sessão do Supabase Auth resolvida para a empresa do usuário, no mesmo
 * padrão do api/users/invite.ts. Devolve null e já responde o erro.
 */
export async function requireMember(req: any, res: any): Promise<MemberContext | null> {
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
