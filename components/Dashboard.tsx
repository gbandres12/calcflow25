
import React, { useEffect, useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';
import { Transaction, InventoryItem, Customer, TransactionType } from '../types';
import { getBusinessInsights } from '../services/geminiService';
import { Brain, TrendingUp, TrendingDown, DollarSign, Package, AlertCircle } from 'lucide-react';

interface DashboardProps {
  transactions: Transaction[];
  inventory: InventoryItem[];
  customers: Customer[];
}

const Dashboard: React.FC<DashboardProps> = ({ transactions, inventory, customers }) => {
  const [insights, setInsights] = useState<string | undefined>('');
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => {
    const fetchInsights = async () => {
      setLoadingInsights(true);
      const res = await getBusinessInsights(transactions, inventory, customers);
      setInsights(res);
      setLoadingInsights(false);
    };
    fetchInsights();
  }, [transactions, inventory, customers]);

  const totalRevenue = transactions
    .filter(t => t.type === TransactionType.SALE)
    .reduce((acc, t) => acc + t.amount, 0);

  const totalExpenses = transactions
    .filter(t => t.type === TransactionType.PURCHASE || t.type === TransactionType.EXPENSE)
    .reduce((acc, t) => acc + t.amount, 0);

  const balance = totalRevenue - totalExpenses;

  const stockData = inventory.map(item => ({
    name: item.name,
    value: item.quantity
  }));

  const COLORS = ['#f59e0b', '#0f172a'];

  const monthlyData = [
    { name: 'Set', receita: 4000, despesa: 2400 },
    { name: 'Out', receita: 3000, despesa: 1398 },
    { name: 'Nov', receita: totalRevenue, despesa: totalExpenses },
  ];

  // Identifica itens com estoque baixo
  const lowStockItems = inventory.filter(item => item.quantity <= item.minStock);

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Visão Geral</h2>
          <p className="text-slate-500 text-sm">Resumo operacional e financeiro</p>
        </div>
        <div className="bg-white p-2 px-4 rounded-full border shadow-sm flex items-center gap-2 text-sm">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          Sistema Operacional
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 text-emerald-600 mb-2">
            <DollarSign size={20} />
            <span className="text-xs font-bold uppercase tracking-wider">Receita</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">R$ {totalRevenue.toLocaleString('pt-BR')}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 text-rose-600 mb-2">
            <TrendingDown size={20} />
            <span className="text-xs font-bold uppercase tracking-wider">Despesas</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">R$ {totalExpenses.toLocaleString('pt-BR')}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 text-amber-600 mb-2">
            <TrendingUp size={20} />
            <span className="text-xs font-bold uppercase tracking-wider">Saldo</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">R$ {balance.toLocaleString('pt-BR')}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 text-slate-600 mb-2">
            <Package size={20} />
            <span className="text-xs font-bold uppercase tracking-wider">Estoque</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {inventory.reduce((acc, i) => acc + i.quantity, 0).toFixed(1)} T
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="font-semibold mb-6">Fluxo Financeiro Mensal</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="receita" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesa" fill="#334155" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="text-amber-400" size={24} />
            <h3 className="font-semibold text-lg">AI Insights</h3>
          </div>
          {loadingInsights ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3 opacity-60">
              <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm">Analisando dados...</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto text-sm leading-relaxed text-slate-300">
              {insights?.split('\n').map((line, i) => (
                <p key={i} className="mb-2">{line}</p>
              ))}
              {lowStockItems.length > 0 && (
                <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex gap-3 text-rose-200">
                  <AlertCircle size={20} className="shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold">Atenção Crítica:</p>
                    {lowStockItems.map(i => <p key={i.id}>- {i.name} abaixo de {i.minStock}T</p>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
