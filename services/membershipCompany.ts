export type MembershipRow = {
  company_id: string;
  created_at?: string;
  role?: string;
};

const ADMIN_ROLE = 'Administrador';

export function pickMembershipCompanyId(
  memberships: MembershipRow[],
  preferredCompanyId?: string | null
): string | null {
  if (!memberships.length) return null;
  const preferred = String(preferredCompanyId || '').trim();
  if (preferred) {
    const hit = memberships.find((row) => row.company_id === preferred);
    if (hit) return hit.company_id;
  }
  const sorted = [...memberships].sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || ''))
  );
  return sorted[0]?.company_id || memberships[0].company_id;
}

export function pickAdminMembership(
  memberships: MembershipRow[],
  preferredCompanyId?: string | null
): MembershipRow | null {
  const admins = memberships.filter((row) => row.role === ADMIN_ROLE);
  const pool = admins.length ? admins : memberships;
  const companyId = pickMembershipCompanyId(pool, preferredCompanyId);
  if (!companyId) return null;
  return pool.find((row) => row.company_id === companyId) || null;
}
