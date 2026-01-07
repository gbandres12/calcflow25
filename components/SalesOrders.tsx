
import React, { useState, useMemo, useEffect } from 'react';
import { SaleOrder, Customer, InventoryItem, OrderStatus, Company, SalePayment, TransactionStatus, FinancialAccount } from '../types';
import { 
  Plus, Printer, FileCheck, Search, X, 
  ShoppingCart, User, Calendar, Package, Clock, ShieldCheck, CreditCard, Trash2, Pencil, AlertTriangle, FileText, Tag, Truck,
  PlusCircle, Banknote, Landmark, Wallet, ChevronRight
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
  
  // New Payments State
  const [payments, setPayments] = useState<SalePayment[]>([]);

  const formatBRL = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const subtotalValue = useMemo(() => {
    return (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);
  }, [quantity, unitPrice]);

  const totalOrderValue = useMemo(() => {
    return subtotalValue - (parseFloat(discount) || 0) + (parseFloat(shipping) || 0);
  }, [subtotalValue, discount, shipping]);

  const totalProgrammed = useMemo(() => {
    return payments.reduce((acc, p) => acc + p.amount, 0);
  }, [payments]);

  const remainingToProgram = totalOrderValue - totalProgrammed;

  useEffect(() => {
    if (editingOrder) {
      setSelectedCustomerId(editingOrder.customerId);
      const firstItem = editingOrder.items[0];
      setQuantity(firstItem ? firstItem.quantity.toString() : '');
      setUnitPrice(firstItem ? firstItem.unitPrice.toString() : '');
      setDiscount(editingOrder.discount.toString());
      setShipping(editingOrder.shipping.toString());
      setIsBudget(editingOrder.status === OrderStatus.BUDGET);
      setNotes(editingOrder.notes || '');
      setPayments(editingOrder.payments || []);
      setIsModalOpen(true);
    } else {
      setPayments([]);
    }
  }, [editingOrder]);

  const addPaymentRow = () => {
    const newPayment: SalePayment = {
      id: `pay-${Date.now()}-${Math.random()}`,
      amount: remainingToProgram > 0 ? remainingToProgram : 0,
      paidAmount: 0,
      date: new Date().toISOString().split('T')[0],
      status: TransactionStatus.PENDENTE,
      accountId: accounts[0]?.id || '',
      description: `Parcela ${payments.length + 1}`
    };
    setPayments([...payments, newPayment]);
  };

  const removePaymentRow = (id: string) => {
    setPayments(payments.filter(p => p.id !== id));
  };

  const updatePaymentRow = (id: string, field: keyof SalePayment, value: any) => {
    setPayments(payments.map(p => {
      if (p.id === id) {
        const updated = { ...p, [field]: value };
        // Regra de negócio: se o status for confirmado ou pago, o paidAmount vira o amount total
        if (field === 'status' && (value === TransactionStatus.CONFIRMADO || value === TransactionStatus.PAGO)) {
          updated.paidAmount = updated.amount;
        } else if (field === 'status' && value === TransactionStatus.PENDENTE) {
          updated.paidAmount = 0;
        }
        return updated;
      }
      return p;
    }));
  };

  const handleCreateOrUpdateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;

    if (!isBudget && Math.abs(remainingToProgram) > 0.01) {
      alert(`Erro: O plano de pagamento deve totalizar ${formatBRL(totalOrderValue)}. Saldo restante: ${formatBRL(remainingToProgram)}`);
      return;
    }

    const itemData = {
      productId: 'moido',
      productCode: '001',
      productName: 'Calcário Moído Industrializado',
      unit: 'TON',
      quantity: parseFloat(quantity),
      unitPrice: parseFloat(unitPrice),
      discount: 0,
      total: subtotalValue
    };

    const orderPayload = {
      customerId: selectedCustomerId,
      sellerName: 'Vendedor Padrão',
      date: editingOrder?.date || new Date().toISOString().split('T')[0],
      deliveryDate: new Date().toISOString().split('T')[0],
      validUntil: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      subtotal: subtotalValue,
      discount: parseFloat(discount),
      shipping: parseFloat(shipping),
      total: totalOrderValue,
      status: isBudget ? OrderStatus.BUDGET : OrderStatus.FINALIZED,
      items: [itemData],
      payments: payments,
      notes: notes
    };

    if (editingOrder) {
      onUpdateOrder({ ...editingOrder, ...orderPayload });
    } else {
      onAddOrder(orderPayload);
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
    setPayments([]);
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
          <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
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
            
            <form onSubmit={handleCreateOrUpdateOrder} className="p-8 space-y-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4 p-1.5 bg-slate-100 rounded-2xl">
                <button type="button" onClick={() => setIsBudget(true)} className={`py-3 rounded-xl font-black text-xs transition-all ${isBudget ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'}`}>APENAS ORÇAMENTO</button>
                <button type="button" onClick={() => setIsBudget(false)} className={`py-3 rounded-xl font-black text-xs transition-all ${!isBudget ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500'}`}>VENDA DIRETA</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Coluna Dados do Pedido */}
                <div className="space-y-6">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2 flex items-center gap-2"><FileText size={14}/> Dados Gerais</h4>
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
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Tag size={12} /> Desconto (R$)</label>
                        <input type="number" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-rose-500 outline-none font-bold text-sm" placeholder="0.00" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Truck size={12} /> Frete (R$)</label>
                        <input type="number" step="0.01" value={shipping} onChange={e => setShipping(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 outline-none font-bold text-sm" placeholder="0.00" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observações do Pedido</label>
                      <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-medium text-sm min-h-[80px] resize-none" placeholder="Detalhes de entrega..." />
                    </div>
                  </div>
                </div>

                {/* Coluna Plano de Pagamento */}
                <div className="space-y-6">
                  <div className="flex justify-between items-center border-b pb-2">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><CreditCard size={14}/> Plano de Recebimento</h4>
                    {!isBudget && (
                      <button type="button" onClick={addPaymentRow} className="text-purple-600 hover:text-purple-700 font-black text-[10px] uppercase flex items-center gap-1">
                        <PlusCircle size={14}/> Adicionar Parcela
                      </button>
                    )}
                  </div>

                  {isBudget ? (
                    <div className="p-8 bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-center space-y-3">
                       <Banknote size={32} className="mx-auto text-slate-300"/>
                       <p className="text-xs text-slate-500 font-medium px-4">O plano de pagamento será definido apenas na conversão de orçamento para venda confirmada.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {payments.length === 0 && (
                        <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 flex items-center gap-3">
                          <AlertTriangle size={20} className="text-amber-600 shrink-0"/>
                          <p className="text-[10px] font-bold text-amber-700 uppercase leading-relaxed tracking-tighter">
                            Nenhum pagamento programado. Adicione pelo menos uma parcela para prosseguir.
                          </p>
                        </div>
                      )}
                      
                      {payments.map((payment, idx) => {
                        const isPartial = payment.status === TransactionStatus.PARCIAL;
                        return (
                          <div key={payment.id} className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-sm relative group">
                            <button onClick={() => removePaymentRow(payment.id)} className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X size={12}/></button>
                            
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                 <label className="text-[9px] font-black text-slate-400 uppercase">Valor Parcela</label>
                                 <input type="number" step="0.01" value={payment.amount} onChange={e => updatePaymentRow(payment.id, 'amount', parseFloat(e.target.value))} className="w-full p-2 bg-slate-50 border border-slate-100 rounded-lg outline-none font-black text-sm" />
                              </div>
                              <div className="space-y-1">
                                 <label className="text-[9px] font-black text-slate-400 uppercase">Vencimento</label>
                                 <input type="date" value={payment.date} onChange={e => updatePaymentRow(payment.id, 'date', e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-100 rounded-lg outline-none font-bold text-xs" />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                 <label className="text-[9px] font-black text-slate-400 uppercase">Status</label>
                                 <select value={payment.status} onChange={e => updatePaymentRow(payment.id, 'status', e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-100 rounded-lg outline-none font-bold text-xs">
                                    <option value={TransactionStatus.PENDENTE}>Pendente</option>
                                    <option value={TransactionStatus.CONFIRMADO}>Recebido (Total)</option>
                                    <option value={TransactionStatus.PARCIAL}>Recebido (Parcial)</option>
                                 </select>
                              </div>
                              <div className="space-y-1">
                                 <label className="text-[9px] font-black text-slate-400 uppercase">{isPartial ? 'Já Recebido' : 'Conta Destino'}</label>
                                 {isPartial ? (
                                   <input 
                                     type="number" 
                                     step="0.01" 
                                     value={payment.paidAmount || 0} 
                                     onChange={e => updatePaymentRow(payment.id, 'paidAmount', parseFloat(e.target.value))} 
                                     className="w-full p-2 bg-blue-50 border border-blue-100 rounded-lg outline-none font-black text-xs text-blue-700" 
                                   />
                                 ) : (
                                   <select value={payment.accountId} onChange={e => updatePaymentRow(payment.id, 'accountId', e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-100 rounded-lg outline-none font-bold text-xs">
                                      {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                                    </select>
                                 )}
                              </div>
                            </div>
                            
                            {isPartial && (
                              <div className="space-y-1 pt-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase">Conta Destino do Recebido</label>
                                <select value={payment.accountId} onChange={e => updatePaymentRow(payment.id, 'accountId', e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-100 rounded-lg outline-none font-bold text-xs">
                                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                                </select>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Resumo Financeiro do Pedido */}
                      <div className="mt-6 p-6 bg-slate-900 rounded-[2rem] border border-slate-800 space-y-4">
                         <div className="flex justify-between items-center text-slate-400">
                            <span className="text-[10px] font-black uppercase tracking-widest">Valor do Pedido</span>
                            <span className="font-bold">{formatBRL(totalOrderValue)}</span>
                         </div>
                         <div className="flex justify-between items-center text-slate-400">
                            <span className="text-[10px] font-black uppercase tracking-widest">Programado</span>
                            <span className="font-bold">{formatBRL(totalProgrammed)}</span>
                         </div>
                         <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-2">
                               {remainingToProgram === 0 ? <ShieldCheck size={14} className="text-emerald-500"/> : <Clock size={14} className="text-amber-500"/>}
                               Saldo a Programar
                            </span>
                            <span className={`text-lg font-black ${remainingToProgram === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                               {formatBRL(remainingToProgram)}
                            </span>
                         </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 flex gap-4">
                 <button type="button" onClick={handleCloseModal} className="px-8 py-5 text-xs font-black uppercase text-slate-400 hover:bg-slate-50 rounded-2xl transition-all">Cancelar</button>
                 <button type="submit" className={`flex-1 py-5 rounded-2xl font-black text-white shadow-xl transition-all hover:scale-[1.01] ${isBudget ? 'bg-amber-500 shadow-amber-100 text-slate-900' : 'bg-purple-600 shadow-purple-100'}`}>
                   {editingOrder ? 'Salvar Alterações' : (isBudget ? 'Emitir Orçamento' : 'Finalizar Pedido de Venda')}
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Template de Impressão A4 Profissional */}
      {printOrder && (
        <div className="fixed inset-0 bg-white z-[999] p-0 text-slate-900 hidden print:block overflow-visible" 
          style={{ width: '210mm', minHeight: '297mm', padding: '10mm', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '4px solid #1B3C73', paddingBottom: '15px', marginBottom: '25px' }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
               <div style={{ width: '80px', height: '80px', background: '#F8FAFC', borderRadius: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E2E8F0' }}>
                  <img src="https://api.dicebear.com/7.x/initials/svg?seed=CA" alt="Logo" style={{ width: '40px' }} />
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <h1 style={{ fontSize: '20px', fontWeight: '900', color: '#1B3C73', margin: 0 }}>{company.name}</h1>
                  <p style={{ fontSize: '9px', color: '#555', margin: 0, fontWeight: '700' }}>CNPJ: {company.document}</p>
                  <p style={{ fontSize: '9px', color: '#555', margin: 0 }}>{company.address}</p>
                  <p style={{ fontSize: '9px', color: '#555', margin: 0 }}>FONE: {company.phone}</p>
               </div>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
               <h2 style={{ fontSize: '12pt', fontWeight: '800', color: '#0B1E3C', margin: 0, textTransform: 'uppercase' }}>
                 {printOrder.status === OrderStatus.BUDGET ? 'ORÇAMENTO' : 'PEDIDO DE VENDA'}
               </h2>
               <p style={{ fontSize: '22px', fontWeight: '900', color: '#1B3C73', margin: '4px 0' }}>Nº {printOrder.reference}</p>
            </div>
          </div>

          <div style={{ background: '#F9FAFB', border: '1px solid #E2E8F0', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
             <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                <tbody>
                   <tr>
                      <td style={{ padding: '4px 0', fontWeight: '700', width: '15%', color: '#666' }}>Cliente:</td>
                      <td style={{ padding: '4px 0', fontWeight: '800' }}>{customers.find(c => c.id === printOrder.customerId)?.name}</td>
                      <td style={{ padding: '4px 0', fontWeight: '700', width: '15%', color: '#666' }}>Emissão:</td>
                      <td style={{ padding: '4px 0', fontWeight: '800' }}>{printOrder.date}</td>
                   </tr>
                </tbody>
             </table>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
               <thead>
                  <tr style={{ background: '#F9FAFB', color: '#1B3C73', borderBottom: '2px solid #1B3C73' }}>
                     <th style={{ textAlign: 'left', padding: '10px 8px' }}>DESCRIÇÃO</th>
                     <th style={{ textAlign: 'center', padding: '10px 8px', width: '80px' }}>QTD</th>
                     <th style={{ textAlign: 'right', padding: '10px 8px', width: '100px' }}>UNITÁRIO</th>
                     <th style={{ textAlign: 'right', padding: '10px 8px', width: '100px' }}>TOTAL</th>
                  </tr>
               </thead>
               <tbody>
                  {printOrder.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                       <td style={{ padding: '10px 8px', fontWeight: '700' }}>{item.productName}</td>
                       <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '800' }}>{item.quantity} {item.unit}</td>
                       <td style={{ padding: '10px 8px', textAlign: 'right' }}>{formatBRL(item.unitPrice)}</td>
                       <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '800' }}>{formatBRL(item.total)}</td>
                    </tr>
                  ))}
               </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', alignItems: 'flex-start' }}>
             <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '10px', fontWeight: '800', color: '#1B3C73', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px', marginBottom: '10px', textTransform: 'uppercase' }}>
                   Condições de Pagamento
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                   <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                         <th style={{ textAlign: 'left', padding: '6px' }}>VENCIMENTO / PARCELA</th>
                         <th style={{ textAlign: 'right', padding: '6px' }}>VALOR</th>
                      </tr>
                   </thead>
                   <tbody>
                      {printOrder.payments.map((p, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                           <td style={{ padding: '6px' }}>{p.date} - {p.description || `Parcela ${idx + 1}`}</td>
                           <td style={{ padding: '6px', textAlign: 'right', fontWeight: '800' }}>{formatBRL(p.amount)}</td>
                        </tr>
                      ))}
                      {printOrder.payments.length === 0 && (
                        <tr>
                          <td colSpan={2} style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>Condições a combinar</td>
                        </tr>
                      )}
                   </tbody>
                </table>
             </div>
             <div style={{ width: '250px', background: '#F8FAFC', padding: '20px', borderRadius: '15px', border: '1px solid #E2E8F0' }}>
                <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                   <tbody>
                      <tr>
                        <td style={{ padding: '4px 0', color: '#64748b', fontWeight: '600' }}>Subtotal:</td>
                        <td style={{ textAlign: 'right', padding: '4px 0', fontWeight: '700' }}>{formatBRL(printOrder.subtotal)}</td>
                      </tr>
                      {printOrder.discount > 0 && (
                        <tr>
                          <td style={{ padding: '4px 0', color: '#64748b', fontWeight: '600' }}>Desconto:</td>
                          <td style={{ textAlign: 'right', padding: '4px 0', fontWeight: '700', color: '#ef4444' }}>- {formatBRL(printOrder.discount)}</td>
                        </tr>
                      )}
                      {printOrder.shipping > 0 && (
                        <tr>
                          <td style={{ padding: '4px 0', color: '#64748b', fontWeight: '600' }}>Frete (+):</td>
                          <td style={{ textAlign: 'right', padding: '4px 0', fontWeight: '700' }}>{formatBRL(printOrder.shipping)}</td>
                        </tr>
                      )}
                      <tr style={{ borderTop: '1px solid #E2E8F0' }}>
                         <td style={{ padding: '12px 0 0 0', fontSize: '14px', fontWeight: '900', color: '#1B3C73' }}>TOTAL GERAL:</td>
                         <td style={{ textAlign: 'right', padding: '12px 0 0 0', fontSize: '18px', fontWeight: '900', color: '#1B3C73' }}>{formatBRL(printOrder.total)}</td>
                      </tr>
                   </tbody>
                </table>
             </div>
          </div>

          {printOrder.notes && (
            <div style={{ marginBottom: '30px', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
              <p style={{ fontSize: '8px', fontWeight: '900', color: '#64748b', textTransform: 'uppercase', marginBottom: '5px' }}>Observações:</p>
              <p style={{ fontSize: '9px', color: '#1e293b', margin: 0, whiteSpace: 'pre-wrap' }}>{printOrder.notes}</p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '60px', gap: '40px' }}>
             <div style={{ flex: 1, borderTop: '1px solid #1B3C73', textAlign: 'center', paddingTop: '8px' }}>
                <p style={{ fontSize: '9px', margin: 0, fontWeight: '800' }}>Assinatura do Cliente</p>
             </div>
             <div style={{ flex: 1, borderTop: '1px solid #1B3C73', textAlign: 'center', paddingTop: '8px' }}>
                <p style={{ fontSize: '9px', margin: 0, fontWeight: '800' }}>Assinatura da Empresa</p>
             </div>
          </div>
        </div>
      )}

      {/* Confirmação de Exclusão */}
      {isDeleteModalOpen && selectedOrderToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-sm rounded-[2.5rem] p-8 shadow-2xl text-center space-y-6 animate-in zoom-in-95">
            <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle size={40} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Excluir Documento?</h3>
              <p className="text-sm text-slate-500 font-medium">
                Deseja remover <b>REF: {selectedOrderToDelete.reference}</b>? Esta ação é irreversível.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 py-4 text-xs font-black uppercase text-slate-400 border border-slate-200 rounded-2xl">Cancelar</button>
              <button onClick={handleConfirmDeletion} className="flex-1 py-4 bg-rose-600 text-white text-xs font-black uppercase rounded-2xl shadow-xl">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesOrders;
