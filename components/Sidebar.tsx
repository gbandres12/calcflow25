import React from 'react';
import { 
  LayoutDashboard, Package, FileText, Users, Factory, Wallet, TrendingUp, CreditCard,
  Truck, Fuel, Boxes, UserCog, Settings, LogOut, ShieldCheck, Briefcase, Wrench,
  FileCheck, Calendar, HardHat, X, ArrowRightLeft, Sliders, ClipboardList
} from 'lucide-react';
import { View, UserRole, User, UserPermissions } from '../types';

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  user: User;
  onLogout?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onOpenDatabaseModal?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, user, onLogout, mobileOpen = false, onCloseMobile }) => {
  const userPermissions: UserPermissions = user.permissions || {
    financial: user.role === UserRole.ADMIN || user.role === UserRole.MANAGER,
    users: user.role === UserRole.ADMIN || user.role === UserRole.OPERATIONAL_SUPERVISOR,
    inventory: true,
    orders: true
  };

  const isItemAllowed = (itemId: string, itemRoles?: UserRole[]) => {
    if (user.role === UserRole.ADMIN) return true;
    if (itemRoles && !itemRoles.includes(user.role)) return false;
    if (['daily', 'transactions', 'cashflow', 'accounts', 'fiscal', 'fiscal_config'].includes(itemId)) return userPermissions.financial;
    if (['users'].includes(itemId)) return userPermissions.users;
    if (['inventory', 'milling'].includes(itemId)) return userPermissions.inventory;
    if (['orders', 'quotes', 'customers', 'yard', 'transfers'].includes(itemId)) return userPermissions.orders;
    return true;
  };

  const allGroups = [
    { title: 'Visão Geral', items: [{ id: 'dashboard', label: 'Escritório Operacional', icon: LayoutDashboard }] },
    { title: 'Comercial & Clientes', items: [
      { id: 'orders', label: 'Vendas & Romaneios', icon: FileText },
      { id: 'quotes', label: 'Orçamentos', icon: ClipboardList },
      { id: 'customers', label: 'Clientes & Produtores', icon: Users },
      { id: 'fiscal', label: 'Notas Fiscais Emitidas', icon: FileCheck, roles: [UserRole.ADMIN, UserRole.MANAGER] },
    ]},
    { title: 'Produção & Fábrica', items: [
      { id: 'inventory', label: 'Estoque Mineral', icon: Package },
      { id: 'milling', label: 'Moagem / Britagem', icon: Factory },
    ]},
    { title: 'Frota, Pátio & Suprimentos', items: [
      { id: 'yard', label: 'Pátio, Balança & Peças', icon: Boxes },
      { id: 'transfers', label: 'Transferências Santarém / Matriz', icon: ArrowRightLeft },
      { id: 'fleet', label: 'Frota e Maquinário', icon: Truck },
      { id: 'fuel', label: 'Controle de Combustível', icon: Fuel },
    ]},
    { title: 'Financeiro & Caixa', items: [
      { id: 'daily', label: 'Movimentação Diária', icon: Calendar },
      { id: 'transactions', label: 'Lançamentos / Extrato', icon: CreditCard },
      { id: 'cashflow', label: 'Fluxo de Caixa', icon: TrendingUp },
      { id: 'accounts', label: 'Contas Bancárias', icon: Wallet },
    ]},
    { title: 'Gestão & Sistema', items: [
      { id: 'users', label: 'Usuários & Equipe', icon: UserCog },
      { id: 'fiscal_config', label: 'Configuração de Nota Fiscal', icon: Sliders, roles: [UserRole.ADMIN, UserRole.MANAGER] },
      { id: 'settings', label: 'Categorias & Configs', icon: Settings, roles: [UserRole.ADMIN] },
    ]},
  ];

  const groups = allGroups.map(group => ({
    ...group,
    items: group.items.filter(item => isItemAllowed(item.id, item.roles))
  })).filter(group => group.items.length > 0);

  return (
    <>
      {mobileOpen && <div onClick={onCloseMobile} className="fixed inset-0 bg-slate-950/70 z-40 lg:hidden" />}
      <aside className={`w-64 h-screen bg-[#0B1F33] text-slate-300 flex flex-col fixed left-0 top-0 z-50 print:hidden border-r border-slate-800 transition-transform ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#1D4ED8] rounded-lg flex items-center justify-center text-white"><Factory size={18} /></div>
            <div>
              <h1 className="text-sm font-semibold text-white">CalcárioFlow</h1>
              <p className="text-[10px] text-slate-400 uppercase">Usina & Mineração</p>
            </div>
          </div>
          <button type="button" onClick={onCloseMobile} className="lg:hidden text-slate-400"><X size={18} /></button>
        </div>
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto custom-scrollbar">
          {groups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{group.title}</p>
              {group.items.map((item) => (
                <button key={item.id} type="button" onClick={() => { onNavigate(item.id as View); onCloseMobile?.(); }} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left ${
                  currentView === item.id ? 'bg-[#1D4ED8] text-white font-semibold' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                }`}>
                  <item.icon size={16} />
                  <span className="text-xs font-medium truncate">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg bg-white/5">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-100 truncate">{user.name.split(' ')[0]}</p>
              <p className="text-[10px] text-slate-400 truncate">{user.role}</p>
            </div>
            {onLogout && <button type="button" onClick={onLogout} className="p-1.5 text-slate-400 hover:text-white"><LogOut size={15} /></button>}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
