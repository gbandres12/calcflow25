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

/**
 * Filial sempre pendura na matriz: se o admin estiver com uma filial
 * selecionada no topo, sobe pro parent em vez de criar filial de filial.
 */
async function resolveMatrizId(admin: any, companyId: string): Promise<string> {
  const { data } = await admin
    .from('companies')
    .select('parent_company_id')
    .eq('id', companyId)
    .maybeSingle();
  return data?.parent_company_id || companyId;
}

/**
 * Emitente em branco: filial tem CNPJ, IE, endereço e certificado próprios.
 * Gravar isso já na criação evita que o app caia no DEFAULT_FISCAL_CONFIG
 * (CNPJ de exemplo) e a emissão fica travada até alguém preencher. O app
 * completa o resto (CFOP, CST, alíquotas) com o padrão em fiscalService.getConfig.
 */
const FISCAL_CONFIG_ID = 'fiscal-main-config';

function blankBranchFiscalConfig(companyId: string, name: string) {
  return {
    id: FISCAL_CONFIG_ID,
    companyId,
    apiKey: '',
    environment: 'sandbox',
    cnpjEmitente: '',
    inscricaoEstadual: '',
    inscricaoMunicipal: '',
    razaoSocial: '',
    nomeFantasia: name,
    telefoneEmitente: '',
    emailEmitente: '',
    logradouroEmitente: '',
    numeroEmitente: '',
    complementoEmitente: '',
    bairroEmitente: '',
    cidadeEmitente: '',
    ufEmitente: '',
    cepEmitente: '',
    ibgeEmitente: '',
    proxNumeroNFe: 1
  };
}

/**
 * Equipe compartilhada: quem ganha acesso numa empresa do grupo aparece
 * também na equipe dela, com o mesmo cadastro que já tem na matriz.
 */
async function shareUserRecord(admin: any, groupIds: string[], targetCompanyId: string, userId: string) {
  const { data } = await admin
    .from('app_records')
    .select('data')
    .eq('table_name', 'users')
    .eq('id', userId)
    .in('company_id', groupIds)
    .limit(1);
  const source = data?.[0]?.data;
  if (!source) return;
  const { passwordHash, ...rest } = source;
  const { error } = await admin.from('app_records').upsert({
    id: userId,
    table_name: 'users',
    company_id: targetCompanyId,
    data: { ...rest, companyId: targetCompanyId, updatedAt: new Date().toISOString() },
    updated_at: new Date().toISOString()
  }, { onConflict: 'table_name,company_id,id' });
  if (error) throw new Error(error.message);
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const context = await requireCompanyAdmin(req, res);
  if (!context) return;

  try {
    const matrizId = await resolveMatrizId(context.admin, context.companyId);

    if (req.method === 'GET') {
      const branches = await listBranches(context.admin, matrizId);
      return res.status(200).json({ companyId: matrizId, branches });
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
        parent_company_id: matrizId,
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

      const now = new Date().toISOString();
      const { error: fiscalError } = await context.admin.from('app_records').upsert({
        id: FISCAL_CONFIG_ID,
        table_name: 'fiscal_config',
        company_id: id,
        data: { ...blankBranchFiscalConfig(id, name), updatedAt: now },
        updated_at: now
      }, { onConflict: 'table_name,company_id,id' });
      if (fiscalError) throw new Error(fiscalError.message);

      await shareUserRecord(context.admin, [matrizId], id, context.userId);

      const branches = await listBranches(context.admin, matrizId);
      return res.status(201).json({ companyId: matrizId, branches });
    }

    if (action === 'grant-access' || action === 'revoke-access') {
      const targetCompanyId = String(req.body?.companyId || '').trim();
      const targetUserId = String(req.body?.userId || '').trim();
      if (!targetCompanyId || !targetUserId) {
        return res.status(400).json({ error: 'Informe a empresa e o usuário.' });
      }

      // Só quem administra a matriz ou já administra a
      // própria empresa/filial de destino pode gerir acesso nela.
      const { data: companyRow } = await context.admin
        .from('companies')
        .select('id, parent_company_id, owner_user_id')
        .eq('id', targetCompanyId)
        .maybeSingle();
      const isMatrizItself = targetCompanyId === matrizId;
      const isBranchOfMyMatriz = companyRow?.parent_company_id === matrizId;
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
        if (!isMatrizItself) {
          await context.admin
            .from('app_records')
            .delete()
            .eq('table_name', 'users')
            .eq('company_id', targetCompanyId)
            .eq('id', targetUserId);
        }
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
        if (!isMatrizItself) {
          await shareUserRecord(context.admin, [matrizId], targetCompanyId, targetUserId);
        }
      }

      const branches = await listBranches(context.admin, matrizId);
      return res.status(200).json({ companyId: matrizId, branches });
    }

    return res.status(400).json({ error: 'Ação não reconhecida.' });
  } catch (error: any) {
    console.error('[ADMIN COMPANIES]', error);
    return res.status(500).json({
      error: error?.message || getAdminSupabaseConfigError() || 'Falha ao gerir filiais e acessos.'
    });
  }
}
