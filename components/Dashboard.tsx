
import React, { useEffect, useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';
import { Transaction, InventoryItem, Customer, TransactionType, View, User, UserRole, SaleOrder, FinancialAccount, OrderStatus } from '../types';
import { getBusinessInsights } from '../services/geminiService';
import { 
  Brain, TrendingUp, TrendingDown, DollarSign, Package, AlertCircle, 
  ZapOff, Zap, UserPlus, ShoppingCart, Factory, ChevronRight, Truck, Boxes, Scale, FileText
} from 'lucide-react';
import { OnboardingChecklist } from './OnboardingChecklist';

interface DashboardProps {
  transactions: Transaction[];
  inventory: InventoryItem[];
  customers: Customer[];
  orders?: SaleOrder[];
  accounts?: FinancialAccount[];
  user?: User | null;
  onNavigate?: (view: View) => void;
  onOpenOnboardingModal?: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  transactions, 
  inventory, 
  customers, 
  orders = [],
  accounts = [],
  user,
  onNavigate,
  onOpenOnboardingModal
}) => {
  const [insights, setInsights] = useState<string>('');
  const [loadingInsights, setLoadingInsights] = useState(false);

  const isFinancialAllowed = user?.role === UserRole.ADMIN || user?.role === UserRole.MANAGER;

  useEffect(() => {
    const fetchInsights = async () => {
      setLoadingInsights(true);
      try {
        const res = await getBusinessInsights(
          isFinancialAllowed ? transactions : [], 
          inventory, 
          customers
        );
        setInsights(typeof res === 'string' ? res : String(res));
      } catch (e) {
        setInsights("Recurso indisponível.");
      }
      setLoadingInsights(false);
    };
    fetchInsights();
  }, [transactions, inventory, customers, isFinancialAllowed]);

  const totalRevenue = transactions
    .filter(t => t.type === TransactionType.SALE)
    .reduce((acc, t) => acc + Number(t.amount), 0);

  const totalExpenses = transactions
    .filter(t => t.type === TransactionType.PURCHASE || t.type === TransactionType.EXPENSE)
    .reduce((acc, t) => acc + Number(t.amount), 0);

  const balance = totalRevenue - totalExpenses;

  const totalTonnageSold = orders.reduce((acc, o) => {
    const orderTons = (o.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    return acc + orderTons;
  }, 0);
  const totalOrdersCount = orders.length;
  const pendingOrdersCount = orders.filter(o => o.status === OrderStatus.BUDGET || o.withdrawalStatus === 'aguardando' || o.withdrawalStatus === 'parcial').length;
  const totalInventoryTons = inventory.reduce((acc, i) => acc + Number(i.quantity), 0);

  const monthlyData = [
    { name: 'Set', receita: 4000, despesa: 2400 },
    { name: 'Out', receita: 3000, despesa: 1398 },
    { name: 'Nov', receita: totalRevenue, despesa: totalExpenses },
  ];

  // Agrupamento operacional por produto para operadores/supervisores
  const operationalProductData = inventory.map(item => ({
    name: item.name.length > 14 ? item.name.slice(0, 14) + '...' : item.name,
    toneladas: Number(item.quantity || 0),
    minimo: Number(item.minStock || 0)
  }));

  const lowStockItems = inventory.filter(item => Number(item.quantity) <= Number(item.minStock));

  const quickActions = isFinancialAllowed ? [
    { id: 'users', label: 'Novo Usuário', icon: UserPlus, color: 'bg-purple-600', hover: 'hover:bg-purple-700' },
    { id: 'orders', label: 'Nova Venda', icon: ShoppingCart, color: 'bg-emerald-600', hover: 'hover:bg-emerald-700' },
    { id: 'daily', label: 'Mov. Diária', icon: DollarSign, color: 'bg-indigo-600', hover: 'hover:bg-indigo-700' },
    { id: 'inventory', label: 'Ver Estoque', icon: Package, color: 'bg-slate-800', hover: 'hover:bg-slate-900' },
  ] : [
    { id: 'orders', label: 'Carregamento', icon: Truck, color: 'bg-purple-600', hover: 'hover:bg-purple-700' },
    { id: 'yard', label: 'Pátio & Balança', icon: Boxes, color: 'bg-emerald-600', hover: 'hover:bg-emerald-700' },
    { id: 'milling', label: 'Moagem Hoje', icon: Factory, color: 'bg-amber-500', hover: 'hover:bg-amber-600' },
    { id: 'inventory', label: 'Ver Estoque', icon: Package, color: 'bg-slate-800', hover: 'hover:bg-slate-900' },
  ];

  return (
    <div className="space-y-8">
      {/* Widget de Onboarding e Primeiros Passos do SaaS */}
      {user && (
        <OnboardingChecklist 
          user={user}
          customers={customers}
          orders={orders}
          transactions={transactions}
          accounts={accounts}
          onNavigate={onNavigate}
          onOpenOnboardingModal={onOpenOnboardingModal}
        />
      )}

      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">
            {isFinancialAllowed ? 'Painel Executivo & Geral' : 'Painel Operacional & Pátio'}
          </h2>
          <p className="text-slate-500 text-sm font-medium">
            {isFinancialAllowed 
              ? 'Dados financeiros e produtivos sincronizados em tempo real'
              : 'Visão de pesagem, carregamentos, estoque mineral e pátio em tempo real'}
          </p>
        </div>
        <div className="bg-emerald-50 text-emerald-700 p-2 px-4 rounded-full border border-emerald-100 flex items-center gap-2 text-[10px] font-black uppercase">
          <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
          Fluxo Operacional Ativo
        </div>
      </header>

      {/* Atalhos Rápidos */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
           <Zap size={16} className="text-amber-500" />
           <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Atalhos Operacionais</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
           {quickActions.map(action => (
             <button 
                key={action.id}
                onClick={() => onNavigate?.(action.id as View)}
                className={`flex items-center justify-between p-5 ${action.color} ${action.hover} text-white rounded-[2rem] transition-all shadow-lg shadow-slate-200 group overflow-hidden relative`}
             >
                <div className="flex flex-col items-start gap-1 z-10 text-left">
                   <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Ação Rápida</span>
                   <span className="text-sm font-black">{action.label}</span>
                </div>
                <action.icon size={28} className="opacity-20 group-hover:scale-125 transition-transform group-hover:opacity-40" />
                <div className="absolute -right-4 -bottom-4 bg-white/10 w-16 h-16 rounded-full group-hover:scale-150 transition-transform"></div>
             </button>
           ))}
        </div>
      </section>

      {/* Cards de Métricas */}
      {isFinancialAllowed ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 hover:border-emerald-200 transition-all group">
            <div className="flex items-center gap-3 text-emerald-600 mb-2">
              <DollarSign size={20} className="group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Receita Bruta</span>
            </div>
            <p className="text-2xl font-black text-slate-800 tracking-tighter">R$ {totalRevenue.toLocaleString('pt-BR')}</p>
          </div>
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 hover:border-rose-200 transition-all group">
            <div className="flex items-center gap-3 text-rose-600 mb-2">
              <TrendingDown size={20} className="group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Total Despesas</span>
            </div>
            <p className="text-2xl font-black text-slate-800 tracking-tighter">R$ {totalExpenses.toLocaleString('pt-BR')}</p>
          </div>
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 hover:border-amber-200 transition-all group">
            <div className="flex items-center gap-3 text-amber-600 mb-2">
              <TrendingUp size={20} className="group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Saldo Caixa</span>
            </div>
            <p className="text-2xl font-black text-slate-800 tracking-tighter">R$ {balance.toLocaleString('pt-BR')}</p>
          </div>
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 hover:border-blue-200 transition-all group">
            <div className="flex items-center gap-3 text-blue-600 mb-2">
              <Package size={20} className="group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Estoque Total</span>
            </div>
            <p className="text-2xl font-black text-slate-800 tracking-tighter">
              {totalInventoryTons.toFixed(1)} T
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 hover:border-purple-200 transition-all group">
            <div className="flex items-center gap-3 text-purple-600 mb-2">
              <FileText size={20} className="group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Romaneios / Pedidos</span>
            </div>
            <p className="text-2xl font-black text-slate-800 tracking-tighter">{totalOrdersCount} emitidos</p>
          </div>
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 hover:border-amber-200 transition-all group">
            <div className="flex items-center gap-3 text-amber-600 mb-2">
              <Truck size={20} className="group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Carregamento Ativo</span>
            </div>
            <p className="text-2xl font-black text-slate-800 tracking-tighter">{pendingOrdersCount} caminhões</p>
          </div>
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 hover:border-emerald-200 transition-all group">
            <div className="flex items-center gap-3 text-emerald-600 mb-2">
              <Scale size={20} className="group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Volume Expedido</span>
            </div>
            <p className="text-2xl font-black text-slate-800 tracking-tighter">{totalTonnageSold.toFixed(1)} T</p>
          </div>
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 hover:border-blue-200 transition-all group">
            <div className="flex items-center gap-3 text-blue-600 mb-2">
              <Package size={20} className="group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Estoque Total</span>
            </div>
            <p className="text-2xl font-black text-slate-800 tracking-tighter">
              {totalInventoryTons.toFixed(1)} T
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-8 border-l-4 border-amber-500 pl-4">
            {isFinancialAllowed ? 'Desempenho Financeiro (Receitas x Despesas)' : 'Estoque Mineral Disponível por Produto (Toneladas)'}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              {isFinancialAllowed ? (
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} fontStyle="bold" />
                  <YAxis axisLine={false} tickLine={false} fontSize={10} fontStyle="bold" />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="receita" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={40} />
                  <Bar dataKey="despesa" fill="#1e293b" radius={[6, 6, 0, 0]} barSize={40} />
                </BarChart>
              ) : (
                <BarChart data={operationalProductData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} fontStyle="bold" />
                  <YAxis axisLine={false} tickLine={false} fontSize={10} fontStyle="bold" />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="toneladas" fill="#9333ea" radius={[6, 6, 0, 0]} barSize={36} name="Em Estoque (T)" />
                  <Bar dataKey="minimo" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={36} name="Mínimo Alerta (T)" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-2xl flex flex-col relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl"></div>
          
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-amber-500/20 rounded-xl">
               <ZapOff className="text-amber-400" size={24} />
            </div>
            <div>
               <h3 className="font-black text-lg tracking-tight uppercase">IA Operacional</h3>
               <span className="text-[8px] font-black text-amber-400 uppercase tracking-widest bg-amber-400/10 px-2 py-0.5 rounded">Assistente</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto text-sm leading-relaxed text-slate-400 font-medium">
            {insights}
            
            {lowStockItems.length > 0 && (
              <div className="mt-8 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex gap-3 text-rose-200">
                <AlertCircle size={20} className="shrink-0 text-rose-500" />
                <div className="text-[10px] uppercase font-bold">
                  <p className="text-rose-500 mb-1">Alertas de Estoque Mineral:</p>
                  {lowStockItems.map(i => <p key={i.id} className="opacity-80">• {i.name} CRÍTICO ({i.quantity}T)</p>)}
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-6 pt-6 border-t border-white/5 flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-black">?</div>
             <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
               {isFinancialAllowed 
                 ? 'Ative a chave de API nas configurações para relatórios executivos avançados.'
                 : 'Monitoramento em tempo real de expedição, pátio e estoque mineral.'}
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
