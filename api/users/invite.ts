import { requireCompanyAccess, requireCompanyAdmin } from '../_lib/companyAdmin.js';
import { planCompanyUserHeal, type AuthUserInfo } from '../../services/companyUsers.js';
import { isAuthUserId } from '../../services/tenantMerge.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'DELETE,GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

async function listAuthUsers(admin: any): Promise<AuthUserInfo[]> {
  const users: AuthUserInfo[] = [];
  let page = 1;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const batch = data?.users || [];
    batch.forEach((user: any) => {
      const email = String(user.email || '').trim().toLowerCase();
      if (!email) return;
      users.push({
        id: user.id,
        email,
        name: user.user_metadata?.name || '',
        created_at: user.created_at,
        role: user.user_metadata?.role || ''
      });
    });
    if (batch.length < 200) break;
    page += 1;
  }
  return users;
}

async function listCompanyUsers(req: any, res: any) {
  const context = await requireCompanyAccess(req, res);
  if (!context) return;

  try {
    const [{ data: userRows, error: userError }, { data: memberships, error: membershipError }, authUsers] = await Promise.all([
      context.admin.from('app_records').select('id, table_name, company_id, data, updated_at').eq('table_name', 'users').limit(20000),
      context.admin.from('company_memberships').select('company_id, user_id, role'),
      listAuthUsers(context.admin)
    ]);

    if (userError) throw new Error(userError.message);
    if (membershipError) throw new Error(membershipError.message);

    const plan = planCompanyUserHeal({
      companyId: context.companyId,
      isDemo: context.companyId === 'matriz-demo',
      userRows: Array.isArray(userRows) ? userRows : [],
      memberships: Array.isArray(memberships) ? memberships : [],
      authUsers
    });

    for (const row of plan.toUpsert) {
      const { error } = await context.admin.from('app_records').upsert({
        id: row.id,
        table_name: 'users',
        company_id: context.companyId,
        data: row.data,
        updated_at: new Date().toISOString()
      }, { onConflict: 'table_name,company_id,id' });
      if (error) throw new Error(error.message);
    }

    for (const row of plan.toRemove) {
      await context.admin
        .from('app_records')
        .delete()
        .eq('table_name', 'users')
        .eq('company_id', context.companyId)
        .eq('id', row.id);
    }

    for (const member of plan.toEnsureMembership) {
      const { error } = await context.admin.from('company_memberships').upsert({
        company_id: context.companyId,
        user_id: member.userId,
        role: member.role
      }, { onConflict: 'company_id,user_id' });
      if (error) throw new Error(error.message);
    }

    for (const profile of plan.users) {
      if (!isAuthUserId(String(profile.id || ''))) continue;
      const existing = await context.admin.auth.admin.getUserById(profile.id);
      if (!existing.data?.user) continue;
      const metadata = existing.data.user.user_metadata || {};
      if (
        metadata.companyId === context.companyId
        && metadata.role === profile.role
        && metadata.name === profile.name
      ) {
        continue;
      }
      await context.admin.auth.admin.updateUserById(profile.id, {
        user_metadata: {
          ...metadata,
          companyId: context.companyId,
          name: profile.name || metadata.name,
          role: profile.role || metadata.role
        }
      });
    }

    return res.status(200).json({
      companyId: context.companyId,
      users: plan.users,
      healed: plan.toUpsert.length + plan.toEnsureMembership.length
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Não foi possível listar a equipe.' });
  }
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
  if (req.method === 'GET') {
    return listCompanyUsers(req, res);
  }
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

      // Build the update payload for Auth
      const authUpdate: Record<string, any> = {
        user_metadata: {
          ...(existingAuth.user_metadata || {}),
          name,
          companyId: context.companyId,
          companyName: profile.companyName,
          role
        }
      };
      // If admin provided a new password, update it directly via Admin API (no email required)
      if (password && password.length >= 6) {
        authUpdate.password = password;
      }

      await context.admin.auth.admin.updateUserById(existingAuth.id, authUpdate);
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
