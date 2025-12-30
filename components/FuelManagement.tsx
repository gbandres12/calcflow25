
import React, { useState } from 'react';
import { Machine, FuelRecord } from '../types';
import { Fuel, Plus, History, X, Droplets, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

interface FuelManagementProps {
  machines: Machine[];
  fuelRecords: FuelRecord[];
  onAddFuel: (record: Omit<FuelRecord, 'id' | 'companyId'>) => void;
}

const FuelManagement: React.FC<FuelManagementProps> = ({ machines, fuelRecords, onAddFuel }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    machineId: '',
    date: new Date().toISOString().split('T')[0],
    liters: 0,
    pricePerLiter: 0,
    horimeter: 0
  });

  const totalSpent = fuelRecords.reduce((acc, curr) => acc + curr.totalCost, 0);
  const totalLiters = fuelRecords.reduce((acc, curr) => acc + curr.liters, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddFuel({
      ...formData,
      totalCost: formData.liters * formData.pricePerLiter
    });
    setIsModalOpen(false);
    setFormData({ machineId: '', date: new Date().toISOString().split('T')[0], liters: 0, pricePerLiter: 0, horimeter: 0 });
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Gestão de Combustível</h2>
          <p className="text-slate-500 text-sm font-medium">Controle de abastecimento e eficiência energética</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-amber-500 text-slate-900 px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-amber-400 transition-all text-sm shadow-lg shadow-amber-100"
        >
          <Plus size={18} /> Registrar Abastecimento
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
           <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl"><Droplets size={24}/></div>
           <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Consumido</p>
              <p className="text-2xl font-black text-slate-800">{totalLiters.toFixed(1)} LT</p>
           </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
           <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><DollarSign size={24}/></div>
           <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Custo Acumulado</p>
              <p className="text-2xl font-black text-slate-800">R$ {totalSpent.toLocaleString('pt-BR')}</p>
           </div>
        </div>
        <div className="bg-slate-900 p-6 rounded-[2rem] shadow-xl flex items-center gap-4 text-white">
           <div className="p-4 bg-slate-800 text-amber-400 rounded-2xl"><TrendingUp size={24}/></div>
           <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60">Preço Médio (LT)</p>
              <p className="text-2xl font-black">R$ {(totalLiters > 0 ? totalSpent / totalLiters : 0).toFixed(2)}</p>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
           <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm flex items-center gap-2"><History size={18}/> Últimos Abastecimentos</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-8 py-4">Data</th>
                <th className="px-6 py-4">Equipamento</th>
                <th className="px-6 py-4">Volume</th>
                <th className="px-6 py-4">Horímetro</th>
                <th className="px-6 py-4 text-right">Valor Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {fuelRecords.length === 0 ? (
                <tr>
                   <td colSpan={5} className="text-center py-20 text-slate-400 font-bold uppercase text-xs">Nenhum registro de combustível.</td>
                </tr>
              ) : (
                fuelRecords.slice().reverse().map(record => (
                  <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-5 text-xs font-bold text-slate-500">{record.date}</td>
                    <td className="px-6 py-5">
                       <p className="text-sm font-black text-slate-800 uppercase tracking-tight">
                         {machines.find(m => m.id === record.machineId)?.name}
                       </p>
                       <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID: {record.machineId}</p>
                    </td>
                    <td className="px-6 py-5 text-sm font-black text-slate-800">{record.liters} LT</td>
                    <td className="px-6 py-5 text-sm font-bold text-slate-500">{record.horimeter} h</td>
                    <td className="px-6 py-5 text-right font-black text-slate-900">R$ {record.totalCost.toLocaleString('pt-BR')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Abastecimento */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-8">
                 <h3 className="text-2xl font-black text-slate-800 tracking-tight">Registrar Abastecimento</h3>
                 <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={24}/></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Equipamento</label>
                       <select required value={formData.machineId} onChange={e => setFormData({...formData, machineId: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm">
                          <option value="">Selecione...</option>
                          {machines.map(m => <option key={m.id} value={m.id}>{m.name} ({m.plateOrId})</option>)}
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</label>
                       <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm" />
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Litros</label>
                       <input required type="number" step="0.1" value={formData.liters} onChange={e => setFormData({...formData, liters: parseFloat(e.target.value)})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg" />
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preço por Litro (R$)</label>
                       <input required type="number" step="0.001" value={formData.pricePerLiter} onChange={e => setFormData({...formData, pricePerLiter: parseFloat(e.target.value)})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg" />
                    </div>
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Horímetro no Ato (h)</label>
                    <input required type="number" step="0.1" value={formData.horimeter} onChange={e => setFormData({...formData, horimeter: parseFloat(e.target.value)})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg" />
                 </div>
                 <div className="p-6 bg-slate-900 rounded-[2rem] flex flex-col items-center text-white mt-4 border border-slate-800 shadow-xl">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Custo Total Estimado</span>
                    <span className="text-3xl font-black">R$ {(formData.liters * formData.pricePerLiter).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                 </div>
                 <button type="submit" className="w-full py-5 bg-amber-500 text-slate-900 rounded-2xl font-black shadow-xl mt-4 uppercase tracking-widest">Salvar Registro</button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default FuelManagement;
