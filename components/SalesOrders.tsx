
import React, { useState, useMemo, useEffect } from 'react';
import { SaleOrder, Customer, InventoryItem, OrderStatus, Company, SalePayment, TransactionStatus, FinancialAccount } from '../types';
import { 
  Plus, Printer, FileCheck, Search, X, 
  ShoppingCart, User, Calendar, Package, Clock, ShieldCheck, CreditCard, Trash2, Pencil, AlertTriangle, FileText, Tag, Truck
} from 'lucide-react';

interface SalesOrdersProps {
  orders: SaleOrder[];
  customers: Customer[];
  inventory: InventoryItem[];
  accounts: FinancialAccount[];
  company: Company;
  onAddOrder: (order: Omit<SaleOrder, 'id' | 'companyId' | 'reference'>) => void;
  onUpdateOrder: (order: SaleOrder) => void;
  onDeleteOrder: (orderId: string) => void;
  onFinalizeOrder: (orderId: string, payments: SalePayment[]) => void;
}

const SalesOrders: React.FC<SalesOrdersProps> = ({ 
  orders, 
  customers, 
  inventory, 
  accounts, 
  company, 
  onAddOrder, 
  onUpdateOrder,
  onDeleteOrder,
  onFinalizeOrder 
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedOrderToDelete, setSelectedOrderToDelete] = useState<SaleOrder | null>(null);
  const [editingOrder, setEditingOrder] = useState<SaleOrder | null>(null);
  const [printOrder, setPrintOrder] = useState<SaleOrder | null>(null);
  
  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [discount, setDiscount] = useState('0');
  const [shipping, setShipping] = useState('0');
  const [isBudget, setIsBudget] = useState(true);
  const [notes, setNotes] = useState('');

  const formatBRL = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const totalOrderValue = useMemo(() => {
    const subtotal = parseFloat(quantity || '0') * parseFloat(unitPrice || '0');
    return subtotal - parseFloat(discount || '0') + parseFloat(shipping || '0');
  }, [quantity, unitPrice, discount, shipping]);

  useEffect(() => {
    if (editingOrder) {
      setSelectedCustomerId(editingOrder.customerId);
      setQuantity(editingOrder.items[0].quantity.toString());
      setUnitPrice(editingOrder.items[0].unitPrice.toString());
      setDiscount(editingOrder.discount.toString());
      setShipping(editingOrder.shipping.toString());
      setIsBudget(editingOrder.status === OrderStatus.BUDGET);
      setNotes(editingOrder.notes || '');
      setIsModalOpen(true);
    }
  }, [editingOrder]);

  const handleCreateOrUpdateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;

    const subtotal = parseFloat(quantity) * parseFloat(unitPrice);
    const itemData = {
      productId: 'moido',
      productCode: '001',
      productName: 'Calcário Moído Industrializado',
      unit: 'TON',
      quantity: parseFloat(quantity),
      unitPrice: parseFloat(unitPrice),
      discount: 0,
      total: subtotal
    };

    if (editingOrder) {
      onUpdateOrder({
        ...editingOrder,
        customerId: selectedCustomerId,
        subtotal: subtotal,
        discount: parseFloat(discount),
        shipping: parseFloat(shipping),
        total: totalOrderValue,
        status: isBudget ? OrderStatus.BUDGET : OrderStatus.FINALIZED,
        notes: notes,
        items: [itemData]
      });
    } else {
      onAddOrder({
        customerId: selectedCustomerId,
        sellerName: 'Vendedor Padrão',
        date: new Date().toISOString().split('T')[0],
        deliveryDate: new Date().toISOString().split('T')[0],
        validUntil: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
        subtotal: subtotal,
        discount: parseFloat(discount),
        shipping: parseFloat(shipping),
        total: totalOrderValue,
        status: isBudget ? OrderStatus.BUDGET : OrderStatus.FINALIZED,
        items: [itemData],
        payments: [],
        notes: notes
      });
    }
    handleCloseModal();
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingOrder(null);
    resetForm();
  };

  const resetForm = () => {
    setSelectedCustomerId('');
    setQuantity('');
    setUnitPrice('');
    setDiscount('0');
    setShipping('0');
    setNotes('');
  };

  const handleConfirmDeletion = () => {
    if (selectedOrderToDelete) {
      onDeleteOrder(selectedOrderToDelete.id);
      setIsDeleteModalOpen(false);
      setSelectedOrderToDelete(null);
    }
  };

  const handlePrint = (order: SaleOrder) => {
    setPrintOrder(order);
    setTimeout(() => {
      window.print();
      setPrintOrder(null);
    }, 500);
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center print:hidden">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Vendas e Orçamentos</h2>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-widest text-[10px]">Gestão comercial • Unidade {company.name}</p>
        </div>
        <button 
          onClick={() => { setEditingOrder(null); setIsModalOpen(true); }}
          className="bg-purple-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-purple-700 transition-all flex items-center gap-2 shadow-xl shadow-purple-100"
        >
          <Plus size={20} /> Novo Documento
        </button>
      </header>

      {/* Tabela de Pedidos */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden print:hidden">
        <div className="p-6 border-b border-slate-50 flex gap-4 bg-slate-50/30">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Buscar cliente ou documento..." className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-500 font-medium text-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-8 py-4">Data</th>
                <th className="px-6 py-4">Cliente / Referência</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Total</th>
                <th className="px-8 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-20 text-slate-400 text-sm italic font-medium tracking-tight">Nenhuma movimentação comercial registrada.</td>
                </tr>
              ) : (
                orders.slice().reverse().map(order => (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-5 text-xs font-bold text-slate-500">{order.date}</td>
                    <td className="px-6 py-5">
                      <p className="text-sm font-black text-slate-800">{customers.find(c => c.id === order.customerId)?.name || 'Cliente Geral'}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">REF: {order.reference}</p>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase border ${
                        order.status === OrderStatus.BUDGET ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right font-black text-slate-800 text-sm">
                      {formatBRL(order.total)}
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => handlePrint(order)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all" title="Imprimir PDF"><Printer size={16} /></button>
                        <button onClick={() => setEditingOrder(order)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" title="Editar"><Pencil size={16} /></button>
                        <button onClick={() => { setSelectedOrderToDelete(order); setIsDeleteModalOpen(true); }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all" title="Excluir"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Criar/Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 print:hidden">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-600 text-white rounded-2xl shadow-lg">
                  {editingOrder ? <Pencil size={24} /> : <ShoppingCart size={24} />}
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">{editingOrder ? 'Editar Documento' : 'Novo Pedido / Orçamento'}</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest text-[9px]">Unidade {company.name}</p>
                </div>
              </div>
              <button onClick={handleCloseModal} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400"><X size={24} /></button>
            </div>
            
            <form onSubmit={handleCreateOrUpdateOrder} className="p-8 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4 p-1.5 bg-slate-100 rounded-2xl">
                <button type="button" onClick={() => setIsBudget(true)} className={`py-3 rounded-xl font-black text-xs transition-all ${isBudget ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'}`}>APENAS ORÇAMENTO</button>
                <button type="button" onClick={() => setIsBudget(false)} className={`py-3 rounded-xl font-black text-xs transition-all ${!isBudget ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500'}`}>VENDA DIRETA</button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><User size={12} /> Cliente Destinatário</label>
                  <select required value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-bold text-sm">
                    <option value="">Selecione o cliente...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest"><Package size={12} className="inline mr-1" /> Toneladas</label>
                    <input required type="number" step="0.1" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-black text-lg" placeholder="0.0" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preço Unitário (R$)</label>
                    <input required type="number" step="0.01" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-black text-lg" placeholder="0.00" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Tag size={12} /> Desconto Total (R$)</label>
                    <input type="number" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-rose-500 outline-none font-bold text-sm" placeholder="0.00" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Truck size={12} /> Frete (R$)</label>
                    <input type="number" step="0.01" value={shipping} onChange={e => setShipping(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 outline-none font-bold text-sm" placeholder="0.00" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observações do Pedido</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-medium text-sm min-h-[100px] resize-none" placeholder="Detalhes de entrega, condições especiais, etc." />
                </div>
              </div>

              <div className="bg-slate-900 p-8 rounded-[2.5rem] flex flex-col items-center text-white border border-slate-800 shadow-xl shadow-slate-100">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30 mb-1">Investimento Total Estimado</span>
                <span className="text-3xl font-black tracking-tighter">{formatBRL(totalOrderValue)}</span>
              </div>

              <button type="submit" className={`w-full py-5 rounded-2xl font-black text-white shadow-xl transition-all hover:scale-[1.01] ${isBudget ? 'bg-amber-500 shadow-amber-100 text-slate-900' : 'bg-purple-600 shadow-purple-100'}`}>
                {editingOrder ? 'Salvar Alterações' : (isBudget ? 'Emitir Orçamento' : 'Confirmar e Finalizar Venda')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Template de Impressão A4 Profissional */}
      {printOrder && (
        <div className="fixed inset-0 bg-white z-[999] p-0 text-slate-900 hidden print:block overflow-visible" 
          style={{ width: '210mm', minHeight: '297mm', padding: '10mm', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
          
          {/* CABECALHO */}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '4px solid #1B3C73', paddingBottom: '15px', marginBottom: '25px' }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
               <div style={{ width: '100px', height: '100px', background: '#F8FAFC', borderRadius: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E2E8F0' }}>
                  <img src="https://api.dicebear.com/7.x/initials/svg?seed=CA" alt="Logo" style={{ width: '60px' }} />
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#1B3C73', margin: 0, letterSpacing: '-0.02em' }}>{company.name}</h1>
                  <p style={{ fontSize: '10px', color: '#555', margin: 0, fontWeight: '700' }}>CNPJ: {company.document}</p>
                  <p style={{ fontSize: '10px', color: '#555', margin: 0 }}>{company.address}</p>
                  <p style={{ fontSize: '10px', color: '#555', margin: 0 }}>{company.city} - {company.state}</p>
                  <p style={{ fontSize: '10px', color: '#555', margin: 0 }}>FONE: {company.phone}</p>
               </div>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
               <h2 style={{ fontSize: '14pt', fontWeight: '800', color: '#0B1E3C', margin: 0, textTransform: 'uppercase' }}>
                 {printOrder.status === OrderStatus.BUDGET ? 'ORÇAMENTO' : 'PEDIDO DE VENDA'}
               </h2>
               <p style={{ fontSize: '26px', fontWeight: '900', color: '#1B3C73', margin: '4px 0' }}>Nº {printOrder.reference}</p>
            </div>
          </div>

          {/* DADOS DO DOCUMENTO */}
          <div style={{ background: '#F9FAFB', border: '1px solid #E2E8F0', padding: '15px', borderRadius: '10px', marginBottom: '25px' }}>
             <h3 style={{ fontSize: '11px', fontWeight: '800', color: '#1B3C73', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px', marginBottom: '12px', textTransform: 'uppercase' }}>
               {printOrder.status === OrderStatus.BUDGET ? 'Dados do Orçamento' : 'Dados do Pedido'}
             </h3>
             <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                <tbody>
                   <tr>
                      <td style={{ padding: '6px 0', fontWeight: '700', width: '15%', color: '#666' }}>Cliente:</td>
                      <td style={{ padding: '6px 0', fontWeight: '800' }}>{customers.find(c => c.id === printOrder.customerId)?.name} ({customers.find(c => c.id === printOrder.customerId)?.document})</td>
                      <td style={{ padding: '6px 0', fontWeight: '700', width: '15%', color: '#666' }}>Emissão:</td>
                      <td style={{ padding: '6px 0', fontWeight: '800' }}>{printOrder.date}</td>
                   </tr>
                   <tr>
                      <td style={{ padding: '6px 0', fontWeight: '700', color: '#666' }}>Vendedor:</td>
                      <td style={{ padding: '6px 0', fontWeight: '800' }}>{printOrder.sellerName}</td>
                      <td style={{ padding: '6px 0', fontWeight: '700', color: '#666' }}>{printOrder.status === OrderStatus.BUDGET ? 'Validade:' : 'Entrega:'}</td>
                      <td style={{ padding: '6px 0', fontWeight: '800' }}>{printOrder.status === OrderStatus.BUDGET ? printOrder.validUntil : printOrder.deliveryDate}</td>
                   </tr>
                </tbody>
             </table>
          </div>

          {/* ITENS DO PEDIDO */}
          <div style={{ marginBottom: '25px' }}>
            <h3 style={{ fontSize: '11px', fontWeight: '800', color: '#1B3C73', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px', marginBottom: '12px', textTransform: 'uppercase' }}>
               📦 Itens do {printOrder.status === OrderStatus.BUDGET ? 'Orçamento' : 'Pedido'}
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
               <thead>
                  <tr style={{ background: '#F9FAFB', color: '#1B3C73', borderBottom: '2px solid #1B3C73' }}>
                     <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: '800' }}>REF</th>
                     <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: '800' }}>DESCRIÇÃO</th>
                     <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: '800' }}>UN</th>
                     <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: '800' }}>QTD</th>
                     <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: '800' }}>UNITÁRIO</th>
                     <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: '800' }}>DESC.</th>
                     <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: '800' }}>TOTAL</th>
                  </tr>
               </thead>
               <tbody>
                  {printOrder.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                       <td style={{ padding: '10px 8px' }}>{item.productCode}</td>
                       <td style={{ padding: '10px 8px', fontWeight: '700' }}>{item.productName}</td>
                       <td style={{ padding: '10px 8px', textAlign: 'center' }}>{item.unit}</td>
                       <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '800' }}>{item.quantity}</td>
                       <td style={{ padding: '10px 8px', textAlign: 'right' }}>{formatBRL(item.unitPrice)}</td>
                       <td style={{ padding: '10px 8px', textAlign: 'right', color: '#666' }}>{formatBRL(item.discount)}</td>
                       <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '800', color: '#1B3C73' }}>{formatBRL(item.total)}</td>
                    </tr>
                  ))}
               </tbody>
            </table>
          </div>

          {/* TOTAIS E PAGAMENTO */}
          <div style={{ display: 'flex', gap: '25px', marginBottom: '35px' }}>
             {/* Condições de Pagamento */}
             <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '11px', fontWeight: '800', color: '#1B3C73', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px', marginBottom: '12px', textTransform: 'uppercase' }}>
                   Forma / Condições de Pagamento
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                   <thead>
                      <tr style={{ background: '#F8FAFC', color: '#0B1E3C' }}>
                         <th style={{ textAlign: 'left', padding: '8px', fontWeight: '800' }}>DESCRIÇÃO</th>
                         <th style={{ textAlign: 'left', padding: '8px', fontWeight: '800' }}>VENCIMENTO</th>
                         <th style={{ textAlign: 'right', padding: '8px', fontWeight: '800' }}>VALOR</th>
                      </tr>
                   </thead>
                   <tbody>
                      {printOrder.payments.length > 0 ? printOrder.payments.map((p, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                           <td style={{ padding: '8px' }}>{p.description || `Parcela ${idx+1}`}</td>
                           <td style={{ padding: '8px' }}>{p.date}</td>
                           <td style={{ padding: '8px', textAlign: 'right', fontWeight: '800' }}>{formatBRL(p.amount)}</td>
                        </tr>
                      )) : (
                        <tr>
                           <td colSpan={3} style={{ padding: '15px', textAlign: 'center', fontStyle: 'italic', color: '#999', fontSize: '11px' }}>
                              A definir no ato do faturamento / Entrega
                           </td>
                        </tr>
                      )}
                   </tbody>
                </table>
             </div>

             {/* Resumo Financeiro */}
             <div style={{ width: '280px', background: '#F0F4F8', border: '3px double #1B3C73', padding: '20px', borderRadius: '15px' }}>
                <table style={{ width: '100%', fontSize: '12px' }}>
                   <tbody>
                      <tr>
                         <td style={{ padding: '5px 0', color: '#555' }}>Total dos Itens:</td>
                         <td style={{ textAlign: 'right', padding: '5px 0', fontWeight: '700' }}>{formatBRL(printOrder.subtotal)}</td>
                      </tr>
                      {printOrder.discount > 0 && (
                        <tr>
                           <td style={{ padding: '5px 0', color: '#E11D48' }}>Desconto:</td>
                           <td style={{ textAlign: 'right', padding: '5px 0', fontWeight: '700', color: '#E11D48' }}>- {formatBRL(printOrder.discount)}</td>
                        </tr>
                      )}
                      {printOrder.shipping > 0 && (
                        <tr>
                           <td style={{ padding: '5px 0', color: '#555' }}>Frete:</td>
                           <td style={{ textAlign: 'right', padding: '5px 0', fontWeight: '700' }}>{formatBRL(printOrder.shipping)}</td>
                        </tr>
                      )}
                      <tr>
                         <td style={{ padding: '5px 0', color: '#555' }}>Outros:</td>
                         <td style={{ textAlign: 'right', padding: '5px 0', fontWeight: '700' }}>R$ 0,00</td>
                      </tr>
                      <tr style={{ fontSize: '20px', fontWeight: '900', color: '#1B3C73' }}>
                         <td style={{ padding: '15px 0 0 0' }}>VALOR TOTAL:</td>
                         <td style={{ textAlign: 'right', padding: '15px 0 0 0' }}>{formatBRL(printOrder.total)}</td>
                      </tr>
                   </tbody>
                </table>
             </div>
          </div>

          {/* OBSERVAÇÕES */}
          {printOrder.notes && (
            <div style={{ background: '#FFFBEB', border: '1.5px solid #FDE047', padding: '20px', borderRadius: '12px', marginBottom: '35px' }}>
               <h4 style={{ fontSize: '11px', fontWeight: '900', color: '#1B3C73', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Observações Gerais:</h4>
               <p style={{ fontSize: '10px', color: '#444', margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{printOrder.notes}</p>
            </div>
          )}

          {/* ASSINATURAS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '60px', gap: '60px' }}>
             <div style={{ flex: 1, borderTop: '1.5px solid #1B3C73', textAlign: 'center', paddingTop: '12px' }}>
                <p style={{ fontSize: '10px', margin: 0, fontWeight: '800', color: '#1B3C73' }}>
                  {printOrder.status === OrderStatus.BUDGET ? 'Assinatura do Cliente' : 'Assinatura do Comprador'}
                </p>
                <p style={{ fontSize: '8px', color: '#777', margin: '6px 0 0 0' }}>CPF/CNPJ: ________________________</p>
             </div>
             <div style={{ flex: 1, borderTop: '1.5px solid #1B3C73', textAlign: 'center', paddingTop: '12px' }}>
                <p style={{ fontSize: '10px', margin: 0, fontWeight: '800', color: '#1B3C73' }}>
                  {printOrder.status === OrderStatus.BUDGET ? 'Assinatura do Vendedor' : 'Assinatura do Recebedor'}
                </p>
                <p style={{ fontSize: '8px', color: '#777', margin: '6px 0 0 0' }}>DATA: ____/____/________</p>
             </div>
          </div>

          {/* RODAPÉ */}
          <div style={{ position: 'fixed', bottom: '10mm', left: '10mm', right: '10mm', borderTop: '1px solid #E2E8F0', paddingTop: '12px', textAlign: 'center' }}>
             <p style={{ fontSize: '8px', color: '#999', margin: 0, fontWeight: '500' }}>
               Documento gerado eletronicamente via CalcárioFlow ERP em {new Date().toLocaleString('pt-BR')}. 
               Este documento não substitui a Nota Fiscal Eletrônica e tem validade comercial conforme condições expressas.
             </p>
          </div>

        </div>
      )}

      {/* Confirmação de Exclusão */}
      {isDeleteModalOpen && selectedOrderToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl text-center space-y-6 animate-in zoom-in-95">
            <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner"><AlertTriangle size={40} /></div>
            <h3 className="text-xl font-black text-slate-800">Confirmar Exclusão?</h3>
            <p className="text-sm text-slate-500 font-medium">
              Você está prestes a excluir o documento <b>REF: {selectedOrderToDelete.reference}</b>. Esta ação removerá o registro permanentemente.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 py-4 text-xs font-black uppercase text-slate-400 border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all">Cancelar</button>
              <button onClick={handleConfirmDeletion} className="flex-1 py-4 bg-rose-600 text-white text-xs font-black uppercase rounded-2xl shadow-xl shadow-rose-100 hover:bg-rose-700 transition-all">Sim, Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesOrders;
