import { requireCompanyAdmin } from '../_lib/companyAdmin.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'DELETE,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

async function findAuthUserByEmail(admin: any, email: string) {
  let page = 1;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const found = (data?.users || []).find((user: any) => String(user.email || '').toLowerCase() === email);
    if (found) return found;
    if ((data?.users || []).length < 200) return null;
    page += 1;
  }
  return null;
}

async function upsertProfile(admin: any, companyId: string, profile: any) {
  const { error } = await admin.from('app_records').upsert({
    id: profile.id,
    table_name: 'users',
    company_id: companyId,
    data: profile,
    updated_at: new Date().toISOString()
  }, { onConflict: 'table_name,company_id,id' });
  if (error) throw new Error(error.message);
}

async function ensureMembership(admin: any, companyId: string, userId: string, role: string) {
  const { error } = await admin.from('company_memberships').upsert({
    company_id: companyId,
    user_id: userId,
    role
  }, { onConflict: 'company_id,user_id' });
  if (error) throw new Error(error.message);
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
      await context.admin
        .from('company_memberships')
        .delete()
        .eq('company_id', context.companyId)
        .eq('user_id', targetId);
    }

    const { error: deleteProfileError } = await context.admin
      .from('app_records')
      .delete()
      .eq('table_name', 'users')
      .eq('company_id', context.companyId)
      .eq('id', targetId);

    if (deleteProfileError) {
      return res.status(400).json({ error: `Não foi possível apagar o perfil: ${deleteProfileError.message}` });
    }
    return res.status(200).json({ ok: true });
  }

  const body = req.body || {};
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const role = String(body.role || 'Operador');
  const status = body.status === 'Inativo' ? 'Inativo' : 'Ativo';

  if (!name || !email) {
    return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
  }

  const existingAuth = await findAuthUserByEmail(context.admin, email);
  if (existingAuth) {
    const profile = {
      id: existingAuth.id,
      name,
      email,
      role,
      status,
      companyId: context.companyId,
      companyName: String(body.companyName || '').trim(),
      cnpj: String(body.cnpj || '').trim(),
      phone: String(body.phone || '').trim(),
      jobTitle: String(body.jobTitle || '').trim(),
      onboardingCompleted: Boolean(body.onboardingCompleted),
      onboardingStep: Number(body.onboardingStep || 1),
      createdAt: existingAuth.created_at,
      lastAccess: existingAuth.last_sign_in_at || existingAuth.created_at,
      plan: body.plan || 'PRO',
      permissions: body.permissions
    };
    try {
      await ensureMembership(context.admin, context.companyId, existingAuth.id, role);
      await upsertProfile(context.admin, context.companyId, profile);
      await context.admin.auth.admin.updateUserById(existingAuth.id, {
        user_metadata: {
          ...(existingAuth.user_metadata || {}),
          name,
          companyId: context.companyId,
          companyName: profile.companyName,
          role
        }
      });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Não foi possível atualizar o acesso existente.' });
    }
    return res.status(200).json({ user: profile, existing: true });
  }

  if (password.length < 6) {
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

  try {
    await ensureMembership(context.admin, context.companyId, created.user.id, role);
    await upsertProfile(context.admin, context.companyId, profile);
  } catch (error: any) {
    await context.admin.auth.admin.deleteUser(created.user.id);
    return res.status(500).json({ error: `Não foi possível salvar o perfil: ${error?.message || error}` });
  }

  return res.status(201).json({ user: profile });
}
