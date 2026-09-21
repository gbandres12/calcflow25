import { requireCompanyAccess } from '../_lib/companyAdmin.js';
import { planCompanyUserHeal, type AuthUserInfo } from '../../services/companyUsers.js';
import { isAuthUserId } from '../../services/tenantMerge.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
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

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });

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
