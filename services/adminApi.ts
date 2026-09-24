import { getSupabase } from './supabaseClient';
import { CompanyBranch, CompanyModulePermissions } from '../types';

async function authHeader(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new Error('Entre novamente como administrador.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function fetchTenants(companyId?: string) {
  const headers = await authHeader();
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  const res = await fetch(`/api/admin/tenants${query}`, { headers });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'Não foi possível listar as pastas da empresa.');
  return payload as {
    currentCompanyId: string;
    tenants: Array<{
      companyId: string;
      isDemo: boolean;
      isCurrent: boolean;
      memberCount: number;
      total: number;
      salesOrders: number;
      nfeOrders: number;
      customers: number;
      transactions: number;
      users: Array<{ id: string; name: string; email: string; role: string }>;
    }>;
  };
}

export async function mergeTenants(sourceCompanyId: string, targetCompanyId: string) {
  const headers = await authHeader();
  const res = await fetch('/api/admin/tenants', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'merge', sourceCompanyId, targetCompanyId, companyId: targetCompanyId })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'Não foi possível unificar as pastas.');
  return payload;
}

export async function dedupeTenantUsers(companyId: string) {
  const headers = await authHeader();
  const res = await fetch('/api/admin/tenants', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'dedupe-users', companyId })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'Não foi possível unificar os cadastros duplicados.');
  return payload as { ok: boolean; removed: Array<{ id: string; email?: string; name?: string }> };
}

async function companiesRequest(companyId: string, body?: Record<string, any>) {
  const headers = await authHeader();
  const query = `?companyId=${encodeURIComponent(companyId)}`;
  const res = body
    ? await fetch('/api/admin/companies', { method: 'POST', headers, body: JSON.stringify({ ...body, companyId: body.companyId || companyId }) })
    : await fetch(`/api/admin/companies${query}`, { headers });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'Não foi possível falar com o servidor de filiais.');
  return payload as { companyId: string; branches: CompanyBranch[] };
}

/** Matriz do usuário logado + toda filial dela, com quem tem acesso em cada uma. */
export async function fetchBranches(activeCompanyId: string) {
  return companiesRequest(activeCompanyId);
}

export async function createBranch(activeCompanyId: string, name: string) {
  return companiesRequest(activeCompanyId, { action: 'create-branch', name });
}

export async function grantBranchAccess(
  activeCompanyId: string,
  target: { companyId: string; userId: string; role: string; permissions: CompanyModulePermissions }
) {
  return companiesRequest(activeCompanyId, { action: 'grant-access', ...target });
}

export async function revokeBranchAccess(activeCompanyId: string, target: { companyId: string; userId: string }) {
  return companiesRequest(activeCompanyId, { action: 'revoke-access', ...target });
}
