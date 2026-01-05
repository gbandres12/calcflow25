
import React, { useState } from 'react';
import { InventoryItem, Customer } from '../types';
import { Package, ArrowDown, ArrowUp, X, PlusCircle, ShoppingCart, AlertTriangle, ShieldCheck, Info, Plus } from 'lucide-react';

interface InventoryProps {
  inventory: InventoryItem[];
  customers: Customer[];
  onPurchase: (qty: number, cost: number) => void;
  onSale: (qty: number, price: number, customerId: string) => void;
  // Fixed: Updated to include optional id to match App.tsx implementation and component usage
  onAddProduct: (item: Omit<InventoryItem, 'id' | 'companyId'> & { id?: string }) => void;
}

const Inventory: React.FC<InventoryProps> = ({ inventory, customers, onPurchase, onSale, onAddProduct }) => {
  const [activeModal, setActiveModal] = useState<'purchase' | 'sale' | 'newProduct' | null>(null);
  
  // Form States
  const [qty, setQty] = useState('');
  const [val, setVal] = useState('');
  const [customerId, setCustomerId] = useState('');

  // New Product States
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdMin, setNewProdMin] = useState('');
  const [newProdType, setNewProdType] = useState('moido');

  // Busca segura dos itens base
  const britado = inventory.find(i => i.id === 'britado');
  const moido = inventory.find(i => i.id === 'moido');

  const handleClose = () => {
    setActiveModal(null);
    setQty('');
    setVal('');
    setCustomerId('');
    setNewProdName('');
    setNewProdPrice('');
    setNewProdMin('');
  };

  const submitPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    onPurchase(parseFloat(qty), parseFloat(val));
    handleClose();
  };

  const submitSale = (e: React.FormEvent) => {
    e.preventDefault();
    const currentMoidoQty = moido?.quantity || 0;
    if (parseFloat(qty) > currentMoidoQty) {
      alert('Estoque insuficiente de calcário moído!');
      return;
    }
    onSale(parseFloat(qty), parseFloat(val), customerId);
    handleClose();
  };

  const submitNewProduct = (e: React.FormEvent) => {
    e.preventDefault();
    // Fix: Passing the id here is now allowed by the updated InventoryProps interface
    onAddProduct({
      id: newProdType === 'britado' ? 'britado' : `prod-${Date.now()}`,
      name: newProdName,
      quantity: 0,
      unitPrice: parseFloat(newProdPrice),
      minStock: parseFloat(newProdMin)
    });
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
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Controle de Estoque</h2>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-widest text-[10px]">Gestão de matéria-prima e produto acabado</p>
        </div>
        <button 
          onClick={() => setActiveModal('newProduct')}
          className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-all text-sm shadow-lg shadow-slate-100"
        >
          <Plus size={18} /> Novo Produto Mineral
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {inventory.length === 0 ? (
          <div className="col-span-2 flex flex-col items-center justify-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
            <div className="p-6 bg-slate-50 rounded-full text-slate-300 mb-4">
              <Package size={48} />
            </div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">Nenhum produto cadastrado nesta filial</h3>
            <p className="text-slate-500 text-sm max-w-xs text-center mt-2">
              Clique em "Novo Produto" para iniciar o catálogo de minerais.
            </p>
          </div>
        ) : (
          inventory.map(item => (
            <div key={item.id} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-xl transition-all">
              <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full blur-2xl opacity-10 ${item.id === 'britado' ? 'bg-amber-500' : 'bg-purple-500'}`}></div>
              
              <div className="flex items-center justify-between mb-8">
                <div className={`p-4 rounded-2xl ${item.id === 'britado' ? 'bg-amber-50 text-amber-600' : 'bg-purple-50 text-purple-600'}`}>
                  <Package size={28} />
                </div>
                <div className={`px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${getStatusColor(item)}`}>
                  {item.quantity <= item.minStock ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
                  {getStatusText(item)}
                </div>
              </div>

              <div className="space-y-1 mb-8">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.id === 'britado' ? 'Matéria-Prima' : 'Produto Final'}</h3>
                <p className="text-2xl font-black text-slate-800 tracking-tight uppercase">{item.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantidade</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-slate-800 tracking-tighter">{item.quantity.toFixed(1)}</span>
                    <span className="text-[10px] font-black text-slate-400">TONS</span>
                  </div>
                  <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase">Mínimo: {item.minStock}T</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.id === 'britado' ? 'Custo Médio' : 'Preço Venda'}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[10px] font-black text-slate-400">R$</span>
                    <span className="text-3xl font-black text-slate-800 tracking-tighter">{item.unitPrice.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                {item.id === 'britado' ? (
                  <button 
                    onClick={() => setActiveModal('purchase')}
                    className="flex-1 flex items-center justify-center gap-2 py-4 bg-slate-900 text-white text-xs font-black uppercase rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-100"
                  >
                    <PlusCircle size={18} /> Registrar Compra
                  </button>
                ) : (
                  <button 
                    onClick={() => setActiveModal('sale')}
                    className="flex-1 flex items-center justify-center gap-2 py-4 bg-amber-500 text-slate-900 text-xs font-black uppercase rounded-2xl hover:bg-amber-400 transition-all shadow-xl shadow-amber-100"
                  >
                    <ShoppingCart size={18} /> Registrar Venda
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modais de Operação */}
      {activeModal === 'purchase' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">Entrada de Britado</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Registrar nova compra de minério</p>
              </div>
              <button onClick={handleClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400"><X /></button>
            </div>
            <form onSubmit={submitPurchase} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantidade (Toneladas)</label>
                <input required type="number" step="0.1" value={qty} onChange={e => setQty(e.target.value)} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-amber-500 outline-none text-2xl font-black" placeholder="0.0" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Custo Unitário (R$ por Ton)</label>
                <input required type="number" step="0.01" value={val} onChange={e => setVal(e.target.value)} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-amber-500 outline-none text-2xl font-black" placeholder="0.00" />
              </div>
              <button type="submit" className="w-full py-5 bg-slate-900 text-white text-xs font-black uppercase rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-100">Confirmar Entrada</button>
            </form>
          </div>
        </div>
      )}

      {activeModal === 'sale' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">Venda de Moído</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Registrar saída para cliente</p>
              </div>
              <button onClick={handleClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400"><X /></button>
            </div>
            <form onSubmit={submitSale} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</label>
                <select required value={customerId} onChange={e => setCustomerId(e.target.value)} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-emerald-500 outline-none font-bold text-sm">
                  <option value="">Selecione um cliente...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantidade (Toneladas)</label>
                <input required type="number" step="0.1" value={qty} onChange={e => setQty(e.target.value)} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-emerald-500 outline-none text-2xl font-black" placeholder="0.0" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Máximo disponível: {moido?.quantity || 0}T</p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preço de Venda Unitário (R$)</label>
                <input required type="number" step="0.01" value={val} onChange={e => setVal(e.target.value)} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-emerald-500 outline-none text-2xl font-black" placeholder="0.00" />
              </div>
              <button type="submit" className="w-full py-5 bg-amber-500 text-slate-900 text-xs font-black uppercase rounded-2xl hover:bg-amber-400 transition-all shadow-xl shadow-amber-100">Confirmar Venda</button>
            </form>
          </div>
        </div>
      )}

      {/* NOVO MODAL: Cadastro de Produto */}
      {activeModal === 'newProduct' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">Novo Mineral</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cadastrar novo item no catálogo desta filial</p>
              </div>
              <button onClick={handleClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400"><X /></button>
            </div>
            <form onSubmit={submitNewProduct} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Produto</label>
                <input required type="text" value={newProdName} onChange={e => setNewProdName(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-bold" placeholder="Ex: Calcário Dolomítico Moído" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preço Sugerido (R$)</label>
                  <input required type="number" step="0.01" value={newProdPrice} onChange={e => setNewProdPrice(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black" placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estoque Mínimo (T)</label>
                  <input required type="number" value={newProdMin} onChange={e => setNewProdMin(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black" placeholder="20" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Fluxo</label>
                <select value={newProdType} onChange={e => setNewProdType(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold">
                  <option value="moido">Produto Final (Venda)</option>
                  <option value="britado">Matéria Prima (Compra)</option>
                </select>
              </div>
              <button type="submit" className="w-full py-5 bg-purple-600 text-white text-xs font-black uppercase rounded-2xl hover:bg-purple-700 transition-all shadow-xl shadow-purple-100">Criar Produto</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
