
import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
  FileText, 
  Users, 
  Factory,
  Wallet,
  Building2,
  ChevronDown,
  TrendingUp,
  CreditCard,
  Truck,
  Wrench,
  Fuel,
  Boxes,
  UserCog
} from 'lucide-react';
import { View, Company } from '../types';

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  companies: Company[];
  selectedCompanyId: string;
  onSelectCompany: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, companies, selectedCompanyId, onSelectCompany }) => {
  const groups = [
    {
      title: 'Principal',
      items: [
        { id: 'dashboard', label: 'Painel', icon: LayoutDashboard },
      ]
    },
    {
      title: 'Comercial',
      items: [
        { id: 'orders', label: 'Vendas e Orçamentos', icon: FileText },
        { id: 'customers', label: 'Clientes', icon: Users },
      ]
    },
    {
      title: 'Produção e Estoque',
      items: [
        { id: 'inventory', label: 'Estoque Mineral', icon: Package },
        { id: 'milling', label: 'Moagem / Fábrica', icon: Factory },
      ]
    },
    {
      title: 'Frota e Pátio',
      items: [
        { id: 'fleet', label: 'Frota e Maquinário', icon: Truck },
        { id: 'fuel', label: 'Combustível', icon: Fuel },
        { id: 'yard', label: 'Pátio e Almoxarifado', icon: Boxes },
      ]
    },
    {
      title: 'Financeiro',
      items: [
        { id: 'accounts', label: 'Contas Bancárias', icon: Wallet },
        { id: 'transactions', label: 'Lançamentos', icon: CreditCard },
        { id: 'cashflow', label: 'Fluxo de Caixa', icon: TrendingUp },
      ]
    },
    {
      title: 'Configurações',
      items: [
        { id: 'users', label: 'Usuários e Equipe', icon: UserCog },
      ]
    }
  ];

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);

  return (
    <div className="w-64 h-screen bg-slate-900 text-slate-300 flex flex-col fixed left-0 top-0 shadow-2xl z-50 print:hidden border-r border-slate-800 overflow-y-auto custom-scrollbar">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-black flex items-center gap-2 mb-6 text-white tracking-tight">
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-purple-500/20">C</div>
          CalcárioFlow
        </h1>
        
        <div className="relative group">
          <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded-xl cursor-pointer hover:bg-slate-800 transition-all border border-slate-700/50">
            <div className="flex items-center gap-2 overflow-hidden">
              <Building2 size={16} className="text-purple-400 shrink-0" />
              <span className="text-xs font-bold truncate text-slate-200">{selectedCompany?.name}</span>
            </div>
            <ChevronDown size={14} className="text-slate-500" />
          </div>
          
          <div className="absolute top-full left-0 w-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
            {companies.map(c => (
              <button
                key={c.id}
                onClick={() => onSelectCompany(c.id)}
                className={`w-full text-left px-4 py-3 text-xs hover:bg-purple-600 hover:text-white transition-colors border-b border-slate-700 last:border-0 ${c.id === selectedCompanyId ? 'bg-slate-700/50 text-purple-400 font-bold' : ''}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-6">
        {groups.map((group, gIdx) => (
          <div key={gIdx} className="space-y-2">
            <p className="px-4 text-[10px] font-black uppercase tracking-widest text-slate-600">{group.title}</p>
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id as View)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 ${
                  currentView === item.id 
                    ? 'bg-purple-600 text-white font-bold shadow-lg shadow-purple-600/20' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <item.icon size={18} />
                <span className="text-sm">{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
};

export default Sidebar;
