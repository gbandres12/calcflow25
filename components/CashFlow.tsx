
import React, { useState, useMemo } from 'react';
import { Transaction, TransactionType, CostCenter } from '../types';
import { INFLOW_CATEGORIES, OUTFLOW_CATEGORIES, INITIAL_COST_CENTERS } from '../constants';
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
  RefreshCcw,
  PieChart as PieChartIcon,
  BarChart3,
  ChevronRight
} from 'lucide-react';

interface CashFlowProps {
  transactions: Transaction[];
}

const CashFlow: React.FC<CashFlowProps> = ({ transactions }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedCCId, setSelectedCCId] = useState('Todos');

  const allCategories = useMemo(() => {
    return ['Todas', ...INFLOW_CATEGORIES, ...OUTFLOW_CATEGORIES];
  }, []);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const dateMatch = (!startDate || t.date >= startDate) && (!endDate || t.date <= endDate);
      const categoryMatch = selectedCategory === 'Todas' || t.category === selectedCategory;
      const ccMatch = selectedCCId === 'Todos' || t.costCenterId === selectedCCId;
      return dateMatch && categoryMatch && ccMatch;
    });
  }, [transactions, startDate, endDate, selectedCategory, selectedCCId]);

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

  // Consolidação por Centro de Custo
  // Fix: Explicitly defining the return type for useMemo to ensure costCenterSummary is correctly typed as a Record.
  const costCenterSummary: Record<string, { in: number, out: number }> = useMemo(() => {
    const summary: Record<string, { in: number, out: number }> = {};
    
    INITIAL_COST_CENTERS.forEach(cc => {
      summary[cc.id] = { in: 0, out: 0 };
    });

    filteredTransactions.forEach(t => {
      if (t.costCenterId && summary[t.costCenterId]) {
        if (t.type === TransactionType.SALE) {
          summary[t.costCenterId].in += Number(t.paidAmount || 0);
        } else {
          summary[t.costCenterId].out += Number(t.paidAmount || 0);
        }
      }
    });

    return summary;
  }, [filteredTransactions]);

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedCategory('Todas');
    setSelectedCCId('Todos');
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Painel de Filtros */}
        <div className="lg:col-span-1 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
          <div className="flex items-center gap-2 mb-2">
             <Filter size={16} className="text-purple-600" />
             <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Painel de Filtros</h4>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Período</label>
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-purple-500 font-bold text-xs" />
                </div>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-purple-500 font-bold text-xs" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Centro de Custo</label>
              <select value={selectedCCId} onChange={(e) => setSelectedCCId(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-purple-500 font-bold text-xs">
                <option value="Todos">Todos os Centros</option>
                {INITIAL_COST_CENTERS.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-purple-500 font-bold text-xs">
                {allCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            <button onClick={resetFilters} className="w-full py-3 bg-slate-100 text-slate-500 rounded-xl font-black text-[10px] uppercase hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
              <RefreshCcw size={14} /> Limpar Filtros
            </button>
          </div>
        </div>

        {/* Consolidado por Centro de Custo */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
           <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest border-l-4 border-purple-500 pl-4">Impacto por Centro de Custo</h3>
              <BarChart3 size={20} className="text-slate-300" />
           </div>

           <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
              {INITIAL_COST_CENTERS.map(cc => {
                // Fix: Use an explicit type assertion to prevent 'unknown' inference during index access on costCenterSummary.
                const data = (costCenterSummary[cc.id] || { in: 0, out: 0 }) as { in: number; out: number };
                const total = data.in + data.out;
                if (total === 0 && selectedCCId === 'Todos') return null;
                
                const percentageOut = totalOut > 0 ? (data.out / totalOut) * 100 : 0;

                return (
                  <div key={cc.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-purple-200 transition-all">
                    <div className="flex justify-between items-start mb-3">
                       <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cc.color }}></div>
                          <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{cc.name}</p>
                       </div>
                       <div className="text-right">
                          <p className="text-xs font-black text-slate-900">R$ {data.out.toLocaleString('pt-BR')}</p>
                          <p className="text-[9px] font-bold text-rose-500 uppercase">Saídas</p>
                       </div>
                    </div>
                    
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                       <div 
                        className="h-full transition-all duration-1000" 
                        style={{ width: `${percentageOut}%`, backgroundColor: cc.color }}
                       ></div>
                    </div>
                    
                    <div className="flex justify-between items-center mt-2">
                       <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Peso nas Despesas: {percentageOut.toFixed(1)}%</p>
                       {data.in > 0 && (
                         <p className="text-[9px] font-bold text-emerald-600 uppercase flex items-center gap-1">
                           <TrendingUp size={10} /> Entradas: R$ {data.in.toLocaleString('pt-BR')}
                         </p>
                       )}
                    </div>
                  </div>
                );
              })}
              {Object.values(costCenterSummary).every(s => s.in === 0 && s.out === 0) && (
                <div className="text-center py-10 text-slate-400 text-xs font-bold uppercase italic">Sem dados para o período selecionado</div>
              )}
           </div>
        </div>
      </div>

      {/* Tabela de Lançamentos Detalhada */}
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
                <th className="px-6 py-4">Descrição / Centro de Custo</th>
                <th className="px-6 py-4">Fluxo</th>
                <th className="px-6 py-4 text-right">Valor Líquido</th>
                <th className="px-8 py-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredTransactions.slice().reverse().map(t => (
                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-4 text-xs font-bold text-slate-500">{t.date}</td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{t.description}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                       <div className="w-2 h-2 rounded-full" style={{ backgroundColor: INITIAL_COST_CENTERS.find(cc => cc.id === t.costCenterId)?.color || '#CBD5E1' }}></div>
                       <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        {INITIAL_COST_CENTERS.find(cc => cc.id === t.costCenterId)?.name || 'N/A'} • {t.category}
                       </p>
                    </div>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CashFlow;
