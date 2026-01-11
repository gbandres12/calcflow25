
import React, { useState, useMemo } from 'react';
import { Transaction, TransactionType, CostCenter, Category } from '../types';
import { INITIAL_COST_CENTERS } from '../constants';
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
  ChevronRight,
  ShieldCheck,
  MessageCircle,
  AlertTriangle,
  FileText
} from 'lucide-react';

interface CashFlowProps {
  transactions: Transaction[];
  categories: Category[];
}

const CashFlow: React.FC<CashFlowProps> = ({ transactions, categories }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedCCId, setSelectedCCId] = useState('Todos');
  const [isClosureModalOpen, setIsClosureModalOpen] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  const allCategoryNames = useMemo(() => {
    const names = categories.map(c => c.name);
    return ['Todas', ...Array.from(new Set(names))];
  }, [categories]);

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

  const todayTransactions = useMemo(() => transactions.filter(t => t.date === todayStr), [transactions, todayStr]);
  const todayIn = todayTransactions.filter(t => t.type === TransactionType.SALE).reduce((acc, t) => acc + Number(t.paidAmount || 0), 0);
  const todayOut = todayTransactions.filter(t => t.type !== TransactionType.SALE).reduce((acc, t) => acc + Number(t.paidAmount || 0), 0);
  const todayBalance = todayIn - todayOut;

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

  const handleWhatsAppClosure = () => {
    const dateFormatted = new Date().toLocaleDateString('pt-BR');
    const message = `*FECHAMENTO DE CAIXA DIÁRIO* 📊%0A*Empresa:* Calcário Amazônia%0A*Data:* ${dateFormatted}%0A%0A----------------------------%0A🟢 *ENTRADAS:* R$ ${todayIn.toLocaleString('pt-BR')}%0A🔴 *SAÍDAS:* R$ ${todayOut.toLocaleString('pt-BR')}%0A💰 *SALDO LÍQUIDO:* R$ ${todayBalance.toLocaleString('pt-BR')}%0A----------------------------%0A%0A*Resumo de Transações:*%0A${todayTransactions.map(t => `- ${t.description}: R$ ${t.paidAmount.toLocaleString('pt-BR')}`).join('%0A')}%0A%0A_Enviado via CalcárioFlow ERP_`;
    window.open(`https://api.whatsapp.com/send?text=${message}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Fluxo de Caixa</h2>
          <p className="text-slate-500 text-sm font-medium">Gestão baseada em liquidez real</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsClosureModalOpen(true)}
            className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-black flex items-center gap-2 hover:bg-emerald-700 transition-all text-sm shadow-xl shadow-emerald-100"
          >
            <ShieldCheck size={18} /> Fechar Caixa do Dia
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 border-l-8 border-l-emerald-500">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Entradas</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-800">R$ {totalIn.toLocaleString('pt-BR')}</h3>
            <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600"><TrendingUp size={24} /></div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 border-l-8 border-l-rose-500">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saídas</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-800">R$ {totalOut.toLocaleString('pt-BR')}</h3>
            <div className="bg-rose-50 p-3 rounded-2xl text-rose-600"><TrendingDown size={24} /></div>
          </div>
        </div>
        <div className="bg-slate-900 text-white p-6 rounded-[2rem] shadow-2xl border-l-8 border-l-amber-500">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saldo Líquido</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-amber-400">R$ {(totalIn - totalOut).toLocaleString('pt-BR')}</h3>
            <div className="bg-amber-500 p-3 rounded-2xl text-slate-900"><CheckCircle2 size={24} /></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
          <div className="flex items-center gap-2 mb-2">
             <Filter size={16} className="text-purple-600" />
             <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Filtros Avançados</h4>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-purple-500 font-bold text-xs">
                {allCategoryNames.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <button onClick={resetFilters} className="w-full py-3 bg-slate-100 text-slate-500 rounded-xl font-black text-[10px] uppercase hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
              <RefreshCcw size={14} /> Redefinir Busca
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
           <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest border-l-4 border-purple-500 pl-4">Distribuição por C. Custo</h3>
              <BarChart3 size={20} className="text-slate-300" />
           </div>
           <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
              {INITIAL_COST_CENTERS.map(cc => {
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
                       </div>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                       <div className="h-full transition-all duration-1000" style={{ width: `${percentageOut}%`, backgroundColor: cc.color }}></div>
                    </div>
                  </div>
                );
              })}
           </div>
        </div>
      </div>

      {isClosureModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[150] flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-xl rounded-[3rem] p-10 shadow-2xl space-y-8 animate-in zoom-in-95 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500"></div>
              <div className="flex justify-between items-start">
                 <h3 className="text-2xl font-black text-slate-800 tracking-tight">Fechamento de Caixa Diário</h3>
                 <button onClick={() => setIsClosureModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400"><X size={24}/></button>
              </div>
              <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-center">
                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Saldo Final em Caixa</p>
                 <p className={`text-4xl font-black ${todayBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>R$ {todayBalance.toLocaleString('pt-BR')}</p>
              </div>
              <div className="flex gap-4">
                 <button onClick={handleWhatsAppClosure} disabled={todayTransactions.length === 0} className="flex-1 py-5 bg-emerald-600 text-white rounded-2xl font-black shadow-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 uppercase text-xs">
                    <MessageCircle size={20} /> WhatsApp
                 </button>
                 <button onClick={() => window.print()} className="px-8 py-5 border border-slate-200 text-slate-400 rounded-2xl font-black uppercase text-xs">PDF</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default CashFlow;
