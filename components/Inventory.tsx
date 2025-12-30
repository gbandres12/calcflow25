
import React, { useState } from 'react';
import { InventoryItem, Customer } from '../types';
import { Package, MoreHorizontal, ArrowDown, ArrowUp, X, PlusCircle, ShoppingCart, AlertTriangle, ShieldCheck } from 'lucide-react';

interface InventoryProps {
  inventory: InventoryItem[];
  customers: Customer[];
  onPurchase: (qty: number, cost: number) => void;
  onSale: (qty: number, price: number, customerId: string) => void;
}

const Inventory: React.FC<InventoryProps> = ({ inventory, customers, onPurchase, onSale }) => {
  const [activeModal, setActiveModal] = useState<'purchase' | 'sale' | null>(null);
  
  // Form States
  const [qty, setQty] = useState('');
  const [val, setVal] = useState('');
  const [customerId, setCustomerId] = useState('');

  const britado = inventory.find(i => i.id === 'britado')!;
  const moido = inventory.find(i => i.id === 'moido')!;

  const handleClose = () => {
    setActiveModal(null);
    setQty('');
    setVal('');
    setCustomerId('');
  };

  const submitPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    onPurchase(parseFloat(qty), parseFloat(val));
    handleClose();
  };

  const submitSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (parseFloat(qty) > moido.quantity) {
      alert('Estoque insuficiente de calcário moído!');
      return;
    }
    onSale(parseFloat(qty), parseFloat(val), customerId);
    handleClose();
  };

  const getStatusColor = (item: InventoryItem) => {
    if (item.quantity <= item.minStock) return 'text-rose-600 bg-rose-50 border-rose-100';
    if (item.quantity <= item.minStock * 1.5) return 'text-amber-600 bg-amber-50 border-amber-100';
    return 'text-emerald-600 bg-emerald-50 border-emerald-100';
  };

  const getStatusText = (item: InventoryItem) => {
    if (item.quantity <= item.minStock) return 'Estoque Crítico';
    if (item.quantity <= item.minStock * 1.5) return 'Atenção';
    return 'Estável';
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Controle de Estoque</h2>
          <p className="text-slate-500 text-sm">Gestão de matéria-prima e produto acabado</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {inventory.map(item => (
          <div key={item.id} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group">
            <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full blur-2xl opacity-10 ${item.id === 'britado' ? 'bg-amber-500' : 'bg-slate-500'}`}></div>
            
            <div className="flex items-center justify-between mb-8">
              <div className={`p-4 rounded-2xl ${item.id === 'britado' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-600'}`}>
                <Package size={28} />
              </div>
              <div className={`px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${getStatusColor(item)}`}>
                {item.quantity <= item.minStock ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
                {getStatusText(item)}
              </div>
            </div>

            <div className="space-y-1 mb-8">
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">{item.id === 'britado' ? 'Matéria-Prima' : 'Produto Final'}</h3>
              <p className="text-3xl font-extrabold text-slate-800">{item.name}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-2xl">
                <p className="text-xs text-slate-500 mb-1">Quantidade</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-slate-800">{item.quantity.toFixed(1)}</span>
                  <span className="text-xs font-semibold text-slate-500">TONS</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 italic">Mínimo: {item.minStock}T</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl">
                <p className="text-xs text-slate-500 mb-1">{item.id === 'britado' ? 'Custo Médio' : 'Preço Venda'}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-semibold text-slate-500">R$</span>
                  <span className="text-2xl font-bold text-slate-800">{item.unitPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              {item.id === 'britado' ? (
                <button 
                  onClick={() => setActiveModal('purchase')}
                  className="flex-1 flex items-center justify-center gap-2 py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                >
                  <PlusCircle size={18} /> Registrar Compra
                </button>
              ) : (
                <button 
                  onClick={() => setActiveModal('sale')}
                  className="flex-1 flex items-center justify-center gap-2 py-4 bg-amber-500 text-slate-900 font-bold rounded-xl hover:bg-amber-400 transition-all shadow-lg shadow-amber-100"
                >
                  <ShoppingCart size={18} /> Registrar Venda
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Alertas Rápidos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {britado.quantity <= britado.minStock && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex gap-4 items-center animate-pulse">
            <div className="bg-rose-100 p-2 rounded-lg text-rose-600"><AlertTriangle /></div>
            <div>
              <p className="font-bold text-rose-800 text-sm">Alerta de Reposição!</p>
              <p className="text-xs text-rose-700">O estoque de Calcário Britado atingiu o nível crítico de {britado.minStock}T.</p>
            </div>
          </div>
        )}
        {moido.quantity <= moido.minStock && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-4 items-center">
            <div className="bg-amber-100 p-2 rounded-lg text-amber-600"><AlertTriangle /></div>
            <div>
              <p className="font-bold text-amber-800 text-sm">Estoque de Venda Baixo</p>
              <p className="text-xs text-amber-700">Considere iniciar um novo ciclo de moagem para atender pedidos futuros.</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal Purchase */}
      {activeModal === 'purchase' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Entrada de Britado</h3>
                <p className="text-xs text-slate-500">Registrar nova compra de minério</p>
              </div>
              <button onClick={handleClose} className="p-2 hover:bg-white rounded-full transition-colors"><X /></button>
            </div>
            <form onSubmit={submitPurchase} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Quantidade (Toneladas)</label>
                <input required type="number" step="0.1" value={qty} onChange={e => setQty(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-amber-500 outline-none text-xl font-bold" placeholder="0.0" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Custo Unitário (R$ por Ton)</label>
                <input required type="number" step="0.01" value={val} onChange={e => setVal(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-amber-500 outline-none text-xl font-bold" placeholder="0.00" />
              </div>
              <button type="submit" className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-xl">Confirmar Entrada</button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Sale */}
      {activeModal === 'sale' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Venda de Moído</h3>
                <p className="text-xs text-slate-500">Registrar saída para cliente</p>
              </div>
              <button onClick={handleClose} className="p-2 hover:bg-white rounded-full transition-colors"><X /></button>
            </div>
            <form onSubmit={submitSale} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Cliente</label>
                <select required value={customerId} onChange={e => setCustomerId(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-amber-500 outline-none font-medium">
                  <option value="">Selecione um cliente...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Quantidade (Toneladas)</label>
                <input required type="number" step="0.1" value={qty} onChange={e => setQty(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-500 outline-none text-xl font-bold" placeholder="0.0" />
                <p className="text-[10px] text-slate-400">Máximo disponível: {moido.quantity}T</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Preço de Venda Unitário (R$)</label>
                <input required type="number" step="0.01" value={val} onChange={e => setVal(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-500 outline-none text-xl font-bold" placeholder="0.00" />
              </div>
              <button type="submit" className="w-full py-4 bg-amber-500 text-slate-900 font-bold rounded-2xl hover:bg-amber-400 transition-all shadow-xl">Confirmar Venda</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
