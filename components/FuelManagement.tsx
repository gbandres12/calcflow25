
import React, { useState, useMemo } from 'react';
import { Machine, FuelRecord, FuelPurchase, FuelType } from '../types';
import { Fuel, Plus, History, X, Droplets, TrendingUp, TrendingDown, DollarSign, Truck, ShoppingCart, Container } from 'lucide-react';

interface FuelManagementProps {
  machines: Machine[];
  fuelRecords: FuelRecord[];
  fuelPurchases: FuelPurchase[];
  onAddFuel: (record: Omit<FuelRecord, 'id' | 'companyId'>) => void;
  onAddFuelPurchase: (record: Omit<FuelPurchase, 'id' | 'companyId'>) => void;
}

const FuelManagement: React.FC<FuelManagementProps> = ({ machines, fuelRecords, fuelPurchases, onAddFuel, onAddFuelPurchase }) => {
  const [activeTab, setActiveTab] = useState<'consumption' | 'purchases'>('consumption');
  const [isConsumptionModalOpen, setIsConsumptionModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);

  // Form Consumption
  const [consumptionForm, setConsumptionForm] = useState({
    machineId: '',
    date: new Date().toISOString().split('T')[0],
    liters: 0,
    pricePerLiter: 0,
    horimeter: 0,
    fuelType: 'S10' as FuelType
  });

  // Form Purchase
  const [purchaseForm, setPurchaseForm] = useState({
    date: new Date().toISOString().split('T')[0],
    liters: 0,
    pricePerLiter: 0,
    supplier: '',
    fuelType: 'S10' as FuelType
  });

  const stats = useMemo(() => {
    const purchasedS10 = fuelPurchases.filter(p => p.fuelType === 'S10').reduce((acc, p) => acc + p.liters, 0);
    const purchasedS500 = fuelPurchases.filter(p => p.fuelType === 'S500').reduce((acc, p) => acc + p.liters, 0);
    
    const consumedS10 = fuelRecords.filter(r => r.fuelType === 'S10').reduce((acc, r) => acc + r.liters, 0);
    const consumedS500 = fuelRecords.filter(r => r.fuelType === 'S500').reduce((acc, r) => acc + r.liters, 0);

    const costS10 = fuelPurchases.filter(p => p.fuelType === 'S10').reduce((acc, p) => acc + p.totalCost, 0);
    const costS500 = fuelPurchases.filter(p => p.fuelType === 'S500').reduce((acc, p) => acc + p.totalCost, 0);

    return {
      stockS10: purchasedS10 - consumedS10,
      stockS500: purchasedS500 - consumedS500,
      totalCost: costS10 + costS500,
      avgPriceS10: purchasedS10 > 0 ? costS10 / purchasedS10 : 0,
      avgPriceS500: purchasedS500 > 0 ? costS500 / purchasedS500 : 0
    };
  }, [fuelPurchases, fuelRecords]);

  const handleConsumptionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddFuel({
      ...consumptionForm,
      totalCost: consumptionForm.liters * consumptionForm.pricePerLiter
    });
    setIsConsumptionModalOpen(false);
    setConsumptionForm({ machineId: '', date: new Date().toISOString().split('T')[0], liters: 0, pricePerLiter: 0, horimeter: 0, fuelType: 'S10' });
  };

  const handlePurchaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddFuelPurchase({
      ...purchaseForm,
      totalCost: purchaseForm.liters * purchaseForm.pricePerLiter
    });
    setIsPurchaseModalOpen(false);
    setPurchaseForm({ date: new Date().toISOString().split('T')[0], liters: 0, pricePerLiter: 0, supplier: '', fuelType: 'S10' });
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Gestão de Combustível</h2>
          <p className="text-slate-500 text-sm font-medium">Controle de tanques, cargas e abastecimentos</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsPurchaseModalOpen(true)}
            className="bg-white border border-slate-200 text-slate-700 px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all text-sm shadow-sm"
          >
            <ShoppingCart size={18} /> Nova Carga (Diesel)
          </button>
          <button 
            onClick={() => setIsConsumptionModalOpen(true)}
            className="bg-amber-500 text-slate-900 px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-amber-400 transition-all text-sm shadow-lg shadow-amber-100"
          >
            <Droplets size={18} /> Abastecer Máquina
          </button>
        </div>
      </header>

      {/* Cards de Estoque por Tipo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4 group hover:shadow-md transition-shadow">
           <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform"><Container size={24}/></div>
           <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estoque S10</p>
              <div className="flex items-baseline gap-1">
                <p className="text-2xl font-black text-slate-800">{stats.stockS10.toFixed(1)}</p>
                <span className="text-[10px] font-bold text-slate-400">LT</span>
              </div>
              <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase">Preço Médio: R$ {stats.avgPriceS10.toFixed(2)}</p>
           </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4 group hover:shadow-md transition-shadow">
           <div className="p-4 bg-orange-50 text-orange-600 rounded-2xl group-hover:scale-110 transition-transform"><Container size={24}/></div>
           <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estoque S500</p>
              <div className="flex items-baseline gap-1">
                <p className="text-2xl font-black text-slate-800">{stats.stockS500.toFixed(1)}</p>
                <span className="text-[10px] font-bold text-slate-400">LT</span>
              </div>
              <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase">Preço Médio: R$ {stats.avgPriceS500.toFixed(2)}</p>
           </div>
        </div>
        <div className="bg-slate-900 p-6 rounded-[2rem] shadow-xl flex items-center gap-4 text-white relative overflow-hidden">
           <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-full -mr-8 -mt-8"></div>
           <div className="p-4 bg-slate-800 text-amber-400 rounded-2xl"><DollarSign size={24}/></div>
           <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60">Custo Total de Compras</p>
              <p className="text-2xl font-black text-amber-400">R$ {stats.totalCost.toLocaleString('pt-BR')}</p>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-2 bg-slate-100/50 flex gap-2 border-b border-slate-100">
           <button 
            onClick={() => setActiveTab('consumption')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'consumption' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
           >
             <History size={14} /> Abastecimentos (Saídas)
           </button>
           <button 
            onClick={() => setActiveTab('purchases')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'purchases' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
           >
             <ShoppingCart size={14} /> Cargas / Compras (Entradas)
           </button>
        </div>

        {activeTab === 'consumption' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                  <th className="px-8 py-4">Data</th>
                  <th className="px-6 py-4">Equipamento</th>
                  <th className="px-6 py-4">Combustível</th>
                  <th className="px-6 py-4">Volume / Horímetro</th>
                  <th className="px-6 py-4 text-right">Custo Estimado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {fuelRecords.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-20 text-slate-400 font-bold uppercase text-xs">Nenhum registro de abastecimento.</td>
                  </tr>
                ) : (
                  fuelRecords.slice().reverse().map(record => (
                    <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-5 text-xs font-bold text-slate-500">{record.date}</td>
                      <td className="px-6 py-5">
                        <p className="text-sm font-black text-slate-800 uppercase tracking-tight">
                          {machines.find(m => m.id === record.machineId)?.name}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{machines.find(m => m.id === record.machineId)?.plateOrId}</p>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${record.fuelType === 'S10' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-orange-50 text-orange-600 border border-orange-100'}`}>
                          Diesel {record.fuelType}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-sm font-black text-slate-800">{record.liters} LT</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{record.horimeter} h</p>
                      </td>
                      <td className="px-6 py-5 text-right font-black text-slate-900">R$ {record.totalCost.toLocaleString('pt-BR')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                  <th className="px-8 py-4">Data</th>
                  <th className="px-6 py-4">Fornecedor</th>
                  <th className="px-6 py-4">Combustível</th>
                  <th className="px-6 py-4">Volume / Preço Un.</th>
                  <th className="px-6 py-4 text-right">Valor Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {fuelPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-20 text-slate-400 font-bold uppercase text-xs">Nenhum registro de carga/compra.</td>
                  </tr>
                ) : (
                  fuelPurchases.slice().reverse().map(purchase => (
                    <tr key={purchase.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-5 text-xs font-bold text-slate-500">{purchase.date}</td>
                      <td className="px-6 py-5">
                        <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{purchase.supplier}</p>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${purchase.fuelType === 'S10' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-orange-50 text-orange-600 border border-orange-100'}`}>
                          Diesel {purchase.fuelType}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-sm font-black text-slate-800">{purchase.liters} LT</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">R$ {purchase.pricePerLiter.toFixed(3)} / LT</p>
                      </td>
                      <td className="px-6 py-5 text-right font-black text-slate-900">R$ {purchase.totalCost.toLocaleString('pt-BR')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Abastecimento (Consumption) */}
      {isConsumptionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-8">
                 <h3 className="text-2xl font-black text-slate-800 tracking-tight">Abastecer Máquina</h3>
                 <button onClick={() => setIsConsumptionModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={24}/></button>
              </div>
              <form onSubmit={handleConsumptionSubmit} className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Equipamento</label>
                       <select required value={consumptionForm.machineId} onChange={e => setConsumptionForm({...consumptionForm, machineId: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm">
                          <option value="">Selecione...</option>
                          {machines.map(m => <option key={m.id} value={m.id}>{m.name} ({m.plateOrId})</option>)}
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo Diesel</label>
                       <select value={consumptionForm.fuelType} onChange={e => setConsumptionForm({...consumptionForm, fuelType: e.target.value as FuelType})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm">
                          <option value="S10">Diesel S10</option>
                          <option value="S500">Diesel S500</option>
                       </select>
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Litros</label>
                       <input required type="number" step="0.1" value={consumptionForm.liters} onChange={e => setConsumptionForm({...consumptionForm, liters: parseFloat(e.target.value)})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg" />
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preço Un. (R$/LT)</label>
                       <input required type="number" step="0.001" value={consumptionForm.pricePerLiter} onChange={e => setConsumptionForm({...consumptionForm, pricePerLiter: parseFloat(e.target.value)})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg" />
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Horímetro</label>
                       <input required type="number" step="0.1" value={consumptionForm.horimeter} onChange={e => setConsumptionForm({...consumptionForm, horimeter: parseFloat(e.target.value)})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg" />
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</label>
                       <input required type="date" value={consumptionForm.date} onChange={e => setConsumptionForm({...consumptionForm, date: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm" />
                    </div>
                 </div>
                 <div className="p-6 bg-slate-900 rounded-[2rem] flex flex-col items-center text-white mt-4 border border-slate-800 shadow-xl">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Impacto Financeiro Estimado</span>
                    <span className="text-3xl font-black">R$ {(consumptionForm.liters * consumptionForm.pricePerLiter).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                 </div>
                 <button type="submit" className="w-full py-5 bg-amber-500 text-slate-900 rounded-2xl font-black shadow-xl mt-4 uppercase tracking-widest">Salvar Abastecimento</button>
              </form>
           </div>
        </div>
      )}

      {/* Modal Compra (Purchase) */}
      {isPurchaseModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-8">
                 <h3 className="text-2xl font-black text-slate-800 tracking-tight">Nova Carga de Combustível</h3>
                 <button onClick={() => setIsPurchaseModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={24}/></button>
              </div>
              <form onSubmit={handlePurchaseSubmit} className="space-y-4">
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fornecedor / Posto</label>
                    <input required type="text" value={purchaseForm.supplier} onChange={e => setPurchaseForm({...purchaseForm, supplier: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-sm" placeholder="Ex: Petrobras Distribuidora" />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo Diesel</label>
                       <select value={purchaseForm.fuelType} onChange={e => setPurchaseForm({...purchaseForm, fuelType: e.target.value as FuelType})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm">
                          <option value="S10">Diesel S10</option>
                          <option value="S500">Diesel S500</option>
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data da Carga</label>
                       <input required type="date" value={purchaseForm.date} onChange={e => setPurchaseForm({...purchaseForm, date: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm" />
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Litros Comprados</label>
                       <input required type="number" step="0.1" value={purchaseForm.liters} onChange={e => setPurchaseForm({...purchaseForm, liters: parseFloat(e.target.value)})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg" />
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preço por Litro (R$)</label>
                       <input required type="number" step="0.001" value={purchaseForm.pricePerLiter} onChange={e => setPurchaseForm({...purchaseForm, pricePerLiter: parseFloat(e.target.value)})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg" />
                    </div>
                 </div>
                 <div className="p-6 bg-slate-900 rounded-[2rem] flex flex-col items-center text-white mt-4 border border-slate-800 shadow-xl">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Custo Total da Carga</span>
                    <span className="text-3xl font-black text-amber-400">R$ {(purchaseForm.liters * purchaseForm.pricePerLiter).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                 </div>
                 <button type="submit" className="w-full py-5 bg-purple-600 text-white rounded-2xl font-black shadow-xl mt-4 uppercase tracking-widest text-xs hover:bg-purple-700 transition-all">Registrar Entrada no Tanque</button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default FuelManagement;
