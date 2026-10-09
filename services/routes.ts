import { View } from '../types';

export interface RouteConfig {
  view: View;
  path: string;
  aliases?: string[];
  title: string;
}

export const ROUTES: RouteConfig[] = [
  { view: 'dashboard', path: '/dashboard', aliases: ['/'], title: 'Visão Geral' },
  { view: 'orders', path: '/vendas', aliases: ['/pedidos', '/orders'], title: 'Vendas & Romaneios' },
  { view: 'quotes', path: '/orcamentos', aliases: ['/quotes'], title: 'Orçamentos' },
  { view: 'loadings', path: '/carregamentos', aliases: ['/loadings'], title: 'Carregamentos' },
  { view: 'customers', path: '/clientes', aliases: ['/fornecedores', '/customers'], title: 'Clientes & Fornecedores' },
  { view: 'fiscal', path: '/fiscal', aliases: ['/notas', '/notas-fiscais', '/nfe'], title: 'Notas Fiscais' },
  { view: 'fiscal_config', path: '/config-nfe', aliases: ['/fiscal-config'], title: 'Configuração NF-e' },
  { view: 'inventory', path: '/produtos', aliases: ['/estoque', '/inventory'], title: 'Produtos & Estoque' },
  { view: 'milling', path: '/moagem', aliases: ['/britagem', '/milling'], title: 'Moagem / Britagem' },
  { view: 'yard', path: '/patio', aliases: ['/balanca', '/yard'], title: 'Pátio, Balança & Peças' },
  { view: 'transfers', path: '/transferencias', aliases: ['/transfers'], title: 'Transferências' },
  { view: 'transportadores', path: '/transportadores', title: 'Transportadores' },
  { view: 'fleet', path: '/frota', aliases: ['/fleet'], title: 'Frota e Maquinário' },
  { view: 'fuel', path: '/combustivel', aliases: ['/fuel'], title: 'Combustível' },
  { view: 'daily', path: '/caixa', aliases: ['/diario', '/movimentacao-diaria', '/daily'], title: 'Movimentação Diária' },
  { view: 'transactions', path: '/lancamentos', aliases: ['/transacoes', '/extrato', '/transactions'], title: 'Lançamentos / Extrato' },
  { view: 'cashflow', path: '/fluxo-caixa', aliases: ['/fluxo', '/cashflow'], title: 'Fluxo de Caixa' },
  { view: 'accounts', path: '/contas', aliases: ['/accounts'], title: 'Contas Bancárias' },
  { view: 'users', path: '/usuarios', aliases: ['/users', '/equipe'], title: 'Usuários & Equipe' },
  { view: 'branches', path: '/filiais', aliases: ['/branches'], title: 'Filiais e Acessos' },
  { view: 'settings', path: '/configuracoes', aliases: ['/settings'], title: 'Configurações' },
];

const VIEW_TO_ROUTE: Partial<Record<View, RouteConfig>> = {};
const PATH_TO_VIEW = new Map<string, View>();

ROUTES.forEach((route) => {
  VIEW_TO_ROUTE[route.view] = route;
  PATH_TO_VIEW.set(route.path.toLowerCase(), route.view);
  route.aliases?.forEach((alias) => {
    PATH_TO_VIEW.set(alias.toLowerCase(), route.view);
  });
});

export const getViewPath = (view: View): string => {
  return VIEW_TO_ROUTE[view]?.path || '/dashboard';
};

export const getViewTitle = (view: View): string => {
  const name = VIEW_TO_ROUTE[view]?.title || 'CalcFlow';
  return `${name} · CalcFlow`;
};

export const parseViewFromLocation = (): View => {
  if (typeof window === 'undefined') return 'dashboard';

  // Fallback para hash (ex: #/clientes ou #clientes)
  if (window.location.hash) {
    const hash = window.location.hash.replace(/^#\/?/, '/').toLowerCase();
    if (PATH_TO_VIEW.has(hash)) {
      return PATH_TO_VIEW.get(hash)!;
    }
  }

  const pathname = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  if (PATH_TO_VIEW.has(pathname)) {
    return PATH_TO_VIEW.get(pathname)!;
  }

  return 'dashboard';
};

export const updateBrowserUrl = (view: View, replace = false): void => {
  if (typeof window === 'undefined') return;

  const targetPath = getViewPath(view);
  const currentPath = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';

  document.title = getViewTitle(view);

  if (currentPath === targetPath) return;

  try {
    if (replace) {
      window.history.replaceState({ view }, '', targetPath);
    } else {
      window.history.pushState({ view }, '', targetPath);
    }
  } catch (err) {
    console.warn('Falha ao atualizar histórico do navegador:', err);
  }
};
