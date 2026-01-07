
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { InventoryItem, Customer } from '../types';
import { Package, ArrowDown, ArrowUp, X, PlusCircle, ShoppingCart, AlertTriangle, ShieldCheck, Info, Plus, Search, Check, Phone, Fingerprint } from 'lucide-react';

interface InventoryProps {
  inventory: InventoryItem[];
  customers: Customer[];
  onPurchase: (qty: number, cost: number) => void;
  onSale: (qty: number, price: number, customerId: string) => void;
  onAddProduct: (item: Omit<InventoryItem, 'id' | 'companyId'> & { id?: string }) => void;
}

const Inventory: React.FC<InventoryProps> = ({ inventory, customers, onPurchase, onSale, onAddProduct }) => {
  const [activeModal, setActiveModal] = useState<'purchase' | 'sale' | 'newProduct' | null>(null);
  
  // Form States
  const [qty, setQty] = useState('');
  const [val, setVal] = useState('');
  
  // Searchable Customer State
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // New Product States
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdMin, setNewProdMin] = useState('');
  const [newProdType, setNewProdType] = useState('moido');

  const britado = inventory.find(i => i.id === 'britado');
  const moido = inventory.find(i => i.id === 'moido');

  // Busca multi-critério para registro de venda rápida
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    
    const lowerSearch = customerSearch.toLowerCase().replace(/\D/g, '');
    const lowerSearchText = customerSearch.toLowerCase();

    return customers.filter(c => {
      const docClean = c.document.replace(/\D/g, '');
      const phoneClean = c.phone.replace(/\D/g, '');
      
      return (
        c.name.toLowerCase().includes(lowerSearchText) || 
        docClean.includes(lowerSearch) || 
        phoneClean.includes(lowerSearch) ||
        c.document.includes(customerSearch) ||
        c.phone.includes(customerSearch)
      );
    });
  }, [customers, customerSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClose = () => {
    setActiveModal(null);
    setQty('');
    setVal('');
    setCustomerId('');
    setCustomerSearch('');
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
    if (!customerId) {
      alert("Selecione um cliente da lista de sugestões.");
      return;
    }
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
              <div className="space-y-2 relative" ref={customerDropdownRef}>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</label>
                <div className="relative">
                  <input 
                    required
                    type="text"
                    placeholder="Nome, CNPJ ou Telefone..."
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setIsCustomerDropdownOpen(true);
                      if (customerId) setCustomerId('');
                    }}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                    className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-emerald-500 outline-none font-bold text-sm transition-all"
                  />
                  {customerId && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-emerald-50 text-emerald-600 p-1 rounded-lg">
                      <Check size={16} />
                    </div>
                  )}
                </div>

                {isCustomerDropdownOpen && (
                  <div className="absolute z-[110] top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-56 overflow-y-auto custom-scrollbar">
                    {filteredCustomers.length === 0 ? (
                      <div className="p-6 text-center text-slate-400">
                         <p className="text-xs font-bold uppercase">Nenhum resultado</p>
                      </div>
                    ) : (
                      filteredCustomers.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setCustomerId(c.id);
                            setCustomerSearch(c.name);
                            setIsCustomerDropdownOpen(false);
                          }}
                          className={`w-full text-left px-5 py-4 hover:bg-slate-50 border-b border-slate-50 last:border-0 flex flex-col gap-1 ${customerId === c.id ? 'bg-emerald-50' : ''}`}
                        >
                          <span className="text-sm font-black text-slate-800 uppercase">{c.name}</span>
                          <div className="flex gap-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                             <span className="flex items-center gap-1"><Fingerprint size={10}/> {c.document}</span>
                             {c.phone && <span className="flex items-center gap-1"><Phone size={10}/> {c.phone}</span>}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
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
