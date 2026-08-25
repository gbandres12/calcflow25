
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
  FileCheck
} from 'lucide-react';
import { View, UserRole, User } from '../types';

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  user: User;
  onLogout?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, user, onLogout }) => {
  const allGroups = [
    {
      title: 'Visão Geral',
      roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR],
      items: [
        { id: 'dashboard', label: 'Painel Geral', icon: LayoutDashboard },
      ]
    },
    {
      title: 'Comercial & Fiscal',
      roles: [UserRole.ADMIN, UserRole.MANAGER],
      items: [
        { id: 'orders', label: 'Vendas e Orçamentos', icon: FileText },
        { id: 'fiscal', label: 'Fiscal & NotaAs (NF-e)', icon: FileCheck },
        { id: 'customers', label: 'Clientes & Produtores', icon: Users },
      ]
    },
    {
      title: 'Produção & Fábrica',
      roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR],
      items: [
        { id: 'inventory', label: 'Estoque Mineral', icon: Package },
        { id: 'milling', label: 'Moagem / Britagem', icon: Factory },
      ]
    },
    {
      title: 'Frota, Pátio & Suprimentos',
      roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR],
      items: [
        { id: 'fleet', label: 'Frota e Maquinário', icon: Truck },
        { id: 'fuel', label: 'Controle de Combustível', icon: Fuel },
        { id: 'yard', label: 'Pátio e Almoxarifado', icon: Boxes },
      ]
    },
    {
      title: 'Financeiro & Caixa',
      roles: [UserRole.ADMIN, UserRole.MANAGER],
      items: [
        { id: 'accounts', label: 'Contas Bancárias', icon: Wallet },
        { id: 'transactions', label: 'Lançamentos / DRE', icon: CreditCard },
        { id: 'cashflow', label: 'Fluxo de Caixa', icon: TrendingUp },
      ]
    },
    {
      title: 'Gestão & Sistema',
      roles: [UserRole.ADMIN],
      items: [
        { id: 'users', label: 'Usuários & Equipe', icon: UserCog },
        { id: 'settings', label: 'Categorias & Configs', icon: Settings },
      ]
    }
  ];

  const groups = allGroups.filter(group => group.roles.includes(user.role));

  const roleIcon = user.role === UserRole.ADMIN ? ShieldCheck : user.role === UserRole.MANAGER ? Briefcase : Wrench;
  const RoleIconComponent = roleIcon;

  return (
    <div className="w-64 h-screen bg-slate-900 text-slate-300 flex flex-col fixed left-0 top-0 shadow-2xl z-50 print:hidden border-r border-slate-800 overflow-y-auto custom-scrollbar">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-600/30 text-white shrink-0">
            <Factory size={22} />
          </div>
          <div className="overflow-hidden">
            <h1 className="text-base font-black text-white tracking-tight leading-tight">CalcárioFlow</h1>
            <p className="text-[11px] text-purple-400 font-bold uppercase tracking-wider">Usina & Mineração</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3.5 space-y-5">
        {groups.map((group, gIdx) => (
          <div key={gIdx} className="space-y-1">
            <p className="px-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{group.title}</p>
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id as View)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-150 ${
                  currentView === item.id 
                    ? 'bg-purple-600 text-white font-bold shadow-lg shadow-purple-600/20' 
                    : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
                }`}
              >
                <item.icon size={17} />
                <span className="text-xs font-semibold">{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* User Footer Profile */}
      <div className="p-3.5 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between gap-2 p-2 bg-slate-800/60 rounded-xl border border-slate-700/50">
          <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
              <RoleIconComponent size={16} />
            </div>
            <div className="overflow-hidden min-w-0">
              <p className="text-xs font-bold text-slate-200 truncate">{user.name.split(' ')[0]}</p>
              <p className="text-[10px] text-purple-400 uppercase font-black tracking-wider truncate">{user.role}</p>
            </div>
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              title="Sair do Sistema"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;

