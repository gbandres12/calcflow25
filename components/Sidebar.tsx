import React from 'react';
import { 
  LayoutDashboard, Package, FileText, Users, Wallet, TrendingUp, CreditCard,
  Truck, Fuel, Boxes, UserCog, Settings, LogOut, ShieldCheck, Briefcase, Wrench,
  FileCheck, Calendar, HardHat, X, ArrowRightLeft, Sliders, ClipboardList, Layers, KeyRound, Sprout, CalendarClock, ShoppingCart, PieChart
} from 'lucide-react';
import { View, User } from '../types';
import { isViewAllowed } from '../services/viewAccess';

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  user: User;
  onLogout?: () => void;
  onChangePassword?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onOpenDatabaseModal?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, user, onLogout, onChangePassword, mobileOpen = false, onCloseMobile }) => {
  const allGroups = [
    { title: 'Visão Geral', items: [{ id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard }] },
    { title: 'Comercial & Clientes', items: [
      { id: 'orders', label: 'Vendas & Romaneios', icon: FileText },
      { id: 'quotes', label: 'Orçamentos', icon: ClipboardList },
      { id: 'loadings', label: 'Carregamentos', icon: Truck },
      { id: 'crm', label: 'CRM de Produtores', icon: Sprout },
      { id: 'customers', label: 'Clientes & Fornecedores', icon: Users },
      { id: 'fiscal', label: 'Notas Fiscais', icon: FileCheck },
    ]},
    { title: 'Produção & Fábrica', items: [
      { id: 'inventory', label: 'Produtos & NCM', icon: Package },
      { id: 'milling', label: 'Moagem / Britagem', icon: HardHat },
    ]},
    { title: 'Frota, Pátio & Suprimentos', items: [
      { id: 'purchases', label: 'Ordens de Compra', icon: ShoppingCart },
      { id: 'yard', label: 'Pátio, Balança & Peças', icon: Boxes },
      { id: 'transfers', label: 'Transferências', icon: ArrowRightLeft },
      { id: 'transportadores', label: 'Transportadores', icon: Truck },
      { id: 'fleet', label: 'Frota e Maquinário', icon: Truck },
      { id: 'fuel', label: 'Combustível', icon: Fuel },
    ]},
    { title: 'Financeiro & Caixa', items: [
      { id: 'cost_centers', label: 'Verbas & Centros de Custo', icon: PieChart },
      { id: 'payables_receivables', label: 'Contas a Pagar & Receber', icon: CalendarClock },
      { id: 'daily', label: 'Movimentação Diária', icon: Calendar },
      { id: 'transactions', label: 'Lançamentos / Extrato', icon: CreditCard },
      { id: 'cashflow', label: 'Fluxo de Caixa', icon: TrendingUp },
      { id: 'accounts', label: 'Contas Bancárias', icon: Wallet },
    ]},
    { title: 'Gestão & Sistema', items: [
      { id: 'users', label: 'Usuários & Equipe', icon: UserCog },
      { id: 'branches', label: 'Filiais e Acessos', icon: Briefcase },
      { id: 'fiscal_config', label: 'Configuração de NF-e', icon: Sliders },
      { id: 'settings', label: 'Configurações', icon: Settings },
    ]},
  ];

  const groups = allGroups.map(group => ({
    ...group,
    items: group.items.filter(item => isViewAllowed(user, item.id))
  })).filter(group => group.items.length > 0);

  const firstName = user.name?.split(' ')[0] || 'Usuário';
  const initials = user.name
    ? user.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('')
    : 'U';

  return (
    <>
      {mobileOpen && <div onClick={onCloseMobile} className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px] z-40 lg:hidden" />}
      <aside className={`cf-sidebar w-[276px] h-screen bg-[#F8F9F6] text-[#2C423B] flex flex-col fixed left-0 top-0 z-50 print:hidden border-r border-[#E2E8E3] transition-transform ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="px-5 py-4 min-h-[64px] border-b border-[#E6ECE7] flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-[#0F5948] rounded-lg flex items-center justify-center text-white shadow-sm shadow-[#0F5948]/15 shrink-0">
              <Layers size={18} strokeWidth={1.9} />
            </div>
            <div className="min-w-0">
              <h1 className="cf-sidebar-title">CalcFlow</h1>
              <p className="cf-sidebar-subtitle truncate">Mineração em fluxo real</p>
            </div>
          </div>
          <button type="button" onClick={onCloseMobile} className="lg:hidden p-1 rounded-md text-[#6E8077] hover:text-[#163C35] hover:bg-[#ECEFEA]"><X size={18} /></button>
        </div>

        <nav className="cf-sidebar-nav flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {groups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-0.5">
              <p className="cf-sidebar-group-label px-2.5 pb-1.5">{group.title}</p>
              {group.items.map((item) => {
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onNavigate(item.id as View); onCloseMobile?.(); }}
                    className={`cf-sidebar-item group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-150 ${
                      isActive
                        ? 'cf-sidebar-item-active bg-white text-[#0F5948] shadow-[0_1px_2px_rgba(15,46,40,0.06)] ring-1 ring-[#DCE6DF]'
                        : 'text-[#4A5D55] hover:bg-[#EEF2EE] hover:text-[#163C35]'
                    }`}
                  >
                    <item.icon
                      size={16}
                      strokeWidth={isActive ? 2 : 1.65}
                      className={`shrink-0 transition-colors ${
                        isActive ? 'text-[#0F5948]' : 'text-[#76887F] group-hover:text-[#2C4840]'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-[#E6ECE7] bg-[#F4F6F2]/60">
          <div className="flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg bg-white border border-[#E2E8E3] shadow-[0_1px_2px_rgba(15,46,40,0.03)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#E6EFEA] border border-[#D2E2D9] text-[#0F5948] flex items-center justify-center shrink-0 cf-sidebar-avatar">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="cf-sidebar-user-name truncate">{firstName}</p>
                <p className="cf-sidebar-user-role truncate">{user.role}</p>
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {onChangePassword && (
                <button
                  type="button"
                  onClick={onChangePassword}
                  title="Alterar minha senha"
                  aria-label="Alterar minha senha"
                  className="p-1.5 rounded-md text-[#6E8077] hover:text-[#0F5948] hover:bg-[#F0F4F1] transition-colors"
                >
                  <KeyRound size={14} strokeWidth={1.75} />
                </button>
              )}
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  title="Sair"
                  aria-label="Sair"
                  className="p-1.5 rounded-md text-[#6E8077] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut size={14} strokeWidth={1.75} />
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
