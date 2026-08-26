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
  CheckCircle2, ArrowUpRight, Scale, ChevronDown, ListOrdered, Sparkles, Wheat, Zap
} from 'lucide-react';
import { EmitirNfeModal } from './EmitirNfeModal';
import { DanfeModal } from './DanfeModal';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { OrderWithdrawalModal } from './OrderWithdrawalModal';
import { RegisterPaymentModal } from './RegisterPaymentModal';
import { DeletionPasswordModal } from './DeletionPasswordModal';
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

export type PaymentStatusType = 'PAGO' | 'PARCIAL' | 'PENDENTE';

export const calculateOrderPayment = (order: SaleOrder) => {
  const receiptsPaid = (order.receipts || []).reduce((s, r) => s + r.amount, 0);
  const scheduledPaid = (order.payments || []).reduce((s, p) => (p.status === TransactionStatus.CONFIRMADO || p.status === TransactionStatus.PAGO ? s + p.amount : s + (p.paidAmount || 0)), 0);
  const totalPaid = Math.max(receiptsPaid, scheduledPaid);
  const remainingDebt = Math.max(0, order.total - totalPaid);
  const financialProgress = order.total > 0 ? Math.min(100, (totalPaid / order.total) * 100) : 0;

  let paymentStatus: PaymentStatusType = 'PENDENTE';
  if (order.total > 0 && totalPaid >= order.total - 0.01) {
    paymentStatus = 'PAGO';
  } else if (totalPaid > 0 && remainingDebt > 0.01) {
    paymentStatus = 'PARCIAL';
  } else {
    paymentStatus = 'PENDENTE';
  }

  return {
    totalPaid,
    remainingDebt,
    financialProgress,
    paymentStatus
  };
};

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
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'FINALIZED' | 'PAID' | 'PARTIAL' | 'PENDING' | 'BUDGET'>('ALL');
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
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
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

  // Barter / Permuta em Grãos
  const [isBarter, setIsBarter] = useState(false);
  const [barterCommodityType, setBarterCommodityType] = useState<'MILHO' | 'SOJA'>('MILHO');
  const [cornPricePerTon, setCornPricePerTon] = useState('1100'); // R$ 1.100 por tonelada (ou ~R$ 66/sc)
  
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

  // Cálculo Automático de Toneladas e Sacas de Grãos (Barter)
  const grainTonsEquivalent = useMemo(() => {
    const grainPrice = parseFloat(cornPricePerTon) || 0;
    if (grainPrice <= 0 || totalOrderValue <= 0) return 0;
    return totalOrderValue / grainPrice;
  }, [totalOrderValue, cornPricePerTon]);

  const grainBagsEquivalent = grainTonsEquivalent * (1000 / 60); // 1 Ton = 16.666 sacas de 60kg

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
      isBarter: isBarter,
      barterCommodityType: isBarter ? barterCommodityType : undefined,
      cornTons: isBarter ? grainTonsEquivalent : undefined,
      cornPricePerTon: isBarter ? parseFloat(cornPricePerTon) : undefined,
      items: [itemData],
      payments: payments,
      receipts: generatedReceipts,
      withdrawals: editingOrder?.withdrawals || [],
      notes: isBarter 
        ? `[OPERAÇÃO DE BARTER / PERMUTA] Grão: ${barterCommodityType} | Equivalência: ${grainTonsEquivalent.toFixed(2)} TON (${grainBagsEquivalent.toFixed(0)} SC) @ ${formatBRL(parseFloat(cornPricePerTon))}/TON. ${notes}`
        : notes
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

  // Conversão Direta de Orçamento para Venda (Quote to Sale)
  const handleConvertToSale = (order: SaleOrder) => {
    const updatedOrder: SaleOrder = {
      ...order,
      status: OrderStatus.FINALIZED,
      notes: `${order.notes || ''}\n[${new Date().toLocaleDateString('pt-BR')}] Orçamento convertido em Venda Confirmada.`
    };
    onUpdateOrder(updatedOrder);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingOrder(null);
    setCurrentStep(1);
    resetForm();
  };

  const resetForm = () => {
    setCurrentStep(1);
    setSelectedCustomerId('');
    setCustomerSearch('');
    setQuantity('');
    setUnitPrice('180');
    setDiscount('0');
    setShipping('0');
    setNotes('');
    setIsBarter(false);
    setBarterCommodityType('MILHO');
    setCornPricePerTon('1100');
    setDownPayment('0');
    setPayments([]);
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!selectedCustomerId) {
        alert("Por favor, selecione um cliente da lista antes de avançar.");
        return;
      }
      if (!quantity || parseFloat(quantity) <= 0) {
        alert("Por favor, informe a quantidade de calcário em toneladas.");
        return;
      }
      if (!unitPrice || parseFloat(unitPrice) <= 0) {
        alert("Por favor, informe o preço unitário por tonelada.");
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!isBudget && payments.length > 0 && Math.abs(remainingToProgram) > 0.05) {
        alert(`O total das parcelas deve coincidir com o saldo a parcelar (${formatBRL(balanceToSchedule)}). Ajuste as parcelas para avançar.`);
        return;
      }
      setCurrentStep(3);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as 1 | 2 | 3);
    }
  };

  const generateQuickInstallments = (count: number) => {
    const targetAmount = balanceToSchedule;
    if (targetAmount <= 0) return;
    const partAmount = Number((targetAmount / count).toFixed(2));
    const newPayments: SalePayment[] = [];
    let accumulated = 0;
    for (let i = 1; i <= count; i++) {
      const isLast = i === count;
      const amount = isLast ? Number((targetAmount - accumulated).toFixed(2)) : partAmount;
      accumulated += amount;
      const dueDate = new Date(Date.now() + i * 30 * 86400000).toISOString().split('T')[0];
      newPayments.push({
        id: `pay-${Date.now()}-${i}`,
        amount,
        paidAmount: 0,
        date: dueDate,
        status: TransactionStatus.PENDENTE,
        accountId: accounts[0]?.id || '',
        description: count === 1 ? 'À Vista (30 dias)' : `Parcela ${i}/${count}`
      });
    }
    setPayments(newPayments);
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

  // Contadores para abas de status de pagamento
  const { countPaid, countPartial, countPending, countBudget } = useMemo(() => {
    let paid = 0;
    let partial = 0;
    let pending = 0;
    let budget = 0;

    orders.forEach(o => {
      if (o.status === OrderStatus.BUDGET) {
        budget++;
      } else {
        const { paymentStatus } = calculateOrderPayment(o);
        if (paymentStatus === 'PAGO') paid++;
        else if (paymentStatus === 'PARCIAL') partial++;
        else pending++;
      }
    });

    return { countPaid: paid, countPartial: partial, countPending: pending, countBudget: budget };
  }, [orders]);

  // Filtragem dos Pedidos
  const filteredOrders = orders.filter(o => {
    const { paymentStatus } = calculateOrderPayment(o);

    if (activeFilter === 'FINALIZED' && o.status !== OrderStatus.FINALIZED) return false;
    if (activeFilter === 'PAID' && (o.status !== OrderStatus.FINALIZED || paymentStatus !== 'PAGO')) return false;
    if (activeFilter === 'PARTIAL' && (o.status !== OrderStatus.FINALIZED || paymentStatus !== 'PARCIAL')) return false;
    if (activeFilter === 'PENDING' && (o.status !== OrderStatus.FINALIZED || paymentStatus !== 'PENDENTE')) return false;
    if (activeFilter === 'BUDGET' && o.status !== OrderStatus.BUDGET) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const customer = customers.find(c => c.id === o.customerId);
      const matchCust = customer?.name.toLowerCase().includes(q) || customer?.document.includes(q);
      const matchRef = o.reference.toLowerCase().includes(q);
      const matchPaymentStatus = paymentStatus.toLowerCase().includes(q);
      return matchCust || matchRef || matchPaymentStatus;
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

      {/* Barra de Filtros por Status de Pagamento e Busca */}
      <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col xl:flex-row gap-4 items-center justify-between print:hidden">
        
        {/* Abas com badges de contagem */}
        <div className="flex flex-wrap p-1.5 bg-slate-100/90 rounded-2xl w-full xl:w-auto gap-1">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Todos <span className="px-1.5 py-0.2 rounded-md bg-slate-200 text-slate-700 text-[10px]">{orders.length}</span>
          </button>

          <button
            onClick={() => setActiveFilter('PAID')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              activeFilter === 'PAID' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-emerald-700'
            }`}
          >
            <CheckCircle2 size={13} className={activeFilter === 'PAID' ? 'text-white' : 'text-emerald-600'} />
            Pagos / Quitados
            <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${activeFilter === 'PAID' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
              {countPaid}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('PARTIAL')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              activeFilter === 'PARTIAL' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-amber-700'
            }`}
          >
            <Clock size={13} className={activeFilter === 'PARTIAL' ? 'text-white' : 'text-amber-600'} />
            Parciais
            <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${activeFilter === 'PARTIAL' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'}`}>
              {countPartial}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('PENDING')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              activeFilter === 'PENDING' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:text-rose-700'
            }`}
          >
            <AlertTriangle size={13} className={activeFilter === 'PENDING' ? 'text-white' : 'text-rose-600'} />
            Débitos Pendentes
            <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${activeFilter === 'PENDING' ? 'bg-rose-700 text-white' : 'bg-rose-100 text-rose-800'}`}>
              {countPending}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('BUDGET')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              activeFilter === 'BUDGET' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText size={13} />
            Orçamentos
            <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${activeFilter === 'BUDGET' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {countBudget}
            </span>
          </button>
        </div>

        {/* Input de Busca */}
        <div className="relative flex-1 w-full xl:w-auto max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Buscar por cliente, CPF/CNPJ, ref ou status..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs focus:border-purple-500"
          />
        </div>

      </div>

      {/* Lista de Pedidos em Cards Modernos & Elegantes com Indicador Visual de Pagamento */}
      <div className="space-y-4 print:hidden">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm space-y-4 max-w-xl mx-auto my-8">
            <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <ShoppingCart size={32} />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-800">Nenhum pedido de venda registrado</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Comece emitindo um novo pedido de venda ou orçamento comercial para faturamento e expedição de calcário.
              </p>
            </div>
            <button
              onClick={() => { setEditingOrder(null); setIsModalOpen(true); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-purple-200"
            >
              <Plus size={16} /> Emitir Primeiro Pedido
            </button>
          </div>
        ) : (
          filteredOrders.slice().reverse().map(order => {
            const customer = customers.find(c => c.id === order.customerId);
            const totalQty = order.items.reduce((s, it) => s + (it.quantity || 0), 0);
            
            // Cálculos Financeiros e Status do Pedido
            const { totalPaid, remainingDebt, financialProgress, paymentStatus } = calculateOrderPayment(order);

            // Cálculos de Retiradas de Carga
            const totalWithdrawn = (order.withdrawals || []).reduce((s, w) => s + (w.quantityWithdrawn || 0), 0);
            const remainingWithdraw = Math.max(0, totalQty - totalWithdrawn);
            const withdrawalProgress = totalQty > 0 ? Math.min(100, (totalWithdrawn / totalQty) * 100) : 0;

            return (
              <div 
                key={order.id} 
                className="bg-white rounded-3xl border border-slate-200/90 p-6 md:p-7 shadow-sm hover:shadow-md hover:border-slate-300 transition-all space-y-5"
              >
                
                {/* Linha Superior: Cabeçalho do Pedido, Cliente e Badges de Pagamento */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3.5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                      order.status === OrderStatus.BUDGET
                        ? 'bg-amber-50 text-amber-600 border border-amber-200/60'
                        : paymentStatus === 'PAGO'
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/60'
                        : paymentStatus === 'PARCIAL'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                        : 'bg-rose-50 text-rose-600 border border-rose-200/60'
                    }`}>
                      <ShoppingCart size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-black text-base md:text-lg text-slate-900 tracking-tight">
                          {customer?.name || 'Cliente Geral'}
                        </h3>
                        <span className="text-[10px] font-mono font-black uppercase px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                          {order.reference}
                        </span>

                        {/* Tag de Alerta de Débito junto ao nome do cliente */}
                        {order.status === OrderStatus.FINALIZED && (
                          paymentStatus === 'PENDENTE' ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                              <AlertTriangle size={10} /> Débito ({formatBRL(remainingDebt)})
                            </span>
                          ) : paymentStatus === 'PARCIAL' ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock size={10} /> Restante: {formatBRL(remainingDebt)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 size={10} /> Quitado
                            </span>
                          )
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider text-[10px] pt-0.5">
                        Doc: {customer?.document || 'Não informado'} • Data: {order.date} {order.sellerName ? `• Vendedor: ${order.sellerName}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Status Badges: Badge de Pagamento Colorido e NF-e */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Badge de Orçamento */}
                    {order.status === OrderStatus.BUDGET ? (
                      <span className="text-[10px] font-black px-3 py-1.5 rounded-xl uppercase bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
                        <FileText size={13} /> Orçamento
                      </span>
                    ) : (
                      /* Badge Colorido de Status de Pagamento */
                      paymentStatus === 'PAGO' ? (
                        <span className="text-[10px] font-black px-3 py-1.5 rounded-xl uppercase bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                          <CheckCircle2 size={13} className="text-emerald-600" />
                          <span>Pago / Quitado</span>
                        </span>
                      ) : paymentStatus === 'PARCIAL' ? (
                        <span className="text-[10px] font-black px-3 py-1.5 rounded-xl uppercase bg-amber-50 text-amber-900 border border-amber-200 flex items-center gap-1.5">
                          <Clock size={13} className="text-amber-600" />
                          <span>Pagamento Parcial</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-black px-3 py-1.5 rounded-xl uppercase bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-1.5">
                          <AlertTriangle size={13} className="text-rose-600" />
                          <span>Pagamento Pendente</span>
                        </span>
                      )
                    )}

                    {order.status === OrderStatus.FINALIZED && (
                      order.nfeStatus === 'autorizada' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black px-3 py-1.5 rounded-xl uppercase bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                            <FileCheck size={12} /> NF-e Nº {order.nfeNumero || '1041'}
                          </span>
                          <button
                            onClick={() => setOrderToViewDanfe(order)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black transition-all flex items-center gap-1"
                          >
                            <Eye size={12} /> DANFE
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setOrderToEmitNfe(order)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-[10px] font-black shadow-sm transition-all"
                        >
                          <Send size={12} /> Emitir NF-e
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Resumo de Produtos Faturados no Pedido */}
                <div className="flex flex-wrap items-center gap-2 py-1">
                  {order.items.map((item, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100/80 border border-slate-200/80 rounded-xl text-xs font-bold text-slate-700">
                      <Package size={13} className="text-slate-400" />
                      <span>{item.productName}:</span>
                      <span className="font-black text-slate-900">{item.quantity} {item.unit || 'Ton'}</span>
                      <span className="text-slate-400 font-mono text-[11px]">(@ {formatBRL(item.unitPrice)}/{item.unit || 'Ton'})</span>
                      <span className="text-purple-700 font-mono font-black">={formatBRL(item.total)}</span>
                    </span>
                  ))}
                  {order.discount > 0 && (
                    <span className="px-2.5 py-1 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700">
                      Desconto: -{formatBRL(order.discount)}
                    </span>
                  )}
                  {order.shipping > 0 && (
                    <span className="px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-xl text-xs font-bold text-blue-700">
                      Frete: +{formatBRL(order.shipping)}
                    </span>
                  )}
                </div>

                {/* Bloco Central: Painéis de Saldo Financeiro e Saldo de Retirada */}
                {order.isBarter && (
                  <div className="p-3.5 bg-amber-50/90 border border-amber-300 rounded-2xl flex items-center justify-between gap-3 text-amber-950">
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <Wheat size={18} className="text-amber-600 shrink-0" />
                      <span>
                        <b>Operação de Barter / Permuta em Grãos:</b> {(order.cornTons || 0).toFixed(2)} TON de {order.barterCommodityType || 'Milho'} 
                        {order.cornPricePerTon ? ` (@ ${formatBRL(order.cornPricePerTon)}/TON)` : ''}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-black uppercase px-2.5 py-1 rounded-lg bg-amber-200/70 text-amber-900">
                      Permuta Grãos
                    </span>
                  </div>
                )}

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
                    {order.status === OrderStatus.BUDGET ? (
                      <button
                        onClick={() => handleConvertToSale(order)}
                        className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-2xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md shadow-amber-100 hover:scale-105"
                        title="Converter este orçamento em uma venda confirmada"
                      >
                        <Zap size={14} className="fill-current" /> Converter em Venda
                      </button>
                    ) : (
                      <>
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
                      </>
                    )}

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

      {/* Modal Criar / Editar Pedido em Etapas (Stepper) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-4 print:hidden">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
            
            {/* Topo do Modal com Título e Fechamento */}
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-900 text-white rounded-xl shadow-sm">
                  {editingOrder ? <Pencil size={18} /> : <ShoppingCart size={18} />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">
                    {editingOrder ? `Editar Pedido (${editingOrder.reference})` : (isBudget ? 'Novo Orçamento Comercial' : 'Novo Pedido de Venda')}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">{company.name} • Unidade de Faturamento</p>
                </div>
              </div>
              <button 
                onClick={handleCloseModal} 
                className="p-1.5 hover:bg-slate-200/70 rounded-lg transition-colors text-slate-400 hover:text-slate-700"
                title="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Stepper Progress Bar Sóbria */}
            <div className="bg-slate-100/80 px-6 py-3 border-b border-slate-200">
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                
                {/* Etapa 1 */}
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className={`flex items-center gap-2 text-left p-1.5 rounded-lg transition-all ${
                    currentStep === 1
                      ? 'bg-white shadow-sm border border-slate-200/80 text-slate-900'
                      : currentStep > 1
                      ? 'text-emerald-700 hover:bg-white/50'
                      : 'text-slate-400 opacity-60'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    currentStep === 1
                      ? 'bg-slate-900 text-white'
                      : currentStep > 1
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-500'
                  }`}>
                    {currentStep > 1 ? <Check size={13} /> : '1'}
                  </span>
                  <div className="min-w-0 hidden sm:block">
                    <p className="text-xs font-bold leading-tight truncate">Cliente & Itens</p>
                    <p className="text-[10px] text-slate-400 leading-none">Dados da carga</p>
                  </div>
                </button>

                {/* Etapa 2 */}
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCustomerId && parseFloat(quantity) > 0) {
                      setCurrentStep(2);
                    }
                  }}
                  className={`flex items-center gap-2 text-left p-1.5 rounded-lg transition-all ${
                    currentStep === 2
                      ? 'bg-white shadow-sm border border-slate-200/80 text-slate-900'
                      : currentStep > 2
                      ? 'text-emerald-700 hover:bg-white/50'
                      : 'text-slate-400 opacity-60'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    currentStep === 2
                      ? 'bg-slate-900 text-white'
                      : currentStep > 2
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-500'
                  }`}>
                    {currentStep > 2 ? <Check size={13} /> : '2'}
                  </span>
                  <div className="min-w-0 hidden sm:block">
                    <p className="text-xs font-bold leading-tight truncate">Faturamento</p>
                    <p className="text-[10px] text-slate-400 leading-none">Entrada & Prazos</p>
                  </div>
                </button>

                {/* Etapa 3 */}
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCustomerId && parseFloat(quantity) > 0) {
                      setCurrentStep(3);
                    }
                  }}
                  className={`flex items-center gap-2 text-left p-1.5 rounded-lg transition-all ${
                    currentStep === 3
                      ? 'bg-white shadow-sm border border-slate-200/80 text-slate-900'
                      : 'text-slate-400 opacity-60'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    currentStep === 3
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-200 text-slate-500'
                  }`}>
                    3
                  </span>
                  <div className="min-w-0 hidden sm:block">
                    <p className="text-xs font-bold leading-tight truncate">Revisão & Emissão</p>
                    <p className="text-[10px] text-slate-400 leading-none">Confirmação final</p>
                  </div>
                </button>

              </div>
            </div>

            {/* Conteúdo Dinâmico do Stepper */}
            <form onSubmit={handleCreateOrUpdateOrder} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 custom-scrollbar">
              
              {/* ETAPA 1: CLIENTE & ITENS */}
              {currentStep === 1 && (
                <div className="space-y-5 animate-in fade-in duration-150">
                  
                  {/* Seletor de Tipo de Documento */}
                  <div className="flex items-center justify-between p-1 bg-slate-100 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setIsBudget(false)}
                      className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all ${
                        !isBudget ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Venda Confirmada (Faturamento)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsBudget(true)}
                      className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all ${
                        isBudget ? 'bg-white text-amber-800 shadow-sm font-black' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Orçamento Comercial (Cotação)
                    </button>
                  </div>

                  {/* Seleção do Cliente com Busca */}
                  <div className="space-y-1.5 relative" ref={customerDropdownRef}>
                    <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><User size={13} /> Cliente Destinatário / Produtor *</span>
                      {selectedCustomerId && (
                        <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                          <Check size={12} /> Cliente Selecionado
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <input 
                        required
                        type="text"
                        placeholder="Digite o nome, CPF/CNPJ ou telefone do cliente..."
                        value={customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          setIsCustomerDropdownOpen(true);
                          if (selectedCustomerId) setSelectedCustomerId('');
                        }}
                        onFocus={() => setIsCustomerDropdownOpen(true)}
                        className="w-full pl-3.5 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-slate-800 focus:ring-1 focus:ring-slate-800 outline-none font-medium text-sm transition-all"
                      />
                      {customerSearch && (
                        <button 
                          type="button" 
                          onClick={() => { setCustomerSearch(''); setSelectedCustomerId(''); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {isCustomerDropdownOpen && (
                      <div className="absolute z-[110] top-full left-0 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto custom-scrollbar">
                        {filteredCustomers.length === 0 ? (
                          <div className="p-4 text-center text-slate-400 text-xs">
                            Nenhum cliente encontrado com esse termo.
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
                              className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors flex justify-between items-center ${
                                selectedCustomerId === c.id ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700'
                              }`}
                            >
                              <div>
                                <p className="text-xs font-bold">{c.name}</p>
                                <p className="text-[11px] text-slate-400">Doc: {c.document} {c.phone ? `• Tel: ${c.phone}` : ''}</p>
                              </div>
                              {selectedCustomerId === c.id && <Check size={14} className="text-emerald-600" />}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Volume e Preço Unitário */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Package size={14} /> Especificação do Produto & Quantidade
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">Calcário Agrícola Granel (PRNT &gt; 85%)</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Volume (Toneladas) *</label>
                        <input 
                          required 
                          type="number" 
                          step="0.1" 
                          value={quantity} 
                          onChange={e => setQuantity(e.target.value)} 
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:border-slate-800 outline-none font-bold text-sm" 
                          placeholder="Ex: 50.0" 
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Preço Unitário (R$ / Tonelada) *</label>
                        <input 
                          required 
                          type="number" 
                          step="0.01" 
                          value={unitPrice} 
                          onChange={e => setUnitPrice(e.target.value)} 
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:border-slate-800 outline-none font-bold text-sm" 
                          placeholder="180.00" 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Desconto Comercial (R$)</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          value={discount} 
                          onChange={e => setDiscount(e.target.value)} 
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:border-slate-800 outline-none font-medium text-sm" 
                          placeholder="0.00" 
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Frete / Entrega (R$)</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          value={shipping} 
                          onChange={e => setShipping(e.target.value)} 
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:border-slate-800 outline-none font-medium text-sm" 
                          placeholder="0.00" 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Operação de Barter / Permuta */}
                  <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5 cursor-pointer">
                        <Wheat size={15} className="text-amber-700" />
                        <span>Habilitar Operação de Barter / Permuta em Grãos</span>
                      </label>
                      <input 
                        type="checkbox" 
                        checked={isBarter} 
                        onChange={e => setIsBarter(e.target.checked)}
                        className="w-4 h-4 accent-slate-900 cursor-pointer rounded"
                      />
                    </div>

                    {isBarter && (
                      <div className="pt-2 border-t border-amber-200/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="text-[10px] font-bold text-amber-900 block mb-1">Grão da Permuta</label>
                          <select 
                            value={barterCommodityType} 
                            onChange={e => setBarterCommodityType(e.target.value as 'MILHO' | 'SOJA')}
                            className="w-full p-2 bg-white border border-amber-300 rounded-lg outline-none font-medium"
                          >
                            <option value="MILHO">Milho Granel</option>
                            <option value="SOJA">Soja Granel</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-amber-900 block mb-1">Cotação (R$ / Tonelada)</label>
                          <input 
                            type="number" 
                            step="1" 
                            value={cornPricePerTon} 
                            onChange={e => setCornPricePerTon(e.target.value)}
                            className="w-full p-2 bg-white border border-amber-300 rounded-lg outline-none font-medium"
                            placeholder="1100"
                          />
                        </div>
                        <div className="sm:col-span-2 p-2 bg-white rounded-lg border border-amber-200 flex justify-between items-center text-[11px] font-bold text-amber-900">
                          <span>Equivalência Estimada:</span>
                          <span>{grainTonsEquivalent.toFixed(2)} TON (~{grainBagsEquivalent.toFixed(0)} sacas de 60kg)</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Observações */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Observações do Pedido / Entrega</label>
                    <textarea 
                      value={notes} 
                      onChange={e => setNotes(e.target.value)} 
                      rows={2}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl focus:border-slate-800 outline-none text-xs font-medium resize-none" 
                      placeholder="Ex: Instruções de rota, fazenda de destino ou requisitos de expedição..." 
                    />
                  </div>

                  {/* Resumo Rápido da Etapa 1 */}
                  <div className="p-3 bg-slate-900 text-white rounded-xl flex justify-between items-center text-xs">
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Subtotal Líquido</p>
                      <p className="font-bold">{parseFloat(quantity) || 0} TON @ {formatBRL(parseFloat(unitPrice) || 0)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total do Documento</p>
                      <p className="text-base font-black text-emerald-400">{formatBRL(totalOrderValue)}</p>
                    </div>
                  </div>

                </div>
              )}

              {/* ETAPA 2: FATURAMENTO & PRAZOS */}
              {currentStep === 2 && (
                <div className="space-y-5 animate-in fade-in duration-150">
                  
                  {isBudget ? (
                    <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-2">
                      <FileText size={32} className="mx-auto text-slate-400" />
                      <h4 className="text-sm font-bold text-slate-800">Orçamento Comercial Selecionado</h4>
                      <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                        Este documento é apenas uma proposta de venda. Ele não gerará títulos no Contas a Receber nem movimentará estoque até ser formalmente aprovado e convertido em Venda Confirmada.
                      </p>
                      <p className="text-[11px] text-slate-400 pt-2 font-medium">
                        Validade da proposta: 15 dias a partir da data de emissão.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      
                      {/* Resumo do Total */}
                      <div className="p-4 bg-slate-100 rounded-xl flex justify-between items-center border border-slate-200">
                        <div>
                          <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Total da Venda</p>
                          <p className="text-lg font-black text-slate-900">{formatBRL(totalOrderValue)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Saldo a Programar</p>
                          <p className={`text-base font-black ${remainingToProgram === 0 ? 'text-emerald-700' : 'text-slate-800'}`}>
                            {formatBRL(remainingToProgram)}
                          </p>
                        </div>
                      </div>

                      {/* Entrada / Sinal no Ato */}
                      {!editingOrder && (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <DollarSign size={14} className="text-emerald-700" /> Entrada / Pagamento no Ato da Venda (Opcional)
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 block mb-1">Valor da Entrada (R$)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={downPayment}
                                onChange={e => setDownPayment(e.target.value)}
                                placeholder="0.00"
                                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none font-bold text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 block mb-1">Forma de Pagamento</label>
                              <select
                                value={downPaymentMethod}
                                onChange={e => setDownPaymentMethod(e.target.value)}
                                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none font-medium text-xs"
                              >
                                <option value="PIX">PIX</option>
                                <option value="Dinheiro">Dinheiro</option>
                                <option value="Transferência Bancária">Transferência Bancária</option>
                                <option value="Boleto">Boleto Bancário</option>
                                <option value="Cartão de Débito">Cartão de Débito</option>
                                <option value="Cartão de Crédito">Cartão de Crédito</option>
                                <option value="Cheque">Cheque</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 block mb-1">Conta de Destino</label>
                              <select
                                value={downPaymentAccount}
                                onChange={e => setDownPaymentAccount(e.target.value)}
                                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none font-medium text-xs truncate"
                              >
                                {accounts.map(a => (
                                  <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          {downPaymentNum > 0 && (
                            <p className="text-[11px] text-emerald-800 font-medium bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                              ✓ Um recibo de entrada oficial será gerado e vinculado a esta venda.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Gerador Rápido de Parcelas e Lista */}
                      <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <CreditCard size={14} /> Parcelas & Vencimentos
                          </label>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-slate-400 font-bold uppercase mr-1">Preenchimento Rápido:</span>
                            <button
                              type="button"
                              onClick={() => generateQuickInstallments(1)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-bold transition-colors"
                            >
                              1x (30 dias)
                            </button>
                            <button
                              type="button"
                              onClick={() => generateQuickInstallments(2)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-bold transition-colors"
                            >
                              2x (30/60d)
                            </button>
                            <button
                              type="button"
                              onClick={() => generateQuickInstallments(3)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-bold transition-colors"
                            >
                              3x (30/60/90d)
                            </button>
                            <button
                              type="button"
                              onClick={addPaymentRow}
                              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-[11px] font-bold transition-colors flex items-center gap-1"
                            >
                              <Plus size={12} /> + Parcela
                            </button>
                          </div>
                        </div>

                        {payments.length === 0 ? (
                          <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-500">
                            Nenhuma parcela programada. Use os botões de preenchimento rápido acima ou clique em "+ Parcela".
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                            {payments.map((p, idx) => (
                              <div key={p.id} className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center gap-3 shadow-sm">
                                <span className="text-[11px] font-bold text-slate-400 w-6 text-center">#{idx + 1}</span>
                                <div className="flex-1 grid grid-cols-2 gap-2">
                                  <div>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={p.amount}
                                      onChange={e => updatePaymentRow(p.id, 'amount', parseFloat(e.target.value) || 0)}
                                      className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded text-xs font-bold outline-none"
                                      placeholder="Valor R$"
                                    />
                                  </div>
                                  <div>
                                    <input
                                      type="date"
                                      value={p.date}
                                      onChange={e => updatePaymentRow(p.id, 'date', e.target.value)}
                                      className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded text-xs font-medium outline-none"
                                    />
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removePaymentRow(p.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                                  title="Remover parcela"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  )}

                </div>
              )}

              {/* ETAPA 3: REVISÃO & CONFIRMAÇÃO */}
              {currentStep === 3 && (
                <div className="space-y-4 animate-in fade-in duration-150 text-xs">
                  
                  {/* Resumo do Cliente */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Destinatário</span>
                      <button 
                        type="button" 
                        onClick={() => setCurrentStep(1)} 
                        className="text-[11px] text-slate-600 hover:text-slate-900 font-bold underline"
                      >
                        Alterar
                      </button>
                    </div>
                    <p className="text-sm font-bold text-slate-900">{selectedCustomer?.name || 'Cliente Não Selecionado'}</p>
                    <p className="text-slate-500">
                      Documento: {selectedCustomer?.document || 'N/A'} {selectedCustomer?.phone ? `• Telefone: ${selectedCustomer.phone}` : ''}
                    </p>
                  </div>

                  {/* Resumo dos Itens e Valores */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Carga & Valores</span>
                      <button 
                        type="button" 
                        onClick={() => setCurrentStep(1)} 
                        className="text-[11px] text-slate-600 hover:text-slate-900 font-bold underline"
                      >
                        Alterar
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold">VOLUME</span>
                        <p className="font-bold text-slate-900">{quantity} TON</p>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold">PREÇO / TON</span>
                        <p className="font-bold text-slate-900">{formatBRL(parseFloat(unitPrice) || 0)}</p>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold">DESCONTO / FRETE</span>
                        <p className="font-medium text-slate-700">-{formatBRL(parseFloat(discount) || 0)} / +{formatBRL(parseFloat(shipping) || 0)}</p>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold">TOTAL GERAL</span>
                        <p className="font-black text-slate-900 text-sm">{formatBRL(totalOrderValue)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Barter (Se houver) */}
                  {isBarter && (
                    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-amber-900 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-xs">Operação Barter ({barterCommodityType})</p>
                        <p className="text-[11px]">Cotação: {formatBRL(parseFloat(cornPricePerTon) || 0)}/TON</p>
                      </div>
                      <p className="font-bold text-xs">
                        {grainTonsEquivalent.toFixed(2)} TON (~{grainBagsEquivalent.toFixed(0)} SC)
                      </p>
                    </div>
                  )}

                  {/* Resumo Financeiro / Condições */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Condições de Pagamento</span>
                      <button 
                        type="button" 
                        onClick={() => setCurrentStep(2)} 
                        className="text-[11px] text-slate-600 hover:text-slate-900 font-bold underline"
                      >
                        Alterar
                      </button>
                    </div>
                    {isBudget ? (
                      <p className="text-slate-600 italic">Orçamento comercial sem parcelas pré-faturadas.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {downPaymentNum > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-600">Entrada no Ato ({downPaymentMethod}):</span>
                            <span className="font-bold text-emerald-700">{formatBRL(downPaymentNum)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600">Parcelamento ({payments.length} parcelas):</span>
                          <span className="font-bold text-slate-900">{formatBRL(totalProgrammed)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              )}

            </form>

            {/* Rodapé de Navegação do Stepper */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <div>
                {currentStep === 1 ? (
                  <button 
                    type="button" 
                    onClick={handleCloseModal} 
                    className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                ) : (
                  <button 
                    type="button" 
                    onClick={handlePrevStep} 
                    className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    ← Voltar
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {currentStep < 3 ? (
                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    {currentStep === 1 ? 'Avançar para Faturamento' : 'Avançar para Revisão'} →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCreateOrUpdateOrder}
                    className={`px-6 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-sm flex items-center gap-1.5 ${
                      isBudget ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-700 hover:bg-emerald-800'
                    }`}
                  >
                    <CheckCircle2 size={15} />
                    {editingOrder ? 'Salvar Alterações' : (isBudget ? 'Emitir Orçamento' : 'Emitir Pedido de Venda')}
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Modal de Histórico de Recibos & Retiradas do Pedido */}
      {selectedOrderDetails && (() => {
        const { totalPaid, remainingDebt, paymentStatus } = calculateOrderPayment(selectedOrderDetails);
        const modalCustomer = customers.find(c => c.id === selectedOrderDetails.customerId);

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl p-8 space-y-6 max-h-[85vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95">
              <div className="flex justify-between items-start border-b pb-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-xl font-black text-slate-900">Extrato & Romaneios do Pedido</h3>
                    {selectedOrderDetails.status === OrderStatus.BUDGET ? (
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-lg uppercase bg-amber-50 text-amber-700 border border-amber-300">
                        Orçamento
                      </span>
                    ) : paymentStatus === 'PAGO' ? (
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-lg uppercase bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1">
                        <CheckCircle2 size={12} /> Quitado (100%)
                      </span>
                    ) : paymentStatus === 'PARCIAL' ? (
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-lg uppercase bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                        <Clock size={12} /> Parcial (Débito: {formatBRL(remainingDebt)})
                      </span>
                    ) : (
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-lg uppercase bg-rose-50 text-rose-700 border border-rose-300 flex items-center gap-1">
                        <AlertTriangle size={12} /> Pendente (Débito: {formatBRL(remainingDebt)})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider text-[10px] pt-1">
                    REF: {selectedOrderDetails.reference} • Cliente: {modalCustomer?.name} • Valor Total: {formatBRL(selectedOrderDetails.total)} • Quitado: {formatBRL(totalPaid)}
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
      );
    })()}

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

      {/* Confirmação de Exclusão com Senha de 4 dígitos (1234) */}
      {selectedOrderToDelete && (
        <DeletionPasswordModal
          isOpen={isDeleteModalOpen}
          title="Excluir Pedido / Orçamento"
          description={`Tem certeza que deseja excluir o documento REF: ${selectedOrderToDelete.reference}? Esta ação removerá os lançamentos financeiros vinculados.`}
          itemDescription={`Pedido REF: ${selectedOrderToDelete.reference}`}
          onConfirm={handleConfirmDeletion}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setSelectedOrderToDelete(null);
          }}
          correctPassword="1234"
        />
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
