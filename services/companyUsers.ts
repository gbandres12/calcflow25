import { isAuthUserId, planUserDedupe, type AppRecordRow } from './tenantMerge.js';

export type AuthUserInfo = {
  id: string;
  email: string;
  name?: string;
  created_at?: string;
  role?: string;
};

export type MembershipInfo = {
  user_id: string;
  role: string;
  company_id: string;
};

const DEMO_SEED_EMAIL_SUFFIX = '@calcarioflow.com.br';

export function isDemoSeedEmail(email: string): boolean {
  return String(email || '').trim().toLowerCase().endsWith(DEMO_SEED_EMAIL_SUFFIX);
}

export function userBelongsToCompany(row: AppRecordRow, companyId: string): boolean {
  if (row.table_name !== 'users' || row.id === '__seed__' || row.data?.__isSeedMeta) return false;
  if (String(row.company_id || '') === companyId) return true;
  return String(row.data?.companyId || '').trim() === companyId;
}

function emailOf(row: AppRecordRow): string {
  return String(row.data?.email || '').trim().toLowerCase();
}

export function planCompanyUserHeal(opts: {
  companyId: string;
  isDemo?: boolean;
  userRows: AppRecordRow[];
  memberships: MembershipInfo[];
  authUsers: AuthUserInfo[];
}) {
  const companyId = String(opts.companyId || '').trim();
  const isDemo = Boolean(opts.isDemo);
  const authByEmail: Record<string, string> = {};
  const authById = new Map<string, AuthUserInfo>();

  for (const user of opts.authUsers) {
    const email = String(user.email || '').trim().toLowerCase();
    if (email) authByEmail[email] = user.id;
    authById.set(user.id, user);
  }

  const companyMemberships = opts.memberships.filter((row) => row.company_id === companyId);
  const memberIds = new Set(companyMemberships.map((row) => row.user_id));
  const memberRole = new Map(companyMemberships.map((row) => [row.user_id, row.role]));

  const relevant = opts.userRows.filter((row) => userBelongsToCompany(row, companyId));
  const { keep, remove } = planUserDedupe(relevant, authByEmail);
  const byEmail = new Map<string, AppRecordRow>();

  for (const row of keep) {
    const email = emailOf(row);
    if (!email) continue;
    byEmail.set(email, row);
  }

  for (const membership of companyMemberships) {
    const auth = authById.get(membership.user_id);
    if (!auth) continue;
    const email = String(auth.email || '').trim().toLowerCase();
    if (!email || byEmail.has(email)) continue;
    byEmail.set(email, {
      id: auth.id,
      table_name: 'users',
      company_id: companyId,
      data: {
        id: auth.id,
        name: auth.name || email.split('@')[0],
        email,
        role: membership.role || 'Operador',
        status: 'Ativo',
        companyId
      }
    });
  }

  const users: any[] = [];
  const toUpsert: AppRecordRow[] = [];
  const toEnsureMembership: { userId: string; role: string }[] = [];
  const toRemove = remove.filter((row) => row.company_id === companyId && !isAuthUserId(row.id));
  const existingIds = new Set(
    opts.userRows.filter((row) => row.company_id === companyId).map((row) => row.id)
  );

  for (const [email, row] of byEmail) {
    const authId = authByEmail[email];
    if (!isDemo && isDemoSeedEmail(email) && !memberIds.has(row.id) && !memberIds.has(authId)) {
      if (row.company_id === companyId) toRemove.push(row);
      continue;
    }

    const id = authId || row.id;
    const role = memberRole.get(id) || row.data?.role || 'Operador';
    const auth = authById.get(id);
    const profile = {
      ...(row.data || {}),
      id,
      email,
      name: row.data?.name || auth?.name || email.split('@')[0],
      role,
      status: row.data?.status === 'Inativo' ? 'Inativo' : 'Ativo',
      companyId
    };

    users.push(profile);

    if (!existingIds.has(id) || String(row.company_id) !== companyId || (authId && row.id !== authId)) {
      toUpsert.push({
        id,
        table_name: 'users',
        company_id: companyId,
        data: profile,
        updated_at: new Date().toISOString()
      });
    }

    if (authId && !memberIds.has(authId)) {
      toEnsureMembership.push({ userId: authId, role: String(role) });
    }
  }

  users.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));

  return {
    users,
    toUpsert,
    toEnsureMembership,
    toRemove
  };
}
