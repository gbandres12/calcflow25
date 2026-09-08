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
  Database,
  Calendar,
  Shield,
  HardHat,
  X,
  ArrowRightLeft,
  Sliders,
  ClipboardList
} from 'lucide-react';
import { View, UserRole, User } from '../types';
import { canAccess } from '../services/accessControl';

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  user: User;
  onLogout?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onOpenDatabaseModal?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  onNavigate, 
  user, 
  onLogout,
  mobileOpen = false,
  onCloseMobile,
  onOpenDatabaseModal
}) => {
  const isItemAllowed = (itemId: string) => canAccess(user, itemId);

  const allGroups = [
    {
      title: 'Visão Geral',
      items: [
        { id: 'dashboard', label: 'Painel Geral', icon: LayoutDashboard },
      ]
    },
    {
      title: 'Comercial & Clientes',
      items: [
        { id: 'orders', label: 'Vendas & Romaneios', icon: FileText },
        { id: 'quotes', label: 'Orçamentos', icon: ClipboardList },
        { id: 'customers', label: 'Clientes & Produtores', icon: Users },
        { id: 'fiscal', label: 'Notas Fiscais Emitidas', icon: FileCheck },
      ]
    },
    {
      title: 'Produção & Fábrica',
      items: [
        { id: 'inventory', label: 'Estoque Mineral', icon: Package },
        { id: 'milling', label: 'Moagem / Britagem', icon: Factory },
      ]
    },
    {
      title: 'Frota, Pátio & Suprimentos',
      items: [
        { id: 'yard', label: 'Pátio, Balança & Peças', icon: Boxes },
        { id: 'transfers', label: 'Transferências Santarém / Matriz', icon: ArrowRightLeft },
        { id: 'fleet', label: 'Frota e Maquinário', icon: Truck },
        { id: 'fuel', label: 'Controle de Combustível', icon: Fuel },
      ]
    },
    {
      title: 'Financeiro & Caixa',
      items: [
        { id: 'daily', label: 'Movimentação Diária', icon: Calendar },
        { id: 'transactions', label: 'Lançamentos / Extrato', icon: CreditCard },
        { id: 'cashflow', label: 'Fluxo de Caixa', icon: TrendingUp },
        { id: 'accounts', label: 'Contas Bancárias', icon: Wallet },
      ]
    },
    {
      title: 'Gestão & Sistema',
      items: [
        { id: 'users', label: 'Usuários & Equipe', icon: UserCog },
        { id: 'fiscal_config', label: 'Configuração de Nota Fiscal', icon: Sliders },
        { id: 'settings', label: 'Categorias & Configs', icon: Settings },
      ]
    }
  ];

  const groups = allGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => isItemAllowed(item.id))
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
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <div onClick={onCloseMobile} className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-40 lg:hidden" />
      )}
      <aside className={`w-64 h-screen bg-slate-900 text-slate-300 flex flex-col fixed left-0 top-0 z-50 print:hidden border-r border-slate-800 transition-transform ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center text-white">
              <Factory size={20} />
            </div>
            <div>
              <h1 className="text-sm font-black text-white">CalcárioFlow</h1>
              <p className="text-[10px] text-purple-400 font-bold uppercase">Usina & Mineração</p>
            </div>
          </div>
          <button onClick={onCloseMobile} className="p-1.5 text-slate-400 lg:hidden"><X size={18} /></button>
        </div>
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {groups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1">
              <p className="px-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{group.title}</p>
              {group.items.map((item) => (
                <button key={item.id} onClick={() => handleItemClick(item.id as View)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left ${
                  currentView === item.id ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-800/80'
                }`}>
                  <item.icon size={16} />
                  <span className="text-xs font-semibold truncate">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800">
          <div className="flex items-center justify-between gap-2 p-2 bg-slate-800/60 rounded-xl">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <RoleIconComponent size={15} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-200 truncate">{user.name.split(' ')[0]}</p>
                <p className="text-[9px] text-purple-400 uppercase font-black truncate">{user.role}</p>
              </div>
            </div>
            {onLogout && (
              <button onClick={onLogout} className="p-1.5 text-slate-400 hover:text-rose-400"><LogOut size={15} /></button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
