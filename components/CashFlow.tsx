
import React, { useState, useMemo } from 'react';
import { Transaction, TransactionType } from '../types';
import { INFLOW_CATEGORIES, OUTFLOW_CATEGORIES } from '../constants';
import { 
  TrendingUp, 
  TrendingDown, 
  Filter, 
  Download, 
  Calendar, 
  CheckCircle2, 
  Clock,
  Search,
  X,
  RefreshCcw
} from 'lucide-react';

interface CashFlowProps {
  transactions: Transaction[];
}

const CashFlow: React.FC<CashFlowProps> = ({ transactions }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');

  const allCategories = useMemo(() => {
    return ['Todas', ...INFLOW_CATEGORIES, ...OUTFLOW_CATEGORIES];
  }, []);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const dateMatch = (!startDate || t.date >= startDate) && (!endDate || t.date <= endDate);
      const categoryMatch = selectedCategory === 'Todas' || t.category === selectedCategory;
      return dateMatch && categoryMatch;
    });
  }, [transactions, startDate, endDate, selectedCategory]);

  const totalIn = useMemo(() => 
    filteredTransactions
      .filter(t => t.type === TransactionType.SALE)
      .reduce((acc, t) => acc + Number(t.paidAmount || 0), 0)
  , [filteredTransactions]);

  const totalOut = useMemo(() => 
    filteredTransactions
      .filter(t => t.type !== TransactionType.SALE)
      .reduce((acc, t) => acc + Number(t.paidAmount || 0), 0)
  , [filteredTransactions]);

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedCategory('Todas');
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Fluxo de Caixa</h2>
          <p className="text-slate-500 text-sm font-medium">Gestão financeira baseada em liquidez real (Entradas vs Saídas)</p>
        </div>
        <div className="flex gap-2">
          <button className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black flex items-center gap-2 hover:bg-slate-800 transition-all text-sm shadow-xl shadow-slate-100">
            <Download size={18} /> Exportar DRE
          </button>
        </div>
      </header>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 border-l-8 border-l-emerald-500 hover:shadow-md transition-shadow">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Entradas Realizadas</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-800 tracking-tighter">R$ {totalIn.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
            <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600"><TrendingUp size={24} /></div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 border-l-8 border-l-rose-500 hover:shadow-md transition-shadow">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saídas Realizadas</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-800 tracking-tighter">R$ {totalOut.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
            <div className="bg-rose-50 p-3 rounded-2xl text-rose-600"><TrendingDown size={24} /></div>
          </div>
        </div>
        <div className="bg-slate-900 text-white p-6 rounded-[2rem] shadow-2xl border-l-8 border-l-amber-500 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-8 -mt-8"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saldo Líquido no Período</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black tracking-tighter text-amber-400">R$ {(totalIn - totalOut).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
            <div className="bg-amber-500 p-3 rounded-2xl text-slate-900"><CheckCircle2 size={24} /></div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 space-y-4">
        <div className="flex items-center gap-2 mb-2">
           <Filter size={16} className="text-purple-600" />
           <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Painel de Filtros Avançados</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Data Inicial</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-purple-500 font-bold text-xs transition-all" 
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Data Final</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-purple-500 font-bold text-xs transition-all" 
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
            <select 
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-purple-500 font-bold text-xs transition-all appearance-none cursor-pointer"
            >
              {allCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={resetFilters}
              className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-black text-[10px] uppercase hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
            >
              <RefreshCcw size={14} /> Limpar
            </button>
          </div>
        </div>
      </div>

      {/* Tabela de Lançamentos */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/20">
          <div className="flex items-center gap-2">
            <h3 className="font-black text-slate-800 uppercase text-xs tracking-tight">Histórico Consolidado</h3>
            <span className="px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full text-[9px] font-black">{filteredTransactions.length} registros</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-8 py-4">Data</th>
                <th className="px-6 py-4">Descrição / Categoria</th>
                <th className="px-6 py-4">Fluxo</th>
                <th className="px-6 py-4 text-right">Valor Líquido</th>
                <th className="px-8 py-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center opacity-30">
                    <div className="flex flex-col items-center gap-3">
                       <Search size={48} className="text-slate-200" />
                       <p className="font-black uppercase text-xs">Nenhum lançamento para os filtros selecionados</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTransactions.slice().reverse().map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-4 text-xs font-bold text-slate-500">{t.date}</td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{t.description}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t.category}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[9px] font-black px-2 py-1 rounded-md uppercase border ${
                        t.type === TransactionType.SALE 
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                          : 'bg-rose-50 text-rose-600 border-rose-100'
                      }`}>
                        {t.type === TransactionType.SALE ? 'Entrada' : 'Saída'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-right font-black text-sm ${
                      t.type === TransactionType.SALE ? 'text-emerald-600' : 'text-slate-800'
                    }`}>
                      {t.type === TransactionType.SALE ? '+' : '-'} R$ {Number(t.paidAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex justify-center">
                        <div className="p-2 bg-slate-50 rounded-xl text-slate-300 group-hover:text-emerald-500 transition-colors">
                           <CheckCircle2 size={16} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CashFlow;
