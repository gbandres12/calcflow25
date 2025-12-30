
import React, { useState } from 'react';
import { Machine } from '../types';
import { Truck, Plus, History, Activity, Settings2, X, Save, Clock } from 'lucide-react';

interface FleetManagementProps {
  machines: Machine[];
  onAddMachine: (machine: Omit<Machine, 'id' | 'companyId'>) => void;
  onUpdateHorimeter: (machineId: string, newHorimeter: number) => void;
}

const FleetManagement: React.FC<FleetManagementProps> = ({ machines, onAddMachine, onUpdateHorimeter }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHorimeterModalOpen, setIsHorimeterModalOpen] = useState(false);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'Trator' as Machine['type'],
    plateOrId: '',
    currentHorimeter: 0,
    status: 'Operacional' as Machine['status']
  });

  const [newHorimeter, setNewHorimeter] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    onAddMachine(formData);
    setIsModalOpen(false);
    setFormData({ name: '', type: 'Trator', plateOrId: '', currentHorimeter: 0, status: 'Operacional' });
  };

  const handleUpdateHori = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMachineId && newHorimeter) {
      onUpdateHorimeter(selectedMachineId, parseFloat(newHorimeter));
      setIsHorimeterModalOpen(false);
      setNewHorimeter('');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Frota e Maquinário</h2>
          <p className="text-slate-500 text-sm font-medium">Controle de ativos operacionais e horímetros</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-all text-sm shadow-lg shadow-slate-100"
        >
          <Plus size={18} /> Cadastrar Máquina
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {machines.map(machine => (
          <div key={machine.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col justify-between group hover:shadow-xl transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-4 rounded-2xl ${machine.status === 'Operacional' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                <Truck size={24} />
              </div>
              <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase border ${
                machine.status === 'Operacional' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
              }`}>
                {machine.status}
              </span>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">{machine.name}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{machine.type} • {machine.plateOrId}</p>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between mb-6">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <Clock size={10} /> Horímetro Atual
                </p>
                <p className="text-xl font-black text-slate-800">{machine.currentHorimeter.toFixed(1)} h</p>
              </div>
              <button 
                onClick={() => { setSelectedMachineId(machine.id); setIsHorimeterModalOpen(true); }}
                className="p-2 bg-white text-slate-400 hover:text-purple-600 rounded-xl shadow-sm border border-slate-200 transition-all"
                title="Atualizar Horímetro"
              >
                <Activity size={18} />
              </button>
            </div>

            <div className="flex gap-2">
              <button className="flex-1 py-2.5 text-[10px] font-black uppercase text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">
                Histórico
              </button>
              <button className="flex-1 py-2.5 text-[10px] font-black uppercase text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">
                Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Cadastro */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden p-10 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-8">
               <h3 className="text-2xl font-black text-slate-800 tracking-tight">Cadastrar Máquina</h3>
               <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={24}/></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Equipamento</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-sm" placeholder="Ex: Pá Carregadeira 01" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</label>
                  <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as Machine['type']})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-sm">
                    <option value="Trator">Trator</option>
                    <option value="Caminhão">Caminhão</option>
                    <option value="Britador">Britador</option>
                    <option value="Pá Carregadeira">Pá Carregadeira</option>
                    <option value="Escavadeira">Escavadeira</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Placa / ID Interno</label>
                  <input required type="text" value={formData.plateOrId} onChange={e => setFormData({...formData, plateOrId: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Horímetro Inicial</label>
                <input required type="number" step="0.1" value={formData.currentHorimeter} onChange={e => setFormData({...formData, currentHorimeter: parseFloat(e.target.value)})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-black text-lg" />
              </div>
              <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black shadow-xl shadow-slate-100 mt-4">Salvar Ativo</button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Horímetro */}
      {isHorimeterModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-xl font-black text-slate-800 mb-6 tracking-tight">Atualizar Horímetro</h3>
            <form onSubmit={handleUpdateHori} className="space-y-4">
               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Novo Valor (h)</label>
                  <input required autoFocus type="number" step="0.1" value={newHorimeter} onChange={e => setNewHorimeter(e.target.value)} className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-purple-500 font-black text-3xl text-center" />
               </div>
               <div className="flex gap-3">
                  <button type="button" onClick={() => setIsHorimeterModalOpen(false)} className="flex-1 py-4 text-xs font-black uppercase text-slate-400 border border-slate-200 rounded-2xl hover:bg-slate-50">Cancelar</button>
                  <button type="submit" className="flex-[2] py-4 bg-purple-600 text-white text-xs font-black uppercase rounded-2xl shadow-xl shadow-purple-100">Atualizar</button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetManagement;
