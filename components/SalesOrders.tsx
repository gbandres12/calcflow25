import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  SaleOrder, 
  Customer, 
  InventoryItem, 
  OrderStatus, 
  Company, 
  SalePayment, 
  TransactionStatus, 
  FinancialAccount, 
  FiscalConfig,
  PaymentReceipt,
  OrderWithdrawal
} from '../types';
import { 
  Plus, Printer, FileCheck, Search, X, 
  ShoppingCart, User, Calendar, Package, Clock, ShieldCheck, CreditCard, Trash2, Pencil, AlertTriangle, FileText, Tag, Truck,
  PlusCircle, Banknote, Landmark, Wallet, ChevronRight, Check, Phone, Fingerprint, Send, Eye, DollarSign, Receipt,
  CheckCircle2, ArrowUpRight, Scale, ChevronDown, ListOrdered
} from 'lucide-react';
import { EmitirNfeModal } from './EmitirNfeModal';
import { DanfeModal } from './DanfeModal';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { OrderWithdrawalModal } from './OrderWithdrawalModal';
import { RegisterPaymentModal } from './RegisterPaymentModal';
import { fiscalService } from '../services/fiscalService';
import { DEFAULT_FISCAL_CONFIG } from '../constants';

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
  onPaymentReceived?: (receipt: PaymentReceipt, updatedOrder: SaleOrder) => void;
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
  onFinalizeOrder,
  onPaymentReceived 
}) => {
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'FINALIZED' | 'BUDGET'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals de Ação Principal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedOrderToDelete, setSelectedOrderToDelete] = useState<SaleOrder | null>(null);
  const [editingOrder, setEditingOrder] = useState<SaleOrder | null>(null);
  const [printOrder, setPrintOrder] = useState<SaleOrder | null>(null);
  
  // Modals de Pagamentos e Retiradas
  const [orderForPayment, setOrderForPayment] = useState<SaleOrder | null>(null);
  const [orderForWithdrawal, setOrderForWithdrawal] = useState<SaleOrder | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<PaymentReceipt | null>(null);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<SaleOrder | null>(null);

  // NF-e Modals
  const [orderToEmitNfe, setOrderToEmitNfe] = useState<SaleOrder | null>(null);
  const [orderToViewDanfe, setOrderToViewDanfe] = useState<SaleOrder | null>(null);
  const [fiscalConfig, setFiscalConfig] = useState<FiscalConfig>(DEFAULT_FISCAL_CONFIG);

  useEffect(() => {
    fiscalService.getConfig().then(cfg => setFiscalConfig(cfg));
  }, []);
  
  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('180');
  const [discount, setDiscount] = useState('0');
  const [shipping, setShipping] = useState('0');
  const [isBudget, setIsBudget] = useState(false);
  const [notes, setNotes] = useState('');
  
  // Entrada e Parcelas no Formulário
  const [downPayment, setDownPayment] = useState('0');
  const [downPaymentMethod, setDownPaymentMethod] = useState('PIX');
  const [downPaymentAccount, setDownPaymentAccount] = useState(accounts[0]?.id || '');
  const [payments, setPayments] = useState<SalePayment[]>([]);

  const formatBRL = (val?: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const subtotalValue = useMemo(() => {
    return (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);
  }, [quantity, unitPrice]);

  const totalOrderValue = useMemo(() => {
    return subtotalValue - (parseFloat(discount) || 0) + (parseFloat(shipping) || 0);
  }, [subtotalValue, discount, shipping]);

  const downPaymentNum = parseFloat(downPayment) || 0;
  const balanceToSchedule = Math.max(0, totalOrderValue - downPaymentNum);

  const totalProgrammed = useMemo(() => {
    return payments.reduce((acc, p) => acc + p.amount, 0);
  }, [payments]);

  const remainingToProgram = balanceToSchedule - totalProgrammed;

  // Lógica de busca de clientes
  const filteredCustomers = useMemo(() => {
    if (!customerSearch || (selectedCustomerId && customers.find(c => c.id === selectedCustomerId)?.name === customerSearch)) {
       if (!customerSearch) return customers;
    }
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
  }, [customers, customerSearch, selectedCustomerId]);

  const selectedCustomer = useMemo(() => 
    customers.find(c => c.id === selectedCustomerId), 
  [customers, selectedCustomerId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (editingOrder) {
      setSelectedCustomerId(editingOrder.customerId);
      const cust = customers.find(c => c.id === editingOrder.customerId);
      setCustomerSearch(cust?.name || '');
      const firstItem = editingOrder.items[0];
      setQuantity(firstItem ? firstItem.quantity.toString() : '');
      setUnitPrice(firstItem ? firstItem.unitPrice.toString() : '180');
      setDiscount(editingOrder.discount.toString());
      setShipping(editingOrder.shipping.toString());
      setIsBudget(editingOrder.status === OrderStatus.BUDGET);
      setNotes(editingOrder.notes || '');
      setPayments(editingOrder.payments || []);
      setDownPayment('0');
      setIsModalOpen(true);
    } else {
      setPayments([]);
      setDownPayment('0');
    }
  }, [editingOrder, customers]);

  const addPaymentRow = () => {
    const newPayment: SalePayment = {
      id: `pay-${Date.now()}-${Math.random()}`,
      amount: remainingToProgram > 0 ? remainingToProgram : 0,
      paidAmount: 0,
      date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
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
    if (!selectedCustomerId) {
      alert("Por favor, selecione um cliente da lista.");
      return;
    }

    if (!isBudget && Math.abs(remainingToProgram) > 0.01 && payments.length > 0) {
      alert(`O plano de parcelas deve totalizar ${formatBRL(balanceToSchedule)}. Saldo restante: ${formatBRL(remainingToProgram)}`);
      return;
    }

    const itemData = {
      productId: 'moido',
      productCode: '001',
      productName: 'Calcário Agrícola Moído (PRNT > 85%)',
      unit: 'TON',
      quantity: parseFloat(quantity) || 1,
      unitPrice: parseFloat(unitPrice) || 0,
      discount: 0,
      total: subtotalValue,
      ncm: '2517.10.00',
      cfop: '5101'
    };

    // Cria recibo de entrada se houver valor de entrada
    const generatedReceipts: PaymentReceipt[] = editingOrder?.receipts || [];
    let initialDownPaymentReceipt: PaymentReceipt | null = null;

    if (downPaymentNum > 0 && !editingOrder) {
      const receiptId = `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const selectedAcc = accounts.find(a => a.id === downPaymentAccount);
      
      initialDownPaymentReceipt = {
        id: receiptId,
        customerId: selectedCustomerId,
        customerName: selectedCustomer?.name || 'Cliente Geral',
        customerDocument: selectedCustomer?.document,
        amount: downPaymentNum,
        date: new Date().toISOString().split('T')[0],
        paymentMethod: downPaymentMethod,
        accountId: downPaymentAccount,
        accountName: selectedAcc?.name || 'Caixa',
        receivedBy: 'Caixa / Recepção',
        description: `Entrada / Sinal de Venda`,
        type: 'ENTRADA',
        totalOrderAmount: totalOrderValue,
        totalPaidSoFar: downPaymentNum,
        remainingDebt: totalOrderValue - downPaymentNum,
        notes: 'Entrada registrada no fechamento do pedido'
      };
      generatedReceipts.push(initialDownPaymentReceipt);
    }

    const orderPayload = {
      customerId: selectedCustomerId,
      sellerName: 'Vendedor Responsável',
      date: editingOrder?.date || new Date().toISOString().split('T')[0],
      deliveryDate: new Date().toISOString().split('T')[0],
      validUntil: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      subtotal: subtotalValue,
      discount: parseFloat(discount) || 0,
      shipping: parseFloat(shipping) || 0,
      total: totalOrderValue,
      status: isBudget ? OrderStatus.BUDGET : OrderStatus.FINALIZED,
      items: [itemData],
      payments: payments,
      receipts: generatedReceipts,
      withdrawals: editingOrder?.withdrawals || [],
      notes: notes
    };

    if (editingOrder) {
      onUpdateOrder({ ...editingOrder, ...orderPayload });
    } else {
      onAddOrder(orderPayload);
      if (initialDownPaymentReceipt) {
        setViewingReceipt(initialDownPaymentReceipt);
      }
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
    setCustomerSearch('');
    setQuantity('');
    setUnitPrice('180');
    setDiscount('0');
    setShipping('0');
    setNotes('');
    setDownPayment('0');
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
    }, 400);
  };

  // Salvar Pagamento / Abatimento
  const handleSavePayment = (receipt: PaymentReceipt, updatedOrder: SaleOrder) => {
    onUpdateOrder(updatedOrder);
    if (onPaymentReceived) {
      onPaymentReceived(receipt, updatedOrder);
    }
    setOrderForPayment(null);
    setViewingReceipt(receipt);
  };

  // Salvar Retirada de Carga / Romaneio
  const handleSaveWithdrawal = (withdrawal: OrderWithdrawal) => {
    if (!orderForWithdrawal) return;
    const updatedWithdrawals = [...(orderForWithdrawal.withdrawals || []), withdrawal];
    const updatedOrder = {
      ...orderForWithdrawal,
      withdrawals: updatedWithdrawals
    };
    onUpdateOrder(updatedOrder);
  };

  // Métricas Globais de Vendas
  const totalVolumeTon = orders.reduce((acc, o) => acc + o.items.reduce((sum, it) => sum + (it.quantity || 0), 0), 0);
  const totalOrdersAmount = orders.filter(o => o.status === OrderStatus.FINALIZED).reduce((acc, o) => acc + o.total, 0);
  
  const totalPaidGlobal = orders.filter(o => o.status === OrderStatus.FINALIZED).reduce((acc, o) => {
    const receiptsTotal = (o.receipts || []).reduce((rSum, r) => rSum + r.amount, 0);
    return acc + receiptsTotal;
  }, 0);

  const totalOutstandingGlobal = Math.max(0, totalOrdersAmount - totalPaidGlobal);

  // Filtragem dos Pedidos
  const filteredOrders = orders.filter(o => {
    if (activeFilter === 'FINALIZED' && o.status !== OrderStatus.FINALIZED) return false;
    if (activeFilter === 'BUDGET' && o.status !== OrderStatus.BUDGET) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const customer = customers.find(c => c.id === o.customerId);
      const matchCust = customer?.name.toLowerCase().includes(q) || customer?.document.includes(q);
      const matchRef = o.reference.toLowerCase().includes(q);
      return matchCust || matchRef;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Header Principal */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Pedidos de Venda & Faturamento</h2>
          <p className="text-slate-500 text-sm font-medium">Gestão de contratos, entradas, parcelas, abatimentos e retiradas de carga</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => { setEditingOrder(null); setIsModalOpen(true); }}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-2xl font-black transition-all flex items-center gap-2 shadow-xl shadow-purple-200 text-sm hover:scale-[1.02]"
          >
            <Plus size={18} /> Novo Pedido de Venda
          </button>
        </div>
      </header>

      {/* Cards de Métricas Comerciais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 print:hidden">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-black">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Faturado</p>
            <p className="text-xl font-black text-slate-900">{formatBRL(totalOrdersAmount)}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entradas / Abatimentos</p>
            <p className="text-xl font-black text-emerald-600">{formatBRL(totalPaidGlobal)}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-black">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo a Receber</p>
            <p className="text-xl font-black text-rose-600">{formatBRL(totalOutstandingGlobal)}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
            <Package size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Volume Comercializado</p>
            <p className="text-xl font-black text-blue-700">{totalVolumeTon.toFixed(1)} TON</p>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between print:hidden">
        
        {/* Abas */}
        <div className="flex p-1 bg-slate-100 rounded-2xl w-full md:w-auto">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-5 py-2 rounded-xl text-xs font-black transition-all ${activeFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Todos ({orders.length})
          </button>
          <button
            onClick={() => setActiveFilter('FINALIZED')}
            className={`px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${activeFilter === 'FINALIZED' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-emerald-700'}`}
          >
            <CheckCircle2 size={14} /> Vendas Confirmadas
          </button>
          <button
            onClick={() => setActiveFilter('BUDGET')}
            className={`px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${activeFilter === 'BUDGET' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:text-amber-600'}`}
          >
            <FileText size={14} /> Orçamentos
          </button>
        </div>

        {/* Input de Busca */}
        <div className="relative flex-1 w-full md:w-auto max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Buscar por cliente, CPF/CNPJ ou Nº Pedido..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs focus:border-purple-500"
          />
        </div>

      </div>

      {/* Lista de Pedidos em Cards Modernos & Elegantes */}
      <div className="space-y-4 print:hidden">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-[2rem] p-16 text-center border border-slate-100 text-slate-400 space-y-2">
            <ShoppingCart size={40} className="mx-auto opacity-20" />
            <p className="text-sm font-bold">Nenhum pedido de venda encontrado</p>
          </div>
        ) : (
          filteredOrders.slice().reverse().map(order => {
            const customer = customers.find(c => c.id === order.customerId);
            const totalQty = order.items.reduce((s, it) => s + (it.quantity || 0), 0);
            
            // Cálculos Financeiros do Pedido
            const receiptsPaid = (order.receipts || []).reduce((s, r) => s + r.amount, 0);
            const scheduledPaid = (order.payments || []).reduce((s, p) => (p.status === TransactionStatus.CONFIRMADO || p.status === TransactionStatus.PAGO ? s + p.amount : s + (p.paidAmount || 0)), 0);
            const totalPaid = Math.max(receiptsPaid, scheduledPaid);
            const remainingDebt = Math.max(0, order.total - totalPaid);
            const financialProgress = order.total > 0 ? Math.min(100, (totalPaid / order.total) * 100) : 0;

            // Cálculos de Retiradas de Carga
            const totalWithdrawn = (order.withdrawals || []).reduce((s, w) => s + (w.quantityWithdrawn || 0), 0);
            const remainingWithdraw = Math.max(0, totalQty - totalWithdrawn);
            const withdrawalProgress = totalQty > 0 ? Math.min(100, (totalWithdrawn / totalQty) * 100) : 0;

            return (
              <div 
                key={order.id} 
                className="bg-white rounded-[2.5rem] border border-slate-200/80 p-6 md:p-8 shadow-sm hover:shadow-md transition-all space-y-6"
              >
                
                {/* Linha Superior: Cabeçalho do Pedido e Badges */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-5 border-b border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className={`p-3.5 rounded-2xl ${order.status === OrderStatus.FINALIZED ? 'bg-purple-50 text-purple-700' : 'bg-amber-50 text-amber-600'}`}>
                      <ShoppingCart size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-lg text-slate-900 tracking-tight">
                          {customer?.name || 'Cliente Geral'}
                        </h3>
                        <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-600">
                          {order.reference}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider text-[10px] pt-0.5">
                        Doc: {customer?.document || 'N/I'} • Emissão: {order.date}
                      </p>
                    </div>
                  </div>

                  {/* Status Badges e NF-e */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className={`text-[10px] font-black px-3 py-1.5 rounded-xl uppercase border ${
                      order.status === OrderStatus.BUDGET ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {order.status}
                    </span>

                    {order.status === OrderStatus.FINALIZED && (
                      order.nfeStatus === 'autorizada' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black px-3 py-1.5 rounded-xl uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <FileCheck size={12} /> NF-e Nº {order.nfeNumero || '1041'}
                          </span>
                          <button
                            onClick={() => setOrderToViewDanfe(order)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black transition-all flex items-center gap-1"
                          >
                            <Eye size={12} /> DANFE
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setOrderToEmitNfe(order)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-[10px] font-black shadow-sm transition-all"
                        >
                          <Send size={12} /> Emitir NF-e (NotaAs)
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Bloco Central: Painéis de Saldo Financeiro e Saldo de Retirada */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Painel 1: Financeiro (Entradas, Abatimentos e Saldo Devedor) */}
                  <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200/70 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <DollarSign size={14} className="text-emerald-600" /> Controle Financeiro & Pagamentos
                      </span>
                      <span className="text-xs font-black text-slate-800">
                        {formatBRL(order.total)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold uppercase">Total Pago/Abatido</span>
                        <p className="font-black text-emerald-600 text-sm">{formatBRL(totalPaid)}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-slate-400 font-bold uppercase">Saldo Devedor</span>
                        <p className={`font-black text-sm ${remainingDebt === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatBRL(remainingDebt)}
                        </p>
                      </div>
                    </div>

                    {/* Barra de Progresso Financeiro */}
                    <div className="space-y-1 pt-1">
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${remainingDebt === 0 ? 'bg-emerald-500' : 'bg-purple-600'}`}
                          style={{ width: `${financialProgress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase">
                        <span>{financialProgress.toFixed(0)}% Quitado</span>
                        <span>{order.receipts?.length || 0} Recibos emitidos</span>
                      </div>
                    </div>
                  </div>

                  {/* Painel 2: Retiradas de Calcário (Romaneios e Saldo de Carga) */}
                  <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200/70 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Truck size={14} className="text-blue-600" /> Expedição & Retiradas de Carga
                      </span>
                      <span className="text-xs font-black text-slate-800">
                        {totalQty.toFixed(1)} TON
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold uppercase">Já Retirado</span>
                        <p className="font-black text-blue-600 text-sm">{totalWithdrawn.toFixed(1)} TON</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-slate-400 font-bold uppercase">Saldo a Retirar</span>
                        <p className={`font-black text-sm ${remainingWithdraw === 0 ? 'text-emerald-600' : 'text-purple-600'}`}>
                          {remainingWithdraw.toFixed(1)} TON
                        </p>
                      </div>
                    </div>

                    {/* Barra de Progresso de Retiradas */}
                    <div className="space-y-1 pt-1">
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${remainingWithdraw === 0 ? 'bg-emerald-500' : 'bg-blue-600'}`}
                          style={{ width: `${withdrawalProgress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase">
                        <span>{withdrawalProgress.toFixed(0)}% Carregado</span>
                        <span>{order.withdrawals?.length || 0} Viagens / Caminhões</span>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Barra Inferior de Botões de Ação do Pedido */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                  
                  {/* Botões Operacionais Primários */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setOrderForPayment(order)}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md shadow-emerald-100 hover:scale-105"
                      title="Registrar Entrada ou Abatimento e Emitir Recibo"
                    >
                      <DollarSign size={14} /> Receber Entrada / Abatimento
                    </button>

                    <button
                      onClick={() => setOrderForWithdrawal(order)}
                      className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md shadow-slate-200 hover:scale-105"
                      title="Registrar saída de caminhão e emitir ticket"
                    >
                      <Truck size={14} /> Registrar Retirada (Caminhão)
                    </button>

                    {(order.receipts && order.receipts.length > 0) && (
                      <button
                        onClick={() => setSelectedOrderDetails(order)}
                        className="px-3.5 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <Receipt size={14} /> Histórico ({order.receipts.length} Recibos / {order.withdrawals?.length || 0} Retiradas)
                      </button>
                    )}
                  </div>

                  {/* Ações Secundárias (Imprimir, Editar, Excluir) */}
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={() => handlePrint(order)} 
                      className="p-2.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-2xl transition-all" 
                      title="Imprimir Pedido de Venda A4"
                    >
                      <Printer size={18} />
                    </button>
                    <button 
                      onClick={() => setEditingOrder(order)} 
                      className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all" 
                      title="Editar Pedido"
                    >
                      <Pencil size={18} />
                    </button>
                    <button 
                      onClick={() => { setSelectedOrderToDelete(order); setIsDeleteModalOpen(true); }} 
                      className="p-2.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all" 
                      title="Excluir"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Modal Criar / Editar Pedido */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 print:hidden">
          <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-600 text-white rounded-2xl shadow-lg">
                  {editingOrder ? <Pencil size={24} /> : <ShoppingCart size={24} />}
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">{editingOrder ? 'Editar Documento' : 'Novo Pedido de Venda'}</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest text-[9px]">Unidade {company.name}</p>
                </div>
              </div>
              <button onClick={handleCloseModal} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400"><X size={24} /></button>
            </div>
            
            <form onSubmit={handleCreateOrUpdateOrder} className="p-8 space-y-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4 p-1.5 bg-slate-100 rounded-2xl">
                <button type="button" onClick={() => setIsBudget(false)} className={`py-3 rounded-xl font-black text-xs transition-all ${!isBudget ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500'}`}>VENDA CONFIRMADA</button>
                <button type="button" onClick={() => setIsBudget(true)} className={`py-3 rounded-xl font-black text-xs transition-all ${isBudget ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'}`}>APENAS ORÇAMENTO</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Coluna Dados do Pedido */}
                <div className="space-y-6">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2 flex items-center gap-2"><FileText size={14}/> Dados Gerais</h4>
                  <div className="space-y-4">
                    <div className="space-y-1.5 relative" ref={customerDropdownRef}>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><User size={12} /> Cliente Destinatário / Produtor</label>
                      <div className="relative">
                        <input 
                          required
                          type="text"
                          placeholder="Pesquisar por Nome, CPF/CNPJ ou Telefone..."
                          value={customerSearch}
                          onChange={(e) => {
                            setCustomerSearch(e.target.value);
                            setIsCustomerDropdownOpen(true);
                            if (selectedCustomerId) setSelectedCustomerId('');
                          }}
                          onFocus={() => setIsCustomerDropdownOpen(true)}
                          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-bold text-sm transition-all"
                        />
                        {selectedCustomerId && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-emerald-50 text-emerald-600 p-1 rounded-lg">
                            <Check size={16} />
                          </div>
                        )}
                      </div>

                      {isCustomerDropdownOpen && (
                        <div className="absolute z-[110] top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-72 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-200">
                          {filteredCustomers.length === 0 ? (
                            <div className="p-8 text-center text-slate-400">
                               <Search size={32} className="mx-auto mb-2 opacity-20"/>
                               <p className="text-xs font-bold uppercase tracking-widest">Nenhum cliente encontrado</p>
                            </div>
                          ) : (
                            filteredCustomers.map(c => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setSelectedCustomerId(c.id);
                                  setCustomerSearch(c.name);
                                  setIsCustomerDropdownOpen(false);
                                }}
                                className={`w-full text-left px-5 py-4 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors flex flex-col gap-1.5 ${selectedCustomerId === c.id ? 'bg-purple-50 border-l-4 border-l-purple-600' : ''}`}
                              >
                                <span className="text-sm font-black text-slate-800 uppercase tracking-tight">{c.name}</span>
                                <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                   <span className="flex items-center gap-1"><Fingerprint size={12}/> {c.document}</span>
                                   {c.phone && <span className="flex items-center gap-1"><Phone size={12}/> {c.phone}</span>}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest"><Package size={12} className="inline mr-1" /> Volume (Toneladas)</label>
                        <input required type="number" step="0.1" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-black text-lg" placeholder="Ex: 100.0" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preço Tonelada (R$)</label>
                        <input required type="number" step="0.01" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-black text-lg" placeholder="180.00" />
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
                      <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-medium text-sm min-h-[70px] resize-none" placeholder="Detalhes da entrega ou condições especiais..." />
                    </div>
                  </div>
                </div>

                {/* Coluna Condições de Pagamento / Entrada / Parcelas */}
                <div className="space-y-6">
                  <div className="flex justify-between items-center border-b pb-2">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><CreditCard size={14}/> Entrada & Plano de Parcelas</h4>
                    {!isBudget && (
                      <button type="button" onClick={addPaymentRow} className="text-purple-600 hover:text-purple-700 font-black text-[10px] uppercase flex items-center gap-1">
                        <PlusCircle size={14}/> Adicionar Parcela
                      </button>
                    )}
                  </div>

                  {isBudget ? (
                    <div className="p-8 bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-center space-y-3">
                       <Banknote size={32} className="mx-auto text-slate-300"/>
                       <p className="text-xs text-slate-500 font-medium px-4">O plano de pagamento será definido na conversão de orçamento para venda confirmada.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      
                      {/* Campo de Entrada Inicial no ato da venda */}
                      {!editingOrder && (
                        <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl space-y-3">
                          <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1.5">
                            <DollarSign size={14} /> Entrada / Sinal Pago no Ato (R$)
                          </span>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <input
                                type="number"
                                step="0.01"
                                value={downPayment}
                                onChange={e => setDownPayment(e.target.value)}
                                placeholder="0.00"
                                className="w-full p-2.5 bg-white border border-emerald-200 rounded-xl outline-none font-black text-base text-emerald-900"
                              />
                            </div>
                            <div>
                              <select
                                value={downPaymentMethod}
                                onChange={e => setDownPaymentMethod(e.target.value)}
                                className="w-full p-2.5 bg-white border border-emerald-200 rounded-xl outline-none font-bold text-xs"
                              >
                                <option value="PIX">PIX</option>
                                <option value="Dinheiro">Dinheiro</option>
                                <option value="Transferência Bancária">Transferência</option>
                                <option value="Boleto">Boleto</option>
                                <option value="Cartão de Débito">Cartão de Débito</option>
                                <option value="Cartão de Crédito">Cartão de Crédito</option>
                                <option value="Cheque">Cheque</option>
                              </select>
                            </div>
                          </div>
                          {downPaymentNum > 0 && (
                            <p className="text-[10px] text-emerald-700 font-bold">
                              * Um recibo de pagamento oficial nº REC-{new Date().getFullYear()}-XXXX será emitido automaticamente.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Parcelas Programadas */}
                      <div className="space-y-3 max-h-48 overflow-y-auto custom-scrollbar">
                        {payments.map((payment, idx) => (
                          <div key={payment.id} className="p-3 bg-white border border-slate-200 rounded-2xl space-y-2 relative group shadow-sm">
                            <button type="button" onClick={() => removePaymentRow(payment.id)} className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X size={12}/></button>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase">Valor Parcela</label>
                                <input type="number" step="0.01" value={payment.amount} onChange={e => updatePaymentRow(payment.id, 'amount', parseFloat(e.target.value))} className="w-full p-2 bg-slate-50 border border-slate-100 rounded-lg outline-none font-black text-xs" />
                              </div>
                              <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase">Vencimento</label>
                                <input type="date" value={payment.date} onChange={e => updatePaymentRow(payment.id, 'date', e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-100 rounded-lg outline-none font-bold text-xs" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Resumo Financeiro */}
                      <div className="p-5 bg-slate-900 rounded-[2rem] border border-slate-800 space-y-2 text-white">
                         <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 uppercase font-black text-[9px] tracking-widest">Total do Pedido</span>
                            <span className="font-black">{formatBRL(totalOrderValue)}</span>
                         </div>
                         {downPaymentNum > 0 && (
                           <div className="flex justify-between items-center text-xs text-emerald-400">
                              <span className="uppercase font-black text-[9px] tracking-widest">Entrada no Ato (-)</span>
                              <span className="font-black">{formatBRL(downPaymentNum)}</span>
                           </div>
                         )}
                         <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">
                               Saldo a Parcelar
                            </span>
                            <span className={`text-base font-black ${remainingToProgram === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                               {formatBRL(remainingToProgram)}
                            </span>
                         </div>
                      </div>

                    </div>
                  )}
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 flex gap-4">
                 <button type="button" onClick={handleCloseModal} className="px-8 py-4 text-xs font-black uppercase text-slate-400 hover:bg-slate-50 rounded-2xl transition-all">Cancelar</button>
                 <button type="submit" className={`flex-1 py-4 rounded-2xl font-black text-white shadow-xl transition-all hover:scale-[1.01] ${isBudget ? 'bg-amber-500 shadow-amber-100 text-slate-900' : 'bg-purple-600 shadow-purple-100'}`}>
                   {editingOrder ? 'Salvar Alterações' : (isBudget ? 'Emitir Orçamento' : 'Finalizar Pedido de Venda')}
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Histórico de Recibos & Retiradas do Pedido */}
      {selectedOrderDetails && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl p-8 space-y-6 max-h-[85vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b pb-4">
              <div>
                <h3 className="text-xl font-black text-slate-900">Extrato & Romaneios do Pedido</h3>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  REF: {selectedOrderDetails.reference} • Cliente: {customers.find(c => c.id === selectedOrderDetails.customerId)?.name}
                </p>
              </div>
              <button onClick={() => setSelectedOrderDetails(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                <X size={20} />
              </button>
            </div>

            {/* Recibos de Pagamento */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Receipt size={14} className="text-emerald-600" /> Recibos de Pagamento & Abatimento Emitidos
              </h4>
              {(selectedOrderDetails.receipts || []).length === 0 ? (
                <p className="text-xs text-slate-400 italic">Nenhum recibo de pagamento emitido ainda.</p>
              ) : (
                <div className="space-y-2">
                  {selectedOrderDetails.receipts?.map(r => (
                    <div key={r.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-800">{r.id}</span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
                            {r.type}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium pt-0.5">
                          {r.date} • {r.paymentMethod} • Recebido por: {r.receivedBy || 'Financeiro'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-emerald-600 text-base">{formatBRL(r.amount)}</span>
                        <button
                          onClick={() => {
                            setViewingReceipt(r);
                          }}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1"
                        >
                          <Printer size={12} /> Ver Recibo
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Retiradas de Carga */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Truck size={14} className="text-blue-600" /> Romaneios & Viagens de Caminhões
              </h4>
              {(selectedOrderDetails.withdrawals || []).length === 0 ? (
                <p className="text-xs text-slate-400 italic">Nenhuma retirada de carga registrada ainda.</p>
              ) : (
                <div className="space-y-2">
                  {selectedOrderDetails.withdrawals?.map(w => (
                    <div key={w.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-800">{w.plateNumber}</span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md">
                            Ticket {w.weighTicketNumber}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium pt-0.5">
                          Motorista: {w.driverName} • {w.date}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-blue-700 text-base">{w.quantityWithdrawn} TON</span>
                        <p className="text-[9px] text-slate-400 font-bold">Saldo restante: {w.remainingBalanceQuantity} TON</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button onClick={() => setSelectedOrderDetails(null)} className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Registrar Pagamento / Entrada / Abatimento */}
      {orderForPayment && (
        <RegisterPaymentModal
          order={orderForPayment}
          customer={customers.find(c => c.id === orderForPayment.customerId)}
          accounts={accounts}
          company={company}
          onSavePayment={handleSavePayment}
          onClose={() => setOrderForPayment(null)}
        />
      )}

      {/* Modal Registrar Retirada de Carga / Caminhão */}
      {orderForWithdrawal && (
        <OrderWithdrawalModal
          order={orderForWithdrawal}
          customer={customers.find(c => c.id === orderForWithdrawal.customerId)}
          company={company}
          onSaveWithdrawal={handleSaveWithdrawal}
          onClose={() => setOrderForWithdrawal(null)}
        />
      )}

      {/* Modal de Recibo Oficial */}
      {viewingReceipt && (
        <PaymentReceiptModal
          receipt={viewingReceipt}
          company={company}
          onClose={() => setViewingReceipt(null)}
        />
      )}

      {/* Modal de Emissão de NF-e via NotaAs */}
      {orderToEmitNfe && (
        <EmitirNfeModal
          order={orderToEmitNfe}
          customer={customers.find(c => c.id === orderToEmitNfe.customerId) || customers[0]}
          config={fiscalConfig}
          company={company}
          onClose={() => setOrderToEmitNfe(null)}
          onSuccess={(updatedOrder) => {
            onUpdateOrder(updatedOrder);
            setOrderToEmitNfe(null);
            setOrderToViewDanfe(updatedOrder);
          }}
        />
      )}

      {/* Modal de Visualização e Impressão de DANFE */}
      {orderToViewDanfe && (
        <DanfeModal
          order={orderToViewDanfe}
          customer={customers.find(c => c.id === orderToViewDanfe.customerId) || customers[0]}
          config={fiscalConfig}
          company={company}
          onClose={() => setOrderToViewDanfe(null)}
          onOrderUpdated={(updatedOrder) => {
            onUpdateOrder(updatedOrder);
            setOrderToViewDanfe(updatedOrder);
          }}
        />
      )}

      {/* Confirmação de Exclusão */}
      {isDeleteModalOpen && selectedOrderToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl text-center space-y-6 animate-in zoom-in-95">
            <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle size={40} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Excluir Documento?</h3>
              <p className="text-sm text-slate-500 font-medium">
                Deseja remover <b>REF: {selectedOrderToDelete.reference}</b>?
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 py-4 text-xs font-black uppercase text-slate-400 border border-slate-200 rounded-2xl">Cancelar</button>
              <button onClick={handleConfirmDeletion} className="flex-1 py-4 bg-rose-600 text-white text-xs font-black uppercase rounded-2xl shadow-xl">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Template de Impressão A4 Profissional e Elegante */}
      {printOrder && (
        <div className="fixed inset-0 bg-white z-[999] p-0 text-slate-900 hidden print:block overflow-visible" 
          style={{ width: '210mm', minHeight: '297mm', padding: '12mm', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
          
          {/* Topo Corporativo */}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '3px solid #1e293b', paddingBottom: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
               <div style={{ width: '110px' }}>
                  <img src="https://i.ibb.co/h9vDq8s/calcario-logo.png" alt="Logo" style={{ width: '100%', height: 'auto' }} />
               </div>
               <div>
                  <h1 style={{ fontSize: '18px', fontWeight: '900', color: '#0f172a', margin: 0 }}>{company.name}</h1>
                  <p style={{ fontSize: '10px', color: '#64748b', margin: '2px 0', fontWeight: '700' }}>CNPJ: {company.document} • IE: 15.829.401-2</p>
                  <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>{company.address} • Fone: {company.phone}</p>
               </div>
            </div>
            <div style={{ textAlign: 'right' }}>
               <span style={{ display: 'inline-block', padding: '4px 10px', background: '#0f172a', color: '#fff', fontSize: '11px', fontWeight: '900', borderRadius: '6px' }}>
                 {printOrder.status === OrderStatus.BUDGET ? 'ORÇAMENTO COMERCIAL' : 'PEDIDO DE VENDA'}
               </span>
               <p style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a', margin: '6px 0 2px 0' }}>Nº {printOrder.reference}</p>
               <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>Emissão: <strong>{printOrder.date}</strong></p>
            </div>
          </div>

          {/* Dados do Cliente / Produtor */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '14px', borderRadius: '8px', marginBottom: '18px' }}>
             <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                <tbody>
                   <tr>
                      <td style={{ padding: '3px 0', fontWeight: '700', width: '15%', color: '#64748b' }}>Cliente / Fazenda:</td>
                      <td style={{ padding: '3px 0', fontWeight: '900', color: '#0f172a' }}>{customers.find(c => c.id === printOrder.customerId)?.name}</td>
                      <td style={{ padding: '3px 0', fontWeight: '700', width: '15%', color: '#64748b' }}>CPF / CNPJ:</td>
                      <td style={{ padding: '3px 0', fontWeight: '800' }}>{customers.find(c => c.id === printOrder.customerId)?.document}</td>
                   </tr>
                   <tr>
                      <td style={{ padding: '3px 0', fontWeight: '700', color: '#64748b' }}>Telefone:</td>
                      <td style={{ padding: '3px 0', fontWeight: '700' }}>{customers.find(c => c.id === printOrder.customerId)?.phone || 'Não informado'}</td>
                      <td style={{ padding: '3px 0', fontWeight: '700', color: '#64748b' }}>Município / UF:</td>
                      <td style={{ padding: '3px 0', fontWeight: '700' }}>{customers.find(c => c.id === printOrder.customerId)?.city || company.city} - {customers.find(c => c.id === printOrder.customerId)?.state || company.state}</td>
                   </tr>
                </tbody>
             </table>
          </div>

          {/* Itens do Pedido */}
          <div style={{ marginBottom: '20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
               <thead>
                  <tr style={{ background: '#f1f5f9', color: '#0f172a', borderBottom: '2px solid #cbd5e1' }}>
                     <th style={{ textAlign: 'left', padding: '8px' }}>DESCRIÇÃO DO PRODUTO</th>
                     <th style={{ textAlign: 'center', padding: '8px', width: '70px' }}>NCM</th>
                     <th style={{ textAlign: 'center', padding: '8px', width: '80px' }}>QUANTIDADE</th>
                     <th style={{ textAlign: 'right', padding: '8px', width: '90px' }}>UNITÁRIO</th>
                     <th style={{ textAlign: 'right', padding: '8px', width: '100px' }}>TOTAL (R$)</th>
                  </tr>
               </thead>
               <tbody>
                  {printOrder.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                       <td style={{ padding: '8px', fontWeight: '700' }}>{item.productName}</td>
                       <td style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>{item.ncm || '2517.10.00'}</td>
                       <td style={{ padding: '8px', textAlign: 'center', fontWeight: '800' }}>{item.quantity} {item.unit}</td>
                       <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(item.unitPrice)}</td>
                       <td style={{ padding: '8px', textAlign: 'right', fontWeight: '800' }}>{formatBRL(item.total)}</td>
                    </tr>
                  ))}
               </tbody>
            </table>
          </div>

          {/* Condições de Pagamento e Entradas Efetuadas */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'flex-start' }}>
             <div style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#fafafa' }}>
                <h3 style={{ fontSize: '10px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
                   Condições de Pagamento & Histórico de Abatimentos
                </h3>
                
                {/* Lista de Recibos / Entradas */}
                {(printOrder.receipts && printOrder.receipts.length > 0) && (
                  <div style={{ marginBottom: '10px' }}>
                    <p style={{ fontSize: '9px', fontWeight: '800', color: '#059669', margin: '0 0 4px 0' }}>ENTRADAS & ABATIMENTOS PAGOS:</p>
                    <table style={{ width: '100%', fontSize: '9px', borderCollapse: 'collapse' }}>
                       <tbody>
                          {printOrder.receipts.map(r => (
                            <tr key={r.id} style={{ borderBottom: '1px dashed #e2e8f0' }}>
                               <td style={{ padding: '3px 0' }}>{r.date} - {r.id} ({r.paymentMethod})</td>
                               <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '800', color: '#059669' }}>{formatBRL(r.amount)}</td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                  </div>
                )}

                {/* Parcelas Programadas */}
                {printOrder.payments.length > 0 && (
                  <div>
                    <p style={{ fontSize: '9px', fontWeight: '800', color: '#475569', margin: '0 0 4px 0' }}>PARCELAS PROGRAMADAS:</p>
                    <table style={{ width: '100%', fontSize: '9px', borderCollapse: 'collapse' }}>
                       <tbody>
                          {printOrder.payments.map((p, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px dashed #e2e8f0' }}>
                               <td style={{ padding: '3px 0' }}>Vencimento: {p.date} ({p.description || `Parcela ${idx + 1}`})</td>
                               <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '800' }}>{formatBRL(p.amount)}</td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                  </div>
                )}
             </div>

             {/* Totalizadores */}
             <div style={{ width: '220px', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                   <tbody>
                      <tr>
                        <td style={{ padding: '3px 0', color: '#64748b' }}>Subtotal:</td>
                        <td style={{ textAlign: 'right', padding: '3px 0', fontWeight: '700' }}>{formatBRL(printOrder.subtotal)}</td>
                      </tr>
                      {printOrder.discount > 0 && (
                        <tr>
                          <td style={{ padding: '3px 0', color: '#64748b' }}>Desconto:</td>
                          <td style={{ textAlign: 'right', padding: '3px 0', fontWeight: '700', color: '#ef4444' }}>- {formatBRL(printOrder.discount)}</td>
                        </tr>
                      )}
                      {printOrder.shipping > 0 && (
                        <tr>
                          <td style={{ padding: '3px 0', color: '#64748b' }}>Frete (+):</td>
                          <td style={{ textAlign: 'right', padding: '3px 0', fontWeight: '700' }}>{formatBRL(printOrder.shipping)}</td>
                        </tr>
                      )}
                      <tr style={{ borderTop: '2px solid #0f172a' }}>
                         <td style={{ padding: '8px 0 0 0', fontSize: '12px', fontWeight: '900', color: '#0f172a' }}>TOTAL GERAL:</td>
                         <td style={{ textAlign: 'right', padding: '8px 0 0 0', fontSize: '14px', fontWeight: '900', color: '#0f172a' }}>{formatBRL(printOrder.total)}</td>
                      </tr>
                   </tbody>
                </table>
             </div>
          </div>

          {/* Controle de Retiradas de Carga */}
          {(printOrder.withdrawals && printOrder.withdrawals.length > 0) && (
            <div style={{ marginBottom: '20px', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '8px', background: '#f8fafc' }}>
              <h4 style={{ fontSize: '9px', fontWeight: '900', margin: '0 0 6px 0', textTransform: 'uppercase' }}>Histórico de Retiradas de Carga (Expedição)</h4>
              <table style={{ width: '100%', fontSize: '8.5px', borderCollapse: 'collapse' }}>
                 <thead>
                    <tr style={{ color: '#64748b', borderBottom: '1px solid #cbd5e1' }}>
                       <th style={{ textAlign: 'left', padding: '3px' }}>DATA</th>
                       <th style={{ textAlign: 'left', padding: '3px' }}>PLACA</th>
                       <th style={{ textAlign: 'left', padding: '3px' }}>MOTORISTA</th>
                       <th style={{ textAlign: 'center', padding: '3px' }}>TICKET</th>
                       <th style={{ textAlign: 'right', padding: '3px' }}>CARGA RETIRADA</th>
                    </tr>
                 </thead>
                 <tbody>
                    {printOrder.withdrawals.map((w, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                         <td style={{ padding: '3px' }}>{w.date}</td>
                         <td style={{ padding: '3px', fontWeight: '700' }}>{w.plateNumber}</td>
                         <td style={{ padding: '3px' }}>{w.driverName}</td>
                         <td style={{ padding: '3px', textAlign: 'center' }}>{w.weighTicketNumber}</td>
                         <td style={{ padding: '3px', textAlign: 'right', fontWeight: '800' }}>{w.quantityWithdrawn} TON</td>
                      </tr>
                    ))}
                 </tbody>
              </table>
            </div>
          )}

          {/* Assinaturas */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '45px', gap: '30px' }}>
             <div style={{ flex: 1, borderTop: '1px solid #0f172a', textAlign: 'center', paddingTop: '6px' }}>
                <p style={{ fontSize: '9px', margin: 0, fontWeight: '900', textTransform: 'uppercase' }}>
                  {customers.find(c => c.id === printOrder.customerId)?.name}
                </p>
                <p style={{ fontSize: '8px', color: '#64748b', margin: 0 }}>Assinatura do Cliente / Produtor</p>
             </div>
             <div style={{ flex: 1, borderTop: '1px solid #0f172a', textAlign: 'center', paddingTop: '6px' }}>
                <p style={{ fontSize: '9px', margin: 0, fontWeight: '900', textTransform: 'uppercase' }}>{company.name}</p>
                <p style={{ fontSize: '8px', color: '#64748b', margin: 0 }}>Representante Comercial / Expedição</p>
             </div>
          </div>

        </div>
      )}

    </div>
  );
};

export default SalesOrders;
