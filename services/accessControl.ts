import { User, UserPermissions, UserRole, View } from '../types';

export type AppModule = Extract<View,
  | 'dashboard' | 'orders' | 'quotes' | 'customers' | 'fiscal' | 'fiscal_config'
  | 'inventory' | 'milling' | 'yard' | 'transfers' | 'fleet' | 'fuel'
  | 'daily' | 'transactions' | 'cashflow' | 'accounts' | 'users' | 'settings'
>;

export const ACCESS_AREAS: { id: string; label: string; hint: string; modules: AppModule[] }[] = [
  { id: 'comercial', label: 'Comercial', hint: 'Venda, orçamento, cliente e nota emitida', modules: ['orders', 'quotes', 'customers', 'fiscal'] },
  { id: 'santarem', label: 'Santarém / compras', hint: 'Remessa de peças e insumos para a fazenda', modules: ['transfers'] },
  { id: 'fazenda', label: 'Fazenda, pátio e frota', hint: 'Balança, peças, máquina e diesel', modules: ['yard', 'fleet', 'fuel'] },
  { id: 'usina', label: 'Usina / produção', hint: 'Estoque mineral e moagem', modules: ['inventory', 'milling'] },
  { id: 'financeiro', label: 'Financeiro', hint: 'Caixa, extrato, contas e config fiscal', modules: ['daily', 'transactions', 'cashflow', 'accounts', 'fiscal_config'] },
  { id: 'gestao', label: 'Gestão', hint: 'Painel, equipe e configurações', modules: ['dashboard', 'users', 'settings'] }
];

export const MODULE_LABEL: Record<AppModule, string> = {
  dashboard: 'Painel',
  orders: 'Vendas e romaneios',
  quotes: 'Orçamentos',
  customers: 'Clientes',
  fiscal: 'Notas emitidas',
  fiscal_config: 'Configuração fiscal',
  inventory: 'Estoque mineral',
  milling: 'Moagem / britagem',
  yard: 'Pátio e balança',
  transfers: 'Transferência Santarém → fazenda',
  fleet: 'Frota',
  fuel: 'Combustível',
  daily: 'Movimentação diária',
  transactions: 'Lançamentos',
  cashflow: 'Fluxo de caixa',
  accounts: 'Contas bancárias',
  users: 'Usuários',
  settings: 'Categorias'
};

const ALL: AppModule[] = ACCESS_AREAS.flatMap((a) => a.modules);

export const emptyModules = (): Record<AppModule, boolean> =>
  Object.fromEntries(ALL.map((id) => [id, id === 'dashboard'])) as Record<AppModule, boolean>;

export const fullModules = (): Record<AppModule, boolean> =>
  Object.fromEntries(ALL.map((id) => [id, true])) as Record<AppModule, boolean>;

export const modulesFromFlags = (flags: UserPermissions = {}): Record<AppModule, boolean> => {
  const out = emptyModules();
  const set = (ids: AppModule[], value: boolean) => ids.forEach((id) => { out[id] = value; });
  set(['daily', 'transactions', 'cashflow', 'accounts', 'fiscal', 'fiscal_config'], Boolean(flags.financial));
  set(['users', 'settings'], Boolean(flags.users));
  set(['inventory', 'milling', 'fleet', 'fuel'], Boolean(flags.inventory));
  set(['orders', 'quotes', 'customers', 'yard', 'transfers'], Boolean(flags.orders));
  out.dashboard = true;
  return out;
};

export const resolveModules = (user?: User | null): Record<AppModule, boolean> => {
  const flags = user?.permissions || {};
  const saved = flags.modules;
  if (saved && Object.keys(saved).length > 0) {
    const base = emptyModules();
    ALL.forEach((id) => { base[id] = Boolean(saved[id]); });
    return base;
  }
  if (user?.role === UserRole.ADMIN) return fullModules();
  return modulesFromFlags(flags);
};

export const canAccess = (user: User | null | undefined, view: string): boolean => {
  if (!user || user.status === 'Inativo') return false;
  if (view === 'dashboard') return true;
  return Boolean(resolveModules(user)[view as AppModule]);
};

export const firstAllowedView = (user: User | null | undefined): View => {
  const modules = resolveModules(user);
  return (ALL.find((id) => modules[id]) || 'dashboard') as View;
};

export const toLegacyFlags = (modules: Record<AppModule, boolean>): UserPermissions => ({
  financial: Boolean(modules.daily || modules.transactions || modules.accounts || modules.fiscal_config),
  users: Boolean(modules.users),
  inventory: Boolean(modules.inventory || modules.milling),
  orders: Boolean(modules.orders || modules.quotes || modules.transfers || modules.yard),
  modules
});

export const presetModules = (preset: 'total' | 'comercial' | 'santarem' | 'fazenda' | 'balanca' | 'financeiro'): Record<AppModule, boolean> => {
  const pick = (ids: AppModule[]) => {
    const base = emptyModules();
    ids.forEach((id) => { base[id] = true; });
    return base;
  };
  if (preset === 'total') return fullModules();
  if (preset === 'comercial') return pick(['dashboard', 'orders', 'quotes', 'customers', 'fiscal']);
  if (preset === 'santarem') return pick(['dashboard', 'transfers', 'yard']);
  if (preset === 'fazenda') return pick(['dashboard', 'yard', 'fleet', 'fuel', 'inventory', 'transfers']);
  if (preset === 'balanca') return pick(['dashboard', 'orders', 'yard', 'inventory']);
  return pick(['dashboard', 'daily', 'transactions', 'cashflow', 'accounts', 'fiscal_config']);
};
