
import React, { useState } from 'react';
import { Category } from '../types';
import { Plus, Trash2, Tag, TrendingUp, TrendingDown, Search, X, AlertCircle } from 'lucide-react';

interface CategorySettingsProps {
  categories: Category[];
  onAddCategory: (name: string, type: 'INFLOW' | 'OUTFLOW') => void;
  onDeleteCategory: (id: string) => void;
}

const CategorySettings: React.FC<CategorySettingsProps> = ({ categories, onAddCategory, onDeleteCategory }) => {
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'INFLOW' | 'OUTFLOW'>('OUTFLOW');
  const [search, setSearch] = useState('');

  const inflows = categories.filter(c => c.type === 'INFLOW' && c.name.toLowerCase().includes(search.toLowerCase()));
  const outflows = categories.filter(c => c.type === 'OUTFLOW' && c.name.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onAddCategory(newName.trim(), newType);
    setNewName('');
  };

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Categorias de Lançamento</h2>
          <p className="text-slate-500 text-sm font-medium">Personalize as classificações financeiras do sistema</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulário de Adição */}
        <div className="lg:col-span-1 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 h-fit">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2">
            <Plus size={18} className="text-purple-600" /> Nova Categoria
          </h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome da Categoria</label>
              <input 
                required
                type="text" 
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-sm"
                placeholder="Ex: Aluguel de Galpão"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Fluxo</label>
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-2xl">
                <button 
                  type="button" 
                  onClick={() => setNewType('INFLOW')}
                  className={`py-2 rounded-xl text-[10px] font-black uppercase transition-all ${newType === 'INFLOW' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
                >
                  Entrada
                </button>
                <button 
                  type="button" 
                  onClick={() => setNewType('OUTFLOW')}
                  className={`py-2 rounded-xl text-[10px] font-black uppercase transition-all ${newType === 'OUTFLOW' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}
                >
                  Saída
                </button>
              </div>
            </div>
            <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
              <Plus size={16} /> Adicionar Categoria
            </button>
          </form>

          <div className="mt-8 p-4 bg-amber-50 rounded-2xl flex gap-3">
             <AlertCircle size={20} className="text-amber-500 shrink-0" />
             <p className="text-[9px] text-amber-700 font-bold uppercase leading-relaxed tracking-tighter">
               As categorias criadas estarão disponíveis imediatamente para novos lançamentos e filtros de fluxo de caixa.
             </p>
          </div>
        </div>

        {/* Listagem de Categorias */}
        <div className="lg:col-span-2 space-y-6">
           <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
              <Search className="text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Pesquisar categoria..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-transparent border-none outline-none font-medium text-sm w-full"
              />
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Entradas */}
              <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                 <div className="p-6 bg-emerald-50/30 border-b border-emerald-50 flex items-center gap-2">
                    <TrendingUp size={18} className="text-emerald-600" />
                    <h4 className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Entradas (Receitas)</h4>
                 </div>
                 <div className="p-2 space-y-1">
                    {inflows.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-4 hover:bg-slate-50 rounded-2xl transition-all group">
                         <div className="flex items-center gap-3">
                            <Tag size={14} className="text-emerald-500" />
                            <span className="text-sm font-black text-slate-700 uppercase tracking-tight">{c.name}</span>
                         </div>
                         <button 
                          onClick={() => onDeleteCategory(c.id)}
                          className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                         >
                            <Trash2 size={16} />
                         </button>
                      </div>
                    ))}
                    {inflows.length === 0 && <p className="p-8 text-center text-xs font-bold text-slate-400 italic">Nenhuma categoria de entrada.</p>}
                 </div>
              </div>

              {/* Saídas */}
              <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                 <div className="p-6 bg-rose-50/30 border-b border-rose-50 flex items-center gap-2">
                    <TrendingDown size={18} className="text-rose-600" />
                    <h4 className="text-[10px] font-black text-rose-700 uppercase tracking-widest">Saídas (Despesas)</h4>
                 </div>
                 <div className="p-2 space-y-1">
                    {outflows.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-4 hover:bg-slate-50 rounded-2xl transition-all group">
                         <div className="flex items-center gap-3">
                            <Tag size={14} className="text-rose-500" />
                            <span className="text-sm font-black text-slate-700 uppercase tracking-tight">{c.name}</span>
                         </div>
                         <button 
                          onClick={() => onDeleteCategory(c.id)}
                          className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                         >
                            <Trash2 size={16} />
                         </button>
                      </div>
                    ))}
                    {outflows.length === 0 && <p className="p-8 text-center text-xs font-bold text-slate-400 italic">Nenhuma categoria de saída.</p>}
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default CategorySettings;
