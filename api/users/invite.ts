import { getAdminSupabase } from '../_lib/supabaseAdmin.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

const ADMIN_ROLE = 'Administrador';

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'DELETE,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function getBearerToken(req: any): string | null {
  const header = String(req.headers?.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

async function requireCompanyAdmin(req: any, res: any) {
  const token = getBearerToken(req);
  const admin = getAdminSupabase();
  if (!admin) {
    res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY não está configurada no servidor.' });
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

  const { data: membership, error: membershipError } = await admin
    .from('company_memberships')
    .select('company_id, role')
    .eq('user_id', authData.user.id)
    .eq('role', ADMIN_ROLE)
    .maybeSingle();

  if (membershipError || !membership) {
    res.status(403).json({ error: 'Apenas administradores da empresa podem gerir acessos.' });
    return null;
  }

  return { admin, userId: authData.user.id, companyId: membership.company_id };
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const context = await requireCompanyAdmin(req, res);
  if (!context) return;

  if (req.method === 'DELETE') {
    const targetId = String(req.body?.userId || '').trim();
    if (!targetId) return res.status(400).json({ error: 'Usuário não informado.' });
    if (targetId === context.userId) {
      return res.status(400).json({ error: 'Use outro administrador para remover o seu próprio acesso.' });
    }

    const { data: targetMembership } = await context.admin
      .from('company_memberships')
      .select('user_id')
      .eq('company_id', context.companyId)
      .eq('user_id', targetId)
      .maybeSingle();

    if (targetMembership) {
      const { error: deleteAuthError } = await context.admin.auth.admin.deleteUser(targetId);
      if (deleteAuthError) {
        return res.status(400).json({ error: `Não foi possível remover o acesso: ${deleteAuthError.message}` });
      }
    }

    const { error: deleteProfileError } = await context.admin
      .from('app_records')
      .delete()
      .eq('table_name', 'users')
      .eq('company_id', context.companyId)
      .eq('id', targetId);

    if (deleteProfileError) {
      return res.status(400).json({ error: `Acesso removido, mas o perfil não foi apagado: ${deleteProfileError.message}` });
    }
    return res.status(200).json({ ok: true });
  }

  const body = req.body || {};
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const role = String(body.role || 'Operador');
  const status = body.status === 'Inativo' ? 'Inativo' : 'Ativo';

  if (!name || !email || password.length < 6) {
    return res.status(400).json({ error: 'Nome, e-mail e senha com pelo menos 6 caracteres são obrigatórios.' });
  }

  const metadata = {
    name,
    companyId: context.companyId,
    companyName: String(body.companyName || '').trim(),
    cnpj: String(body.cnpj || '').trim(),
    phone: String(body.phone || '').trim(),
    jobTitle: String(body.jobTitle || '').trim(),
    role,
    onboardingCompleted: Boolean(body.onboardingCompleted),
    onboardingStep: Number(body.onboardingStep || 1),
    plan: body.plan || 'PRO'
  };

  const { data: created, error: createError } = await context.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata
  });

  if (createError || !created.user) {
    return res.status(400).json({ error: createError?.message || 'Não foi possível criar o acesso.' });
  }

  const profile = {
    id: created.user.id,
    name,
    email,
    role,
    status,
    companyId: context.companyId,
    companyName: metadata.companyName,
    cnpj: metadata.cnpj,
    phone: metadata.phone,
    jobTitle: metadata.jobTitle,
    onboardingCompleted: metadata.onboardingCompleted,
    onboardingStep: metadata.onboardingStep,
    createdAt: created.user.created_at,
    lastAccess: created.user.created_at,
    plan: metadata.plan,
    permissions: body.permissions
  };

  const { error: profileError } = await context.admin
    .from('app_records')
    .upsert({
      id: created.user.id,
      table_name: 'users',
      company_id: context.companyId,
      data: profile,
      updated_at: new Date().toISOString()
    }, { onConflict: 'table_name,company_id,id' });

  if (profileError) {
    await context.admin.auth.admin.deleteUser(created.user.id);
    return res.status(500).json({ error: `Não foi possível salvar o perfil: ${profileError.message}` });
  }

  return res.status(201).json({ user: profile });
}
