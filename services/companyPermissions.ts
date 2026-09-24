import { CompanyModulePermissions } from '../types';

/**
 * Mesma lista de módulos de ALL_TABLES em dataService.ts. Repetida aqui de
 * propósito (como erpRepository.ts repete a normalização de companyId):
 * este arquivo é importado tanto pelo browser (Vite) quanto pela function
 * serverless (Node/NodeNext), e não deve arrastar localStorage/constants.
 */
export const PERMISSION_MODULES = [
  'customers',
  'sales_orders',
  'transactions',
  'machines',
  'store_items',
  'maintenance_records',
  'fuel_records',
  'fuel_purchases',
  'inventory',
  'financial_accounts',
  'categories',
  'fiscal_config',
  'users',
  'transfers',
  'transportadores'
] as const;

export type PermissionModule = typeof PERMISSION_MODULES[number];

export interface PermissionGroup {
  key: string;
  label: string;
  modules: PermissionModule[];
}

/** Agrupamento visual na tela de delegação — mesma divisão do Sidebar. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  { key: 'comercial', label: 'Comercial & Clientes', modules: ['customers', 'sales_orders', 'transportadores'] },
  { key: 'producao', label: 'Produção & Fábrica', modules: ['inventory', 'categories'] },
  { key: 'frota_patio', label: 'Frota, Pátio & Suprimentos', modules: ['store_items', 'machines', 'maintenance_records', 'fuel_records', 'fuel_purchases', 'transfers'] },
  { key: 'financeiro', label: 'Financeiro & Caixa', modules: ['transactions', 'financial_accounts', 'fiscal_config'] },
  { key: 'gestao', label: 'Gestão & Sistema', modules: ['users'] }
];

export const buildFullAccessPermissions = (): CompanyModulePermissions =>
  Object.fromEntries(PERMISSION_MODULES.map((module) => [module, { read: true, write: true }]));

export const buildEmptyPermissions = (): CompanyModulePermissions =>
  Object.fromEntries(PERMISSION_MODULES.map((module) => [module, { read: false, write: false }]));

/** Marca leitura (e escrita, se write=true) em todos os módulos de um grupo. */
export const setGroupAccess = (
  permissions: CompanyModulePermissions,
  group: PermissionGroup,
  access: { read: boolean; write: boolean }
): CompanyModulePermissions => {
  const next = { ...permissions };
  group.modules.forEach((module) => {
    next[module] = { read: access.read, write: access.write && access.read };
  });
  return next;
};

/** Um grupo aparece "marcado" só quando todo módulo dele tem a permissão pedida. */
export const groupHasAccess = (
  permissions: CompanyModulePermissions | undefined,
  group: PermissionGroup,
  action: 'read' | 'write'
): boolean => {
  if (!permissions) return false;
  return group.modules.every((module) => Boolean(permissions[module]?.[action]));
};
