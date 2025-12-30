
import React, { useState } from 'react';
import { Machine, StoreItem, MaintenanceRecord } from '../types';
import { Boxes, Plus, Wrench, Search, Package, AlertTriangle, X, Settings } from 'lucide-react';

interface YardManagementProps {
  machines: Machine[];
  storeItems: StoreItem[];
  maintenances: MaintenanceRecord[];
  onAddMaintenance: (record: Omit<MaintenanceRecord, 'id' | 'companyId'>) => void;
  onAddStoreItem: (item: Omit<StoreItem, 'id' | 'companyId'>) => void;
  onUpdateStoreItem: (item: StoreItem) => void;
}

const YardManagement: React.FC<YardManagementProps> = ({ machines, storeItems, maintenances, onAddMaintenance, onAddStoreItem, onUpdateStoreItem }) => {
  const [activeTab, setActiveTab] = useState<'store' | 'maintenance'>('store');
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [isMaintModalOpen, setIsMaintModalOpen] = useState(false);

  const [storeForm, setStoreForm] = useState({
    name: '',
    category: 'Peças' as StoreItem['category'],
    quantity: 0,
    unit: 'UN',
    minStock: 1
  });

  const [maintForm, setMaintForm] = useState({
    machineId: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    cost: 0,
    type: 'Preventiva' as MaintenanceRecord['type'],
    horimeter: 0
  });

  const handleAddStore = (e: React.FormEvent) => {
    e.preventDefault();
    onAddStoreItem(storeForm);
    setIsStoreModalOpen(false);
    setStoreForm({ name: '', category: 'Peças', quantity: 0, unit: 'UN', minStock: 1 });
  };

  const handleAddMaint = (e: React.FormEvent) => {
    e.preventDefault();
    onAddMaintenance(maintForm);
    setIsMaintModalOpen(false);
    setMaintForm({ machineId: '', date: new Date().toISOString().split('T')[0], description: '', cost: 0, type: 'Preventiva', horimeter: 0 });
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Pátio e Almoxarifado</h2>
          <p className="text-slate-500 text-sm font-medium">Gestão de peças, ferramentas e ordens de serviço</p>
        </div>
        <div className="flex bg-slate-200 p-1.5 rounded-2xl">
           <button onClick={() => setActiveTab('store')} className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'store' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Almoxarifado</button>
           <button onClick={() => setActiveTab('maintenance')} className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'maintenance' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Manutenções</button>
        </div>
      </header>

      {activeTab === 'store' ? (
        <div className="space-y-6">
           <div className="flex gap-4 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="Pesquisar no almoxarifado..." className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-medium text-sm" />
              </div>
              <button onClick={() => setIsStoreModalOpen(true)} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 text-sm shadow-xl shadow-slate-100">
                 <Plus size={18}/> Novo Item
              </button>
           </div>

           <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
             <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-8 py-4">Item / Categoria</th>
                    <th className="px-6 py-4">Estoque Atual</th>
                    <th className="px-6 py-4">Unidade</th>
                    <th className="px-6 py-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                   {storeItems.map(item => (
                     <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-5">
                           <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{item.name}</p>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.category}</p>
                        </td>
                        <td className="px-6 py-5 font-black text-slate-800">{item.quantity}</td>
                        <td className="px-6 py-5 text-xs font-bold text-slate-500">{item.unit}</td>
                        <td className="px-6 py-5">
                           <div className="flex justify-center">
                              {item.quantity <= item.minStock ? (
                                <span className="bg-rose-50 text-rose-600 px-3 py-1 rounded-full text-[9px] font-black uppercase border border-rose-100 flex items-center gap-1">
                                   <AlertTriangle size={10}/> Reposição
                                </span>
                              ) : (
                                <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-[9px] font-black uppercase border border-emerald-100">Ok</span>
                              )}
                           </div>
                        </td>
                     </tr>
                   ))}
                </tbody>
             </table>
           </div>
        </div>
      ) : (
        <div className="space-y-6">
           <div className="flex justify-end">
              <button onClick={() => setIsMaintModalOpen(true)} className="bg-purple-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 text-sm shadow-xl shadow-purple-100">
                 <Wrench size={18}/> Lançar Manutenção
              </button>
           </div>

           <div className="grid grid-cols-1 gap-4">
              {maintenances.slice().reverse().map(mnt => (
                <div key={mnt.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-6 group hover:shadow-lg transition-all">
                   <div className={`p-4 rounded-2xl ${mnt.type === 'Preventiva' ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'}`}>
                      <Wrench size={24}/>
                   </div>
                   <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                         <h4 className="font-black text-slate-800 uppercase tracking-tight text-sm">{mnt.description}</h4>
                         <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase tracking-widest">{mnt.type}</span>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                         Máquina: {machines.find(m => m.id === mnt.machineId)?.name} • Data: {mnt.date} • Horímetro: {mnt.horimeter}h
                      </p>
                   </div>
                   <div className="text-right">
                      <p className="text-sm font-black text-slate-800">R$ {mnt.cost.toLocaleString('pt-BR')}</p>
                      <p className="text-[9px] font-black text-emerald-600 uppercase">Efetivado</p>
                   </div>
                </div>
              ))}
              {maintenances.length === 0 && (
                <div className="text-center py-20 bg-white rounded-[2rem] border border-dashed border-slate-200 text-slate-400 font-bold uppercase text-xs">
                   Nenhuma ordem de manutenção registrada.
                </div>
              )}
           </div>
        </div>
      )}

      {/* Modal Almoxarifado */}
      {isStoreModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">Novo Item de Pátio</h3>
                <button onClick={() => setIsStoreModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X/></button>
             </div>
             <form onSubmit={handleAddStore} className="space-y-4">
                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição do Item</label>
                   <input required type="text" value={storeForm.name} onChange={e => setStoreForm({...storeForm, name: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
                      <select value={storeForm.category} onChange={e => setStoreForm({...storeForm, category: e.target.value as StoreItem['category']})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm">
                         <option value="Peças">Peças</option>
                         <option value="Lubrificantes">Lubrificantes</option>
                         <option value="EPI">EPI</option>
                         <option value="Ferramentas">Ferramentas</option>
                         <option value="Outros">Outros</option>
                      </select>
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidade</label>
                      <input required type="text" value={storeForm.unit} onChange={e => setStoreForm({...storeForm, unit: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm" placeholder="UN, KG, LT..." />
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Qtd Inicial</label>
                      <input required type="number" value={storeForm.quantity} onChange={e => setStoreForm({...storeForm, quantity: parseFloat(e.target.value)})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg" />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estoque Mínimo</label>
                      <input required type="number" value={storeForm.minStock} onChange={e => setStoreForm({...storeForm, minStock: parseFloat(e.target.value)})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg" />
                   </div>
                </div>
                <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black shadow-xl mt-4">Salvar no Almoxarifado</button>
             </form>
          </div>
        </div>
      )}

      {/* Modal Manutenção */}
      {isMaintModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-xl rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-8">
                 <h3 className="text-2xl font-black text-slate-800 tracking-tight">Registrar Ordem de Manutenção</h3>
                 <button onClick={() => setIsMaintModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X/></button>
              </div>
              <form onSubmit={handleAddMaint} className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Máquina / Equipamento</label>
                       <select required value={maintForm.machineId} onChange={e => setMaintForm({...maintForm, machineId: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm">
                          <option value="">Selecione...</option>
                          {machines.map(m => <option key={m.id} value={m.id}>{m.name} ({m.plateOrId})</option>)}
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</label>
                       <input required type="date" value={maintForm.date} onChange={e => setMaintForm({...maintForm, date: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm" />
                    </div>
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição dos Serviços</label>
                    <textarea required value={maintForm.description} onChange={e => setMaintForm({...maintForm, description: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-medium text-sm min-h-[100px] resize-none" placeholder="Relate o problema ou serviço preventivo..." />
                 </div>
                 <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</label>
                       <select value={maintForm.type} onChange={e => setMaintForm({...maintForm, type: e.target.value as MaintenanceRecord['type']})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm">
                          <option value="Preventiva">Preventiva</option>
                          <option value="Corretiva">Corretiva</option>
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Horímetro</label>
                       <input required type="number" value={maintForm.horimeter} onChange={e => setMaintForm({...maintForm, horimeter: parseFloat(e.target.value)})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg" />
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Custo Total (R$)</label>
                       <input required type="number" step="0.01" value={maintForm.cost} onChange={e => setMaintForm({...maintForm, cost: parseFloat(e.target.value)})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg" />
                    </div>
                 </div>
                 <button type="submit" className="w-full py-5 bg-purple-600 text-white rounded-2xl font-black shadow-xl mt-4 uppercase">Efetivar Manutenção</button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default YardManagement;
