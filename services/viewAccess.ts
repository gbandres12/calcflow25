import { User, UserPermissions, UserRole } from '../types';

/** Telas restritas a cargo, independente das permissões marcadas no usuário. */
export const VIEW_ROLES: Record<string, UserRole[]> = {
  loadings: [UserRole.ADMIN, UserRole.MANAGER],
  fiscal: [UserRole.ADMIN, UserRole.MANAGER],
  fiscal_config: [UserRole.ADMIN, UserRole.MANAGER],
  branches: [UserRole.ADMIN],
  settings: [UserRole.ADMIN]
};

export const effectivePermissions = (user: User): UserPermissions =>
  user.permissions || {
    financial: user.role === UserRole.ADMIN || user.role === UserRole.MANAGER,
    fiscal: false,
    users: user.role === UserRole.ADMIN || user.role === UserRole.OPERATIONAL_SUPERVISOR,
    inventory: true,
    orders: true
  };

/** Mesma regra pro menu lateral e pro rodapé do celular. */
export function isViewAllowed(user: User, viewId: string): boolean {
  if (user.role === UserRole.ADMIN) return true;
  const roles = VIEW_ROLES[viewId];
  if (roles && !roles.includes(user.role)) return false;
  const perms = effectivePermissions(user);
  if (viewId === 'fiscal') return Boolean(perms.fiscal || perms.financial);
  if (['daily', 'receivables', 'transactions', 'cashflow', 'accounts', 'fiscal_config'].includes(viewId)) return perms.financial;
  if (viewId === 'users') return perms.users;
  if (['inventory', 'milling'].includes(viewId)) return perms.inventory;
  if (['orders', 'quotes', 'customers', 'transportadores', 'transfers'].includes(viewId)) return perms.orders;
  // yard (balança) fica sempre liberado: é onde o operador da balança lança carregamento.
  return true;
}
