import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
  FileText, 
  Users, 
  Factory, 
  Wallet, 
  TrendingUp, 
  CreditCard, 
  Truck, 
  Fuel, 
  Boxes, 
  UserCog, 
  Settings, 
  LogOut, 
  ShieldCheck, 
  Briefcase, 
  Wrench,
  FileCheck,
  Calendar,
  Shield,
  HardHat,
  X
} from 'lucide-react';
import { View, UserRole, User, UserPermissions } from '../types';

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  user: User;
  onLogout?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  onNavigate, 
  user, 
  onLogout,
  mobileOpen = false,
  onCloseMobile 
}) => {
  const userPermissions: UserPermissions = user.permissions || {
    financial: user.role === UserRole.ADMIN || user.role === UserRole.MANAGER,
    users: user.role === UserRole.ADMIN || user.role === UserRole.OPERATIONAL_SUPERVISOR,
    inventory: true,
    orders: true
  };

  const isItemAllowed = (itemId: string, itemRoles?: UserRole[]) => {
    if (user.role === UserRole.ADMIN) return true;
    if (itemRoles && !itemRoles.includes(user.role)) {
      return false;
    }
    if (['daily', 'transactions', 'cashflow', 'accounts', 'fiscal'].includes(itemId)) {
      return userPermissions.financial;
    }
    if (['users'].includes(itemId)) {
      return userPermissions.users;
    }
    if (['inventory', 'milling'].includes(itemId)) {
      return userPermissions.inventory;
    }
    if (['orders', 'customers', 'yard'].includes(itemId)) {
      return userPermissions.orders;
    }
    return true;
  };

  const allGroups = [
    {
      title: 'Visão Geral',
      roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATIONAL_SUPERVISOR, UserRole.OPERATOR],
      items: [
        { id: 'dashboard', label: 'Painel Geral', icon: LayoutDashboard },
      ]
    },
    {
      title: 'Comercial & Clientes',
      roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATIONAL_SUPERVISOR, UserRole.OPERATOR],
      items: [
        { id: 'orders', label: 'Vendas & Romaneios', icon: FileText },
        { id: 'customers', label: 'Clientes & Produtores', icon: Users },
        { id: 'fiscal', label: 'Fiscal & Notas (NF-e)', icon: FileCheck, roles: [UserRole.ADMIN, UserRole.MANAGER] },
      ]
    },
    {
      title: 'Produção & Fábrica',
      roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATIONAL_SUPERVISOR, UserRole.OPERATOR],
      items: [
        { id: 'inventory', label: 'Estoque Mineral', icon: Package },
        { id: 'milling', label: 'Moagem / Britagem', icon: Factory },
      ]
    },
    {
      title: 'Frota, Pátio & Suprimentos',
      roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATIONAL_SUPERVISOR, UserRole.OPERATOR],
      items: [
        { id: 'yard', label: 'Pátio, Balança & Peças', icon: Boxes },
        { id: 'fleet', label: 'Frota e Maquinário', icon: Truck },
        { id: 'fuel', label: 'Controle de Combustível', icon: Fuel },
      ]
    },
    {
      title: 'Financeiro & Caixa',
      roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATIONAL_SUPERVISOR, UserRole.OPERATOR],
      items: [
        { id: 'daily', label: 'Movimentação Diária', icon: Calendar },
        { id: 'transactions', label: 'Lançamentos / Extrato', icon: CreditCard },
        { id: 'cashflow', label: 'Fluxo de Caixa', icon: TrendingUp },
        { id: 'accounts', label: 'Contas Bancárias', icon: Wallet },
      ]
    },
    {
      title: 'Gestão & Sistema',
      roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATIONAL_SUPERVISOR, UserRole.OPERATOR],
      items: [
        { id: 'users', label: 'Usuários & Equipe', icon: UserCog },
        { id: 'settings', label: 'Categorias & Configs', icon: Settings, roles: [UserRole.ADMIN] },
      ]
    }
  ];

  const groups = allGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => isItemAllowed(item.id, item.roles))
    }))
    .filter(group => group.items.length > 0);

  const getRoleIcon = () => {
    switch (user.role) {
      case UserRole.ADMIN: return ShieldCheck;
      case UserRole.MANAGER: return Briefcase;
      case UserRole.OPERATIONAL_SUPERVISOR: return HardHat;
      default: return Wrench;
    }
  };

  const RoleIconComponent = getRoleIcon();

  const handleItemClick = (id: View) => {
    onNavigate(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <>
      {/* Backdrop para mobile */}
      {mobileOpen && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-40 lg:hidden animate-in fade-in"
        />
      )}

      <aside className={`w-64 h-screen bg-slate-900 text-slate-300 flex flex-col fixed left-0 top-0 shadow-2xl z-50 print:hidden border-r border-slate-800 transition-transform duration-300 ease-in-out ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-600/30 text-white shrink-0">
              <Factory size={20} />
            </div>
            <div className="overflow-hidden">
              <h1 className="text-sm font-black text-white tracking-tight leading-tight">CalcárioFlow</h1>
              <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Usina & Mineração</p>
            </div>
          </div>
          {/* Botão de Fechar no Mobile */}
          <button 
            onClick={onCloseMobile}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto custom-scrollbar">
          {groups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1">
              <p className="px-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{group.title}</p>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id as View)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-150 text-left ${
                    currentView === item.id 
                      ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-600/20' 
                      : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
                  }`}
                >
                  <item.icon size={16} className="shrink-0" />
                  <span className="text-xs font-semibold truncate">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* User Footer Profile */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center justify-between gap-2 p-2 bg-slate-800/60 rounded-xl border border-slate-700/50">
            <div className="flex items-center gap-2 overflow-hidden min-w-0">
              <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                <RoleIconComponent size={15} />
              </div>
              <div className="overflow-hidden min-w-0">
                <p className="text-xs font-bold text-slate-200 truncate">{user.name.split(' ')[0]}</p>
                <p className="text-[9px] text-purple-400 uppercase font-black tracking-wider truncate">{user.role}</p>
              </div>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                title="Sair do Sistema"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
              >
                <LogOut size={15} />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
