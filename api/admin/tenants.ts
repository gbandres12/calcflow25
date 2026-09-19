import { getAdminSupabaseConfigError } from '../_lib/supabaseAdmin.js';
import { requireCompanyAdmin } from '../_lib/companyAdmin.js';
import { planTenantCopy, planUserDedupe, summarizeTenantRecords, AppRecordRow } from '../../services/tenantMerge.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

async function loadRecords(admin: any, companyId?: string) {
  let query = admin.from('app_records').select('id, table_name, company_id, data, updated_at');
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query.limit(20000);
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []) as AppRecordRow[];
}

async function listAuthEmails(admin: any) {
  const authIdByEmail: Record<string, string> = {};
  let page = 1;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const users = data?.users || [];
    users.forEach((user: any) => {
      const email = String(user.email || '').trim().toLowerCase();
      if (email) authIdByEmail[email] = user.id;
    });
    if (users.length < 200) break;
    page += 1;
  }
  return authIdByEmail;
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const context = await requireCompanyAdmin(req, res);
  if (!context) return;

  try {
    if (req.method === 'GET') {
      const rows = await loadRecords(context.admin);
      const byCompany = new Map<string, AppRecordRow[]>();
      rows.forEach((row) => {
        const list = byCompany.get(row.company_id) || [];
        list.push(row);
        byCompany.set(row.company_id, list);
      });

      const { data: memberships } = await context.admin
        .from('company_memberships')
        .select('company_id, user_id, role');

      const tenants = Array.from(byCompany.entries()).map(([companyId, companyRows]) => {
        const summary = summarizeTenantRecords(companyRows);
        return {
          companyId,
          isDemo: companyId === 'matriz-demo',
          isCurrent: companyId === context.companyId,
          memberCount: (memberships || []).filter((row: any) => row.company_id === companyId).length,
          ...summary
        };
      }).sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.nfeOrders - a.nfeOrders);

      return res.status(200).json({
        currentCompanyId: context.companyId,
        tenants
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido.' });
    }

    const action = String(req.body?.action || '').trim();

    if (action === 'dedupe-users') {
      const companyId = String(req.body?.companyId || context.companyId).trim();
      const rows = (await loadRecords(context.admin, companyId)).filter((row) => row.table_name === 'users');
      const authIdByEmail = await listAuthEmails(context.admin);
      const { remove } = planUserDedupe(rows, authIdByEmail);
      for (const row of remove) {
        const { error } = await context.admin
          .from('app_records')
          .delete()
          .eq('table_name', 'users')
          .eq('company_id', companyId)
          .eq('id', row.id);
        if (error) throw new Error(error.message);
      }
      return res.status(200).json({
        ok: true,
        removed: remove.map((row) => ({ id: row.id, email: row.data?.email, name: row.data?.name }))
      });
    }

    if (action === 'merge') {
      const sourceCompanyId = String(req.body?.sourceCompanyId || '').trim();
      const targetCompanyId = String(req.body?.targetCompanyId || context.companyId).trim();
      if (!sourceCompanyId || !targetCompanyId) {
        return res.status(400).json({ error: 'Informe a pasta de origem e a pasta da CBA.' });
      }
      if (sourceCompanyId === targetCompanyId) {
        return res.status(400).json({ error: 'Origem e destino são a mesma pasta.' });
      }
      if (targetCompanyId === 'matriz-demo') {
        return res.status(400).json({ error: 'Não misture produção na base de demonstração.' });
      }

      const sourceRows = await loadRecords(context.admin, sourceCompanyId);
      const targetRows = await loadRecords(context.admin, targetCompanyId);
      const { toCopy, skipped } = planTenantCopy(sourceRows, targetRows);
      const now = new Date().toISOString();

      if (toCopy.length) {
        const payload = toCopy.map((row) => ({
          id: row.id,
          table_name: row.table_name,
          company_id: targetCompanyId,
          data: {
            ...(row.data || {}),
            id: row.data?.id || row.id,
            companyId: targetCompanyId
          },
          updated_at: now
        }));
        const { error } = await context.admin.from('app_records').upsert(payload, {
          onConflict: 'table_name,company_id,id'
        });
        if (error) throw new Error(error.message);
      }

      const { data: sourceMembers } = await context.admin
        .from('company_memberships')
        .select('company_id, user_id, role')
        .eq('company_id', sourceCompanyId);

      for (const member of sourceMembers || []) {
        await context.admin.from('company_memberships').upsert({
          company_id: targetCompanyId,
          user_id: member.user_id,
          role: member.role || 'Operador'
        }, { onConflict: 'company_id,user_id' });
      }

      return res.status(200).json({
        ok: true,
        copied: toCopy.length,
        skipped: skipped.length,
        sourceCompanyId,
        targetCompanyId,
        sourceKept: true
      });
    }

    return res.status(400).json({ error: 'Ação não reconhecida.' });
  } catch (error: any) {
    console.error('[ADMIN TENANTS]', error);
    return res.status(500).json({
      error: error?.message || getAdminSupabaseConfigError() || 'Falha ao consultar as pastas da empresa.'
    });
  }
}
