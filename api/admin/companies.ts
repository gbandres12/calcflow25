import { getAdminSupabaseConfigError } from '../_lib/supabaseAdmin.js';
import { requireCompanyAdmin } from '../_lib/companyAdmin.js';
import { newId } from '../../services/ids.js';
import { buildFullAccessPermissions } from '../../services/companyPermissions.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

/**
 * "Minhas empresas" pra essa tela: a própria empresa do admin (matriz, mesmo
 * que ainda não tenha uma linha em public.companies) + toda filial que
 * aponte pra ela em parent_company_id.
 */
async function listBranches(admin: any, companyId: string) {
  const { data: companies, error } = await admin
    .from('companies')
    .select('id, name, parent_company_id, owner_user_id, is_active, created_at')
    .or(`id.eq.${companyId},parent_company_id.eq.${companyId}`);
  if (error) throw new Error(error.message);

  const ids = Array.from(new Set([companyId, ...(companies || []).map((c: any) => c.id)]));
  const { data: memberships, error: membershipError } = await admin
    .from('company_memberships')
    .select('company_id, user_id, role, permissions')
    .in('company_id', ids);
  if (membershipError) throw new Error(membershipError.message);

  const membersByCompany = new Map<string, any[]>();
  (memberships || []).forEach((row: any) => {
    const list = membersByCompany.get(row.company_id) || [];
    list.push(row);
    membersByCompany.set(row.company_id, list);
  });

  const userIds: string[] = Array.from(new Set((memberships || []).map((row: any) => String(row.user_id))));
  const namesById: Record<string, { name?: string; email?: string }> = {};
  await Promise.all(userIds.map(async (uid: string) => {
    const { data } = await admin.auth.admin.getUserById(uid);
    if (data?.user) {
      namesById[uid] = { name: data.user.user_metadata?.name, email: data.user.email };
    }
  }));

  const known = companies || [];
  const hasMatrizRow = known.some((c: any) => c.id === companyId);
  const rows = hasMatrizRow ? known : [{ id: companyId, name: null, parent_company_id: null, owner_user_id: null, is_active: true, created_at: null }, ...known];

  return rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    parentCompanyId: row.parent_company_id,
    ownerUserId: row.owner_user_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    isBranch: row.id !== companyId,
    members: (membersByCompany.get(row.id) || []).map((member: any) => ({
      userId: member.user_id,
      role: member.role,
      permissions: member.permissions || {},
      name: namesById[member.user_id]?.name,
      email: namesById[member.user_id]?.email
    }))
  }));
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const context = await requireCompanyAdmin(req, res);
  if (!context) return;

  try {
    if (req.method === 'GET') {
      const branches = await listBranches(context.admin, context.companyId);
      return res.status(200).json({ companyId: context.companyId, branches });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido.' });
    }

    const action = String(req.body?.action || '').trim();

    if (action === 'create-branch') {
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Informe o nome da filial.' });

      const id = newId('filial');
      const { error } = await context.admin.from('companies').insert({
        id,
        name,
        parent_company_id: context.companyId,
        owner_user_id: context.userId,
        is_active: true
      });
      if (error) throw new Error(error.message);

      // Quem criou a filial fica com acesso total nela — precisa disso pra
      // conseguir configurar e delegar o resto pelo front.
      const { error: membershipError } = await context.admin.from('company_memberships').upsert({
        company_id: id,
        user_id: context.userId,
        role: 'Administrador',
        permissions: buildFullAccessPermissions()
      }, { onConflict: 'company_id,user_id' });
      if (membershipError) throw new Error(membershipError.message);

      const branches = await listBranches(context.admin, context.companyId);
      return res.status(201).json({ companyId: context.companyId, branches });
    }

    if (action === 'grant-access' || action === 'revoke-access') {
      const targetCompanyId = String(req.body?.companyId || '').trim();
      const targetUserId = String(req.body?.userId || '').trim();
      if (!targetCompanyId || !targetUserId) {
        return res.status(400).json({ error: 'Informe a empresa e o usuário.' });
      }

      // Só quem administra a matriz (context.companyId) ou já administra a
      // própria empresa/filial de destino pode gerir acesso nela.
      const { data: companyRow } = await context.admin
        .from('companies')
        .select('id, parent_company_id, owner_user_id')
        .eq('id', targetCompanyId)
        .maybeSingle();
      const isMatrizItself = targetCompanyId === context.companyId;
      const isBranchOfMyMatriz = companyRow?.parent_company_id === context.companyId;
      const isOwner = companyRow?.owner_user_id === context.userId;

      const { data: callerMembership } = await context.admin
        .from('company_memberships')
        .select('role')
        .eq('company_id', targetCompanyId)
        .eq('user_id', context.userId)
        .maybeSingle();
      const isAdminThere = callerMembership?.role === 'Administrador';

      if (!isMatrizItself && !isBranchOfMyMatriz && !isOwner && !isAdminThere) {
        return res.status(403).json({ error: 'Sem permissão para gerir acessos dessa empresa.' });
      }

      if (action === 'revoke-access') {
        if (targetUserId === context.userId) {
          return res.status(400).json({ error: 'Use outro administrador pra remover o seu próprio acesso.' });
        }
        const { error } = await context.admin
          .from('company_memberships')
          .delete()
          .eq('company_id', targetCompanyId)
          .eq('user_id', targetUserId);
        if (error) throw new Error(error.message);
      } else {
        const role = String(req.body?.role || 'Operador');
        const permissions = req.body?.permissions && typeof req.body.permissions === 'object'
          ? req.body.permissions
          : {};
        const { error } = await context.admin.from('company_memberships').upsert({
          company_id: targetCompanyId,
          user_id: targetUserId,
          role,
          permissions
        }, { onConflict: 'company_id,user_id' });
        if (error) throw new Error(error.message);
      }

      const branches = await listBranches(context.admin, context.companyId);
      return res.status(200).json({ companyId: context.companyId, branches });
    }

    return res.status(400).json({ error: 'Ação não reconhecida.' });
  } catch (error: any) {
    console.error('[ADMIN COMPANIES]', error);
    return res.status(500).json({
      error: error?.message || getAdminSupabaseConfigError() || 'Falha ao gerir filiais e acessos.'
    });
  }
}
