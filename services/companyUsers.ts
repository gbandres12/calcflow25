import { type AppRecordRow } from './tenantMerge.js';

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

function pickDisplayCache(rows: AppRecordRow[], companyId: string, userId: string, email: string) {
  const matches = rows.filter((row) => {
    if (!userBelongsToCompany(row, companyId)) return false;
    if (String(row.id) === userId) return true;
    return Boolean(email) && emailOf(row) === email;
  });
  return matches.find((row) => String(row.company_id) === companyId) || matches[0] || null;
}

function displayCacheStale(existing: AppRecordRow | null, profile: Record<string, any>, companyId: string) {
  if (!existing || String(existing.company_id) !== companyId || String(existing.id) !== profile.id) return true;
  const data = existing.data || {};
  return (
    String(data.email || '').trim().toLowerCase() !== profile.email
    || String(data.name || '') !== String(profile.name || '')
    || String(data.role || '') !== String(profile.role || '')
    || String(data.companyId || '') !== companyId
    || String(data.status || '') !== String(profile.status || '')
  );
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
  const authById = new Map(opts.authUsers.map((user) => [user.id, user]));
  const companyMemberships = opts.memberships.filter((row) => row.company_id === companyId);
  const memberIds = new Set(companyMemberships.map((row) => row.user_id));
  const memberEmails = new Set<string>();

  const users: any[] = [];
  const toUpsert: AppRecordRow[] = [];

  for (const membership of companyMemberships) {
    const auth = authById.get(membership.user_id);
    if (!auth) continue;
    const email = String(auth.email || '').trim().toLowerCase();
    if (!email) continue;
    if (!isDemo && isDemoSeedEmail(email)) continue;
    memberEmails.add(email);

    const cache = pickDisplayCache(opts.userRows, companyId, membership.user_id, email);
    const profile = {
      ...(cache?.data || {}),
      id: membership.user_id,
      email,
      name: cache?.data?.name || auth.name || email.split('@')[0],
      role: membership.role || 'Operador',
      status: cache?.data?.status === 'Inativo' ? 'Inativo' : 'Ativo',
      companyId
    };

    users.push(profile);

    if (displayCacheStale(cache, profile, companyId)) {
      toUpsert.push({
        id: membership.user_id,
        table_name: 'users',
        company_id: companyId,
        data: profile,
        updated_at: new Date().toISOString()
      });
    }
  }

  const toRemove = opts.userRows.filter((row) => {
    if (String(row.company_id) !== companyId) return false;
    if (row.id === '__seed__' || row.data?.__isSeedMeta) return false;
    if (row.table_name !== 'users') return false;
    if (memberIds.has(row.id)) return false;
    const email = emailOf(row);
    if (email && memberEmails.has(email)) return false;
    return true;
  });

  users.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));

  return {
    users,
    toUpsert,
    toEnsureMembership: [] as { userId: string; role: string }[],
    toRemove
  };
}
