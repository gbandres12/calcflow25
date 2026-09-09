import React from 'react';
import { 
  LayoutDashboard, Package, FileText, Users, Wallet, TrendingUp, CreditCard,
  Truck, Fuel, Boxes, UserCog, Settings, LogOut, ShieldCheck, Briefcase, Wrench,
  FileCheck, Calendar, HardHat, X, ArrowRightLeft, Sliders, ClipboardList, Layers
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
    { title: 'Visão Geral', items: [{ id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard }] },
    { title: 'Comercial & Clientes', items: [
      { id: 'orders', label: 'Vendas & Romaneios', icon: FileText },
      { id: 'quotes', label: 'Orçamentos', icon: ClipboardList },
      { id: 'customers', label: 'Clientes & Fornecedores', icon: Users },
      { id: 'fiscal', label: 'Notas Fiscais', icon: FileCheck, roles: [UserRole.ADMIN, UserRole.MANAGER] },
    ]},
    { title: 'Produção & Fábrica', items: [
      { id: 'inventory', label: 'Produtos & NCM', icon: Package },
      { id: 'milling', label: 'Moagem / Britagem', icon: HardHat },
    ]},
    { title: 'Frota, Pátio & Suprimentos', items: [
      { id: 'yard', label: 'Pátio, Balança & Peças', icon: Boxes },
      { id: 'transfers', label: 'Transferências', icon: ArrowRightLeft },
      { id: 'fleet', label: 'Frota e Maquinário', icon: Truck },
      { id: 'fuel', label: 'Combustível', icon: Fuel },
    ]},
    { title: 'Financeiro & Caixa', items: [
      { id: 'daily', label: 'Movimentação Diária', icon: Calendar },
      { id: 'transactions', label: 'Lançamentos / Extrato', icon: CreditCard },
      { id: 'cashflow', label: 'Fluxo de Caixa', icon: TrendingUp },
      { id: 'accounts', label: 'Contas Bancárias', icon: Wallet },
    ]},
    { title: 'Gestão & Sistema', items: [
      { id: 'users', label: 'Usuários & Equipe', icon: UserCog },
      { id: 'fiscal_config', label: 'Configuração de NF-e', icon: Sliders, roles: [UserRole.ADMIN, UserRole.MANAGER] },
      { id: 'settings', label: 'Configurações', icon: Settings, roles: [UserRole.ADMIN] },
    ]},
  ];

  const groups = allGroups.map(group => ({
    ...group,
    items: group.items.filter(item => isItemAllowed(item.id, item.roles))
  })).filter(group => group.items.length > 0);

  return (
    <>
      {mobileOpen && <div onClick={onCloseMobile} className="fixed inset-0 bg-slate-950/70 z-40 lg:hidden" />}
      <aside className={`w-[276px] h-screen bg-[#F7F8F3] text-[#36574E] flex flex-col fixed left-0 top-0 z-50 print:hidden border-r border-[#DDE6DE] transition-transform ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="p-5 border-b border-[#DDE6DE] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#E5EEE5] rounded-xl flex items-center justify-center text-[#0F5948] border border-[#D5E2D5]"><Layers size={21} strokeWidth={2.4} /></div>
            <div>
              <h1 className="text-[15px] font-extrabold tracking-tight text-[#163C35]">CalcFlow</h1>
              <p className="text-[9px] font-bold tracking-[0.16em] text-[#728078] uppercase">Mineração em fluxo real</p>
            </div>
          </div>
          <button type="button" onClick={onCloseMobile} className="lg:hidden text-[#728078]"><X size={18} /></button>
        </div>
        <nav className="flex-1 p-3.5 space-y-4 overflow-y-auto custom-scrollbar">
          {groups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1">
              <p className="px-3 text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#718078]">{group.title}</p>
              {group.items.map((item) => (
                <button key={item.id} type="button" onClick={() => { onNavigate(item.id as View); onCloseMobile?.(); }} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  currentView === item.id ? 'bg-[#E4EBE1] text-[#153F36] font-extrabold shadow-[inset_3px_0_0_#0F5948]' : 'text-[#5E7067] hover:bg-[#ECF1EB] hover:text-[#163C35]'
                }`}>
                  <item.icon size={16} />
                  <span className="text-[11px] font-semibold truncate">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-[#DDE6DE]">
          <div className="flex items-center justify-between gap-2 px-2.5 py-2.5 rounded-lg bg-white border border-[#E0E8E0]">
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-[#163C35] truncate">{user.name.split(' ')[0]}</p>
              <p className="text-[10px] text-[#728078] truncate">{user.role}</p>
            </div>
            {onLogout && <button type="button" onClick={onLogout} className="p-1.5 text-[#728078] hover:text-[#0F5948]"><LogOut size={15} /></button>}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
