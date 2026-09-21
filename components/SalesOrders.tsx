import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  SaleOrder, 
  SaleOrderLinkedNfe,
  Customer, 
  InventoryItem, 
  OrderStatus, 
  Company, 
  SalePayment, 
  TransactionStatus, 
  FinancialAccount, 
  FiscalConfig,
  PaymentReceipt,
  OrderWithdrawal,
  Transportador
} from '../types';
import { 
  Plus, Printer, FileCheck, Search, X, 
  ShoppingCart, User, Calendar, Package, Clock, ShieldCheck, CreditCard, Trash2, Pencil, AlertTriangle, FileText, Tag, Truck,
  PlusCircle, Banknote, Landmark, Wallet, ChevronRight, Check, Phone, Fingerprint, Send, Eye, DollarSign, Receipt,
  CheckCircle2, ArrowUpRight, Scale, ChevronDown, ListOrdered, Sparkles, Wheat, Zap, UserPlus, Undo2, ArrowRightLeft, Files, Copy
} from 'lucide-react';
import { EmitirNfeModal } from './EmitirNfeModal';
import { EmitirNfeAvulsaModal } from './EmitirNfeAvulsaModal';
import { RecoverSaleNfeModal } from './RecoverSaleNfeModal';
import { DanfeModal } from './DanfeModal';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { OrderWithdrawalModal } from './OrderWithdrawalModal';
import { RegisterPaymentModal } from './RegisterPaymentModal';
import { DeletionPasswordModal } from './DeletionPasswordModal';
import { QuickCustomerModal } from './QuickCustomerModal';
import { SalesOrderPdfModal } from './SalesOrderPdfModal';
import { FlowSheet } from './ui/FlowSheet';
import { DateFilterControl } from './ui/DateFilterControl';
import { DatePreset, getDatePresetRange, isDateInRange } from '../utils/dateFilterUtils';
import { fiscalService } from '../services/fiscalService';
import { DEFAULT_FISCAL_CONFIG } from '../constants';
import { listOrderNfes, remainingQuantityByProduct, saleItemKey, totalRemainingQuantity, findDraftNfe, isDraftNfe, listDraftNfes, isFiscalOnlyOrder, orderReceiptsPaid } from '../services/saleNfe';
import { buildNfeDuplicateDraft, NfeDuplicateDraft } from '../services/nfeDuplicate';
import { resolveCustomerForOrder } from '../utils/customerUtils';
import {
  DEFAULT_PRODUCT_SHEET,
  OrderLineDraft,
  buildItemsFromDrafts,
  lineDraftSubtotal,
  newOrderLineDraft,
  orderItemsToDrafts,
  productSheetFromInventory,
  resolveInventoryProduct,
  sellableInventoryItems,
  sumLineDrafts
} from '../utils/salesOrderProduct';
import ErrorBoundary from './ErrorBoundary';

interface SalesOrdersProps {
  orders: SaleOrder[];
  customers: Customer[];
  inventory: InventoryItem[];
  accounts: FinancialAccount[];
  company: Company;
  companyId?: string;
  onAddOrder: (order: Omit<SaleOrder, 'id' | 'companyId' | 'reference'>) => void;
  onAddCustomer?: (customerData: Omit<Customer, 'id' | 'companyId' | 'totalSpent'>) => Customer | void;
  transportadores?: Transportador[];
  onAddTransportador?: (data: Omit<Transportador, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>) => Transportador | void;
  onUpdateOrder: (order: SaleOrder, options?: { waitForCloud?: boolean }) => void | Promise<void>;
  onDeleteOrder: (orderId: string) => void;
  onVerifyDeletionPassword?: (password: string) => boolean | Promise<boolean>;
  onFinalizeOrder: (orderId: string, payments: SalePayment[]) => void;
  onPaymentReceived?: (receipt: PaymentReceipt, updatedOrder: SaleOrder) => void;
  mode?: 'orders' | 'quotes';
}

export type PaymentStatusType = 'PAGO' | 'PARCIAL' | 'PENDENTE';

export const calculateOrderPayment = (order?: SaleOrder | null) => {
  if (!order || isFiscalOnlyOrder(order)) {
    return {
      totalPaid: 0,
      remainingDebt: 0,
      financialProgress: 0,
      paymentStatus: 'PENDENTE' as PaymentStatusType
    };
  }

  const orderTotal = Number(order.total) || 0;
  const totalPaid = orderReceiptsPaid(order);
  const remainingDebt = Math.max(0, orderTotal - totalPaid);
  const financialProgress = orderTotal > 0 ? Math.min(100, (totalPaid / orderTotal) * 100) : 0;

  let paymentStatus: PaymentStatusType = 'PENDENTE';
  if (orderTotal > 0 && totalPaid >= orderTotal - 0.01) {
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
  orders: rawOrders, 
  customers: rawCustomers, 
  inventory: rawInventory, 
  accounts: rawAccounts, 
  company,
  companyId,
  onAddOrder, 
  onAddCustomer,
  transportadores = [],
  onAddTransportador,
  onUpdateOrder,
  onDeleteOrder,
  onVerifyDeletionPassword,
  onFinalizeOrder,
  onPaymentReceived,
  mode = 'orders'
}) => {
  // Dados legados podem conter registros parciais ou nulos. Normalizar aqui evita
  // que um único cadastro inválido derrube toda a tela de vendas.
  const customers = useMemo<Customer[]>(() => {
    if (!Array.isArray(rawCustomers)) return [];
    return rawCustomers
      .filter((item): item is Customer => Boolean(item && typeof item === 'object' && item.id))
      .map(item => ({
        ...item,
        id: String(item.id),
        name: String(item.name || 'Cliente sem nome'),
        document: String(item.document || ''),
        email: String(item.email || ''),
        phone: String(item.phone || ''),
        totalSpent: Number(item.totalSpent) || 0
      }));
  }, [rawCustomers]);

  const inventory = useMemo<InventoryItem[]>(() => {
    if (!Array.isArray(rawInventory)) return [];
    return rawInventory.filter((item): item is InventoryItem => Boolean(item && typeof item === 'object' && item.id));
  }, [rawInventory]);

  const sellableProducts = useMemo(() => sellableInventoryItems(inventory), [inventory]);

  const accounts = useMemo<FinancialAccount[]>(() => {
    if (!Array.isArray(rawAccounts)) return [];
    return rawAccounts.filter((item): item is FinancialAccount => Boolean(item && typeof item === 'object' && item.id));
  }, [rawAccounts]);

  const orders = useMemo<SaleOrder[]>(() => {
    if (!Array.isArray(rawOrders)) return [];
    return rawOrders
      .filter((item): item is SaleOrder => Boolean(item && typeof item === 'object' && item.id))
      .filter((item) => !isFiscalOnlyOrder(item))
      .map(item => ({
        ...item,
        id: String(item.id),
        reference: String(item.reference || `PED-${String(item.id).slice(-6)}`),
        customerId: String(item.customerId || ''),
        sellerName: String(item.sellerName || ''),
        date: String(item.date || new Date().toISOString().split('T')[0]),
        subtotal: Number(item.subtotal) || 0,
        discount: Number(item.discount) || 0,
        shipping: Number(item.shipping) || 0,
        total: Number(item.total) || 0,
        status: item.status || OrderStatus.BUDGET,
        items: (Array.isArray(item.items) ? item.items : [])
          .filter(Boolean)
          .map((row, index) => ({
            ...row,
            productId: String(row.productId || `produto-${index + 1}`),
            productCode: String(row.productCode || ''),
            productName: String(row.productName || 'Produto sem nome'),
            unit: String(row.unit || 'TON'),
            quantity: Number(row.quantity) || 0,
            unitPrice: Number(row.unitPrice) || 0,
            discount: Number(row.discount) || 0,
            total: Number(row.total) || 0,
            productDescription: row.productDescription != null ? String(row.productDescription) : undefined
          })),
        productSheetTitle: item.productSheetTitle != null ? String(item.productSheetTitle) : undefined,
        productSheetBody: item.productSheetBody != null ? String(item.productSheetBody) : undefined,
        payments: Array.isArray(item.payments) ? item.payments.filter(Boolean) : [],
        receipts: Array.isArray(item.receipts) ? item.receipts.filter(Boolean) : [],
        withdrawals: Array.isArray(item.withdrawals) ? item.withdrawals.filter(Boolean) : []
      }));
  }, [rawOrders]);

  const isQuotesView = mode === 'quotes';
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'FINALIZED' | 'PAID' | 'PARTIAL' | 'PENDING' | 'BUDGET'>(
    isQuotesView ? 'BUDGET' : 'ALL'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDatePreset, setActiveDatePreset] = useState<DatePreset>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const applyDatePreset = (preset: 'ALL' | 'TODAY' | '7DAYS' | 'THIS_MONTH') => {
    setActiveDatePreset(preset);
    const range = getDatePresetRange(preset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    setActiveDatePreset('CUSTOM');
    if (type === 'start') setStartDate(value);
    if (type === 'end') setEndDate(value);
  };

  const handleResetDateFilter = () => {
    applyDatePreset('ALL');
  };

  const handleResetAllFilters = () => {
    setActiveFilter(isQuotesView ? 'BUDGET' : 'ALL');
    setSearchQuery('');
    applyDatePreset('ALL');
  };

  const hasActiveFilters = 
    (isQuotesView ? activeFilter !== 'BUDGET' : activeFilter !== 'ALL') ||
    Boolean(searchQuery.trim()) ||
    activeDatePreset !== 'ALL' ||
    Boolean(startDate) ||
    Boolean(endDate);

  const [isQuickCustomerModalOpen, setIsQuickCustomerModalOpen] = useState(false);
  
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
  const [draftToResume, setDraftToResume] = useState<SaleOrderLinkedNfe | undefined>(undefined);
  const [emitInitialStep, setEmitInitialStep] = useState<'edit' | 'preview'>('edit');
  const [emitAvulsa, setEmitAvulsa] = useState(false);
  const [devolutionChave, setDevolutionChave] = useState<string | undefined>(undefined);
  const [emitTransferencia, setEmitTransferencia] = useState(false);
  const [orderToViewDanfe, setOrderToViewDanfe] = useState<SaleOrder | null>(null);
  const [danfeLinkedNfeId, setDanfeLinkedNfeId] = useState<string | undefined>(undefined);
  const [showRecoverNfe, setShowRecoverNfe] = useState(false);
  const [duplicateDraft, setDuplicateDraft] = useState<NfeDuplicateDraft | null>(null);
  const [fiscalConfig, setFiscalConfig] = useState<FiscalConfig>(DEFAULT_FISCAL_CONFIG);

  const openEmitNfe = (
    order: SaleOrder,
    opts?: { avulsa?: boolean; transferencia?: boolean; devolution?: string; draft?: SaleOrderLinkedNfe; step?: 'edit' | 'preview' }
  ) => {
    const tipo = opts?.devolution ? 'devolucao' : opts?.transferencia ? 'transferencia' : opts?.avulsa ? 'avulsa' : 'pedido';
    const draft = opts?.draft || (!opts?.devolution ? findDraftNfe(order, tipo) : undefined);
    setEmitAvulsa(Boolean(opts?.avulsa));
    setEmitTransferencia(Boolean(opts?.transferencia));
    setDevolutionChave(opts?.devolution);
    setDraftToResume(draft);
    setEmitInitialStep(opts?.step || (draft ? 'preview' : 'edit'));
    setOrderToEmitNfe(order);
  };

  const closeEmitNfe = () => {
    setOrderToEmitNfe(null);
    setDevolutionChave(undefined);
    setEmitTransferencia(false);
    setEmitAvulsa(false);
    setDraftToResume(undefined);
    setEmitInitialStep('edit');
  };

  useEffect(() => {
    fiscalService.getConfig(companyId).then(cfg => setFiscalConfig(cfg));
  }, [companyId]);
  
  // Form State
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  const [lineItems, setLineItems] = useState<OrderLineDraft[]>(() => [newOrderLineDraft([])]);
  const [productSheetTitle, setProductSheetTitle] = useState(DEFAULT_PRODUCT_SHEET.title);
  const [productSheetBody, setProductSheetBody] = useState(DEFAULT_PRODUCT_SHEET.body);
  const [discount, setDiscount] = useState('0');
  const [shipping, setShipping] = useState('0');
  const [isBudget, setIsBudget] = useState(isQuotesView);
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

  const subtotalValue = useMemo(() => sumLineDrafts(lineItems), [lineItems]);

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
    const trimmedSearch = customerSearch.trim();
    if (!trimmedSearch) return customers;

    if (selectedCustomerId) {
      const selected = customers.find(c => c.id === selectedCustomerId);
      if (selected && String(selected.name || '').toLowerCase() === trimmedSearch.toLowerCase()) {
        return customers;
      }
    }

    const lowerSearchText = trimmedSearch.toLowerCase();
    const digitsOnlySearch = trimmedSearch.replace(/\D/g, '');

    return customers.filter(c => {
      const nameMatch = c.name ? c.name.toLowerCase().includes(lowerSearchText) : false;
      const emailMatch = c.email ? c.email.toLowerCase().includes(lowerSearchText) : false;
      const cityState = c.city ? `${c.city}/${c.state || ''}`.toLowerCase() : '';
      const cityMatch = cityState ? cityState.includes(lowerSearchText) : false;

      const docClean = c.document ? c.document.replace(/\D/g, '') : '';
      const phoneClean = c.phone ? c.phone.replace(/\D/g, '') : '';

      const docMatch = digitsOnlySearch ? docClean.includes(digitsOnlySearch) : (c.document ? c.document.toLowerCase().includes(lowerSearchText) : false);
      const phoneMatch = digitsOnlySearch ? phoneClean.includes(digitsOnlySearch) : (c.phone ? c.phone.toLowerCase().includes(lowerSearchText) : false);

      return nameMatch || emailMatch || cityMatch || docMatch || phoneMatch;
    });
  }, [customers, customerSearch, selectedCustomerId]);

  const selectedCustomer = useMemo(() => 
    customers.find(c => c.id === selectedCustomerId), 
  [customers, selectedCustomerId]);

  const updateLineItem = (lineId: string, patch: Partial<OrderLineDraft>) => {
    setLineItems(prev => prev.map(line => (line.lineId === lineId ? { ...line, ...patch } : line)));
  };

  const handleLineProductChange = (lineId: string, productId: string) => {
    const prod = resolveInventoryProduct(productId, sellableProducts, inventory);
    updateLineItem(lineId, {
      productId,
      productDescription: prod?.name || '',
      unitPrice: String(Number(prod?.unitPrice) || 0)
    });
  };

  const addLineItem = () => {
    setLineItems(prev => [...prev, newOrderLineDraft(sellableProducts)]);
  };

  const removeLineItem = (lineId: string) => {
    setLineItems(prev => (prev.length <= 1 ? prev : prev.filter(l => l.lineId !== lineId)));
  };

  const applyProductSheetFromLine = (lineId: string) => {
    const line = lineItems.find(l => l.lineId === lineId) || lineItems[0];
    if (!line) return;
    const prod = resolveInventoryProduct(line.productId, sellableProducts, inventory);
    const sheet = productSheetFromInventory(prod);
    setProductSheetTitle(sheet.title);
    setProductSheetBody(sheet.body);
  };

  const hasValidLineItems = useMemo(
    () =>
      lineItems.some(
        l => (parseFloat(l.quantity) || 0) > 0 && (parseFloat(l.unitPrice) || 0) > 0
      ),
    [lineItems]
  );

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
      setSelectedCustomerId(String(editingOrder.customerId || ''));
      const cust = customers.find(c => c.id === editingOrder.customerId);
      setCustomerSearch(cust?.name || '');
      const drafts = orderItemsToDrafts(editingOrder.items);
      setLineItems(drafts.length ? drafts : [newOrderLineDraft(sellableProducts)]);
      setProductSheetTitle(editingOrder.productSheetTitle?.trim() || DEFAULT_PRODUCT_SHEET.title);
      setProductSheetBody(editingOrder.productSheetBody?.trim() || DEFAULT_PRODUCT_SHEET.body);
      setDiscount(String(Number(editingOrder.discount) || 0));
      setShipping(String(Number(editingOrder.shipping) || 0));
      setIsBudget(editingOrder.status === OrderStatus.BUDGET);
      setNotes(String(editingOrder.notes || ''));
      setPayments(
        (Array.isArray(editingOrder.payments) ? editingOrder.payments : [])
          .filter((p): p is SalePayment => Boolean(p && typeof p === 'object' && p.id))
          .map(p => ({
            ...p,
            id: String(p.id),
            amount: Number(p.amount) || 0,
            paidAmount: Number(p.paidAmount) || 0,
            date: String(p.date || new Date().toISOString().split('T')[0]),
            accountId: String(p.accountId || accounts[0]?.id || ''),
            description: String(p.description || '')
          }))
      );
      setDownPayment('0');
      setIsModalOpen(true);
    } else {
      setPayments([]);
      setDownPayment('0');
    }
  }, [editingOrder, customers, accounts, sellableProducts]);

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

  const handleCreateOrUpdateOrder = (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault?.();
    if (!selectedCustomerId) {
      alert("Por favor, selecione um cliente da lista.");
      return;
    }

    if (!isBudget && Math.abs(remainingToProgram) > 0.01 && payments.length > 0) {
      alert(`O plano de parcelas deve totalizar ${formatBRL(balanceToSchedule)}. Saldo restante: ${formatBRL(remainingToProgram)}`);
      return;
    }

    const isInter = Boolean(selectedCustomer?.state && selectedCustomer.state !== 'PA');
    const builtItems = buildItemsFromDrafts(lineItems, sellableProducts, inventory, isInter);
    if (!builtItems.length) {
      alert('Informe ao menos um item com quantidade e preço unitário válidos.');
      return;
    }
    const itemsSubtotal = builtItems.reduce((s, it) => s + (Number(it.total) || 0), 0);

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
      subtotal: itemsSubtotal,
      discount: parseFloat(discount) || 0,
      shipping: parseFloat(shipping) || 0,
      total: itemsSubtotal - (parseFloat(discount) || 0) + (parseFloat(shipping) || 0),
      status: isBudget ? OrderStatus.BUDGET : OrderStatus.FINALIZED,
      isBarter: isBarter,
      barterCommodityType: isBarter ? barterCommodityType : undefined,
      cornTons: isBarter ? grainTonsEquivalent : undefined,
      cornPricePerTon: isBarter ? parseFloat(cornPricePerTon) : undefined,
      items: builtItems,
      productSheetTitle: productSheetTitle.trim() || DEFAULT_PRODUCT_SHEET.title,
      productSheetBody: productSheetBody.trim() || DEFAULT_PRODUCT_SHEET.body,
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
    onFinalizeOrder(order.id, order.payments || []);
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
    setDiscount('0');
    setShipping('0');
    setIsBudget(isQuotesView);
    setNotes('');
    setIsBarter(false);
    setBarterCommodityType('MILHO');
    setCornPricePerTon('1100');
    setDownPayment('0');
    setPayments([]);
    const defaultLine = newOrderLineDraft(sellableProducts, 'moido');
    setLineItems([defaultLine]);
    const defaultProd = resolveInventoryProduct(defaultLine.productId, sellableProducts, inventory);
    const sheet = productSheetFromInventory(defaultProd);
    setProductSheetTitle(sheet.title);
    setProductSheetBody(sheet.body);
  };

  const openNewOrder = () => {
    setEditingOrder(null);
    resetForm();
    setIsModalOpen(true);
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!selectedCustomerId) {
        alert("Por favor, selecione um cliente da lista antes de avançar.");
        return;
      }
      if (!hasValidLineItems) {
        alert('Adicione ao menos um item com quantidade e preço unitário válidos.');
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
    const existing = orderForWithdrawal.withdrawals || [];
    const exists = existing.some(w => w.id === withdrawal.id);
    const updatedWithdrawals = exists
      ? existing.map(w => w.id === withdrawal.id ? withdrawal : w)
      : [...existing, withdrawal];
    const updatedOrder = {
      ...orderForWithdrawal,
      withdrawals: updatedWithdrawals
    };
    setOrderForWithdrawal(updatedOrder);
    onUpdateOrder(updatedOrder);
  };

  // Métricas Globais de Vendas
  const totalVolumeTon = orders.reduce((acc, o) => acc + o.items.reduce((sum, it) => sum + (it.quantity || 0), 0), 0);
  const totalOrdersAmount = orders.filter(o => o.status === OrderStatus.FINALIZED).reduce((acc, o) => acc + o.total, 0);
  
  const totalPaidGlobal = orders.filter(o => o.status === OrderStatus.FINALIZED).reduce((acc, o) => {
    const receiptsTotal = (o.receipts || []).reduce((rSum, r) => rSum + (Number(r?.amount) || 0), 0);
    return acc + receiptsTotal;
  }, 0);

  const totalOutstandingGlobal = Math.max(0, totalOrdersAmount - totalPaidGlobal);

  // Contadores para abas de status de pagamento (respeitando o período selecionado se ativo)
  const { countPaid, countPartial, countPending, countBudget, totalInDateRange } = useMemo(() => {
    let paid = 0;
    let partial = 0;
    let pending = 0;
    let budget = 0;
    let inRange = 0;

    orders.forEach(o => {
      if (!isDateInRange(o.date, startDate, endDate)) return;
      inRange++;
      if (o.status === OrderStatus.BUDGET) {
        budget++;
      } else {
        const { paymentStatus } = calculateOrderPayment(o);
        if (paymentStatus === 'PAGO') paid++;
        else if (paymentStatus === 'PARCIAL') partial++;
        else pending++;
      }
    });

    return { countPaid: paid, countPartial: partial, countPending: pending, countBudget: budget, totalInDateRange: inRange };
  }, [orders, startDate, endDate]);

  // Filtragem dos Pedidos
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (!isDateInRange(o.date, startDate, endDate)) return false;

      const { paymentStatus } = calculateOrderPayment(o);

      if (activeFilter === 'FINALIZED' && o.status !== OrderStatus.FINALIZED) return false;
      if (activeFilter === 'PAID' && (o.status !== OrderStatus.FINALIZED || paymentStatus !== 'PAGO')) return false;
      if (activeFilter === 'PARTIAL' && (o.status !== OrderStatus.FINALIZED || paymentStatus !== 'PARCIAL')) return false;
      if (activeFilter === 'PENDING' && (o.status !== OrderStatus.FINALIZED || paymentStatus !== 'PENDENTE')) return false;
      if (activeFilter === 'BUDGET' && o.status !== OrderStatus.BUDGET) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const customer = customers.find(c => c.id === o.customerId);
        const name = String(customer?.name || '').toLowerCase();
        const doc = String(customer?.document || '').toLowerCase();
        const ref = String(o.reference || '').toLowerCase();
        const matchCust = name.includes(q) || doc.includes(q);
        const matchRef = ref.includes(q);
        const matchPaymentStatus = paymentStatus.toLowerCase().includes(q);
        return matchCust || matchRef || matchPaymentStatus;
      }
      return true;
    });
  }, [orders, startDate, endDate, activeFilter, searchQuery, customers]);

  const filteredVolumeTon = useMemo(() => 
    filteredOrders.reduce((acc, o) => acc + o.items.reduce((sum, it) => sum + (it.quantity || 0), 0), 0),
    [filteredOrders]
  );
  const filteredTotalAmount = useMemo(() =>
    filteredOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0),
    [filteredOrders]
  );

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      
      {/* Header Principal */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            {isQuotesView ? 'Orçamentos Comerciais' : 'Pedidos de Venda & Faturamento'}
          </h2>
          <p className="text-slate-500 text-sm font-medium">
            {isQuotesView
              ? 'Cotações em aberto, validade e conversão rápida em venda confirmada'
              : 'Gestão de contratos, entradas, parcelas, abatimentos e retiradas de carga'}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-3">
          {!isQuotesView && (
            <button
              onClick={() => setShowRecoverNfe(true)}
              className="bg-white hover:bg-slate-50 text-slate-700 px-4 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 border border-slate-200 text-sm"
            >
              <FileCheck size={18} /> Recuperar NF-e
            </button>
          )}
          <button 
            onClick={openNewOrder}
            className="bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 shadow-lg text-sm"
          >
            <Plus size={18} /> {isQuotesView ? 'Novo Orçamento' : 'Novo Pedido de Venda'}
          </button>
        </div>
      </header>

      {/* Cards de Métricas Comerciais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 print:hidden">
        <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-3 md:gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-black">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Faturado</p>
            <p className="text-base md:text-xl font-black text-slate-900">{formatBRL(totalOrdersAmount)}</p>
          </div>
        </div>

        <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-3 md:gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entradas / Abatimentos</p>
            <p className="text-base md:text-xl font-black text-emerald-600">{formatBRL(totalPaidGlobal)}</p>
          </div>
        </div>

        <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-3 md:gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-black">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo a Receber</p>
            <p className="text-base md:text-xl font-black text-rose-600">{formatBRL(totalOutstandingGlobal)}</p>
          </div>
        </div>

        <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-3 md:gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
            <Package size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Volume Comercializado</p>
            <p className="text-base md:text-xl font-black text-blue-700">{totalVolumeTon.toFixed(1)} TON</p>
          </div>
        </div>
      </div>

      {/* Barra de Filtros por Status de Pagamento, Data e Busca */}
      <div className="bg-white p-3 md:p-5 rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-sm space-y-3.5 print:hidden">
        
        {/* Linha Superior: Status e Busca */}
        <div className="flex flex-col xl:flex-row gap-3 md:gap-4 items-center justify-between">
          {/* Abas com badges de contagem */}
          <div className="flex flex-nowrap overflow-x-auto p-1.5 bg-slate-100/90 rounded-2xl w-full xl:w-auto gap-1 custom-scrollbar">
            <button
              onClick={() => setActiveFilter('ALL')}
              className={`shrink-0 px-3.5 py-2.5 min-h-11 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Todos <span className="px-1.5 py-0.2 rounded-md bg-slate-200 text-slate-700 text-[10px]">{totalInDateRange}</span>
            </button>

            <button
              onClick={() => setActiveFilter('PAID')}
              className={`shrink-0 px-3.5 py-2.5 min-h-11 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
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
              className={`shrink-0 px-3.5 py-2.5 min-h-11 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
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
              className={`shrink-0 px-3.5 py-2.5 min-h-11 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
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
              className={`shrink-0 px-3.5 py-2.5 min-h-11 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
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

          {/* Input de Busca com Botão Limpar */}
          <div className="relative flex-1 w-full xl:w-auto max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por cliente, CPF/CNPJ, ref ou status..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-10 py-3 min-h-11 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-sm focus:border-emerald-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                title="Limpar busca"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Linha Inferior: Filtro de Período e Resumo de Pedidos Filtrados */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <DateFilterControl
            activePreset={activeDatePreset}
            startDate={startDate}
            endDate={endDate}
            onSelectPreset={applyDatePreset}
            onCustomDateChange={handleCustomDateChange}
            onReset={handleResetDateFilter}
            colorTheme="emerald"
          />

          <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end text-xs">
            <span className="text-slate-500 font-bold">
              Exibindo <strong className="text-slate-800">{filteredOrders.length}</strong> de {orders.length} pedidos
              {filteredOrders.length > 0 && (
                <span className="hidden sm:inline text-slate-400 font-medium ml-1">
                  ({filteredVolumeTon.toFixed(1)} TON · {formatBRL(filteredTotalAmount)})
                </span>
              )}
            </span>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shrink-0"
              >
                <X size={13} /> Limpar Filtros
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Lista de Pedidos em Cards Modernos & Elegantes com Indicador Visual de Pagamento */}
      <div className="space-y-4 print:hidden">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm space-y-4 max-w-xl mx-auto my-8">
            <div className="w-16 h-16 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              {orders.length === 0 ? <ShoppingCart size={32} /> : <AlertTriangle size={32} className="text-amber-500" />}
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-800">
                {orders.length === 0 ? 'Nenhum pedido de venda registrado' : 'Nenhum pedido encontrado'}
              </h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                {orders.length === 0
                  ? 'Comece emitindo um novo pedido de venda ou orçamento comercial para faturamento e expedição de calcário.'
                  : 'Nenhum pedido corresponde aos filtros de data, status ou termo de busca selecionados.'}
              </p>
            </div>
            {orders.length === 0 ? (
              <button
                onClick={openNewOrder}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-purple-200"
              >
                <Plus size={16} /> {isQuotesView ? 'Emitir Primeiro Orçamento' : 'Emitir Primeiro Pedido'}
              </button>
            ) : (
              <button
                onClick={handleResetAllFilters}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black transition-all shadow-md"
              >
                <X size={15} /> Limpar Todos os Filtros
              </button>
            )}
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
                className="bg-white rounded-2xl md:rounded-3xl border border-slate-200/90 p-4 md:p-7 shadow-sm hover:shadow-md hover:border-slate-300 transition-all space-y-4 md:space-y-5"
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
                  <div className="hidden sm:flex items-center gap-2 flex-wrap">
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

                    {order.status === OrderStatus.FINALIZED && (() => {
                      const nfes = listOrderNfes(order);
                      const remainingQty = totalRemainingQuantity(order);
                      const drafts = listDraftNfes(order);
                      const pedidoNfe = nfes.find((n) => n.tipo === 'pedido') || (order.nfeStatus && order.nfeStatus !== 'nao_emitida' && nfes.length === 0 ? {
                        id: order.nfeId || order.id,
                        tipo: 'pedido' as const,
                        nfeStatus: order.nfeStatus,
                        nfeNumero: order.nfeNumero,
                        nfeChave: order.nfeChave,
                      } : undefined);
                      const avulsas = nfes.filter((n) => n.tipo === 'avulsa' && !isDraftNfe(n));
                      const pedidoIsDraft = Boolean(pedidoNfe && isDraftNfe(pedidoNfe as SaleOrderLinkedNfe));
                      const pedidoBlocksEmit = Boolean(
                        pedidoNfe &&
                        pedidoNfe.nfeStatus &&
                        pedidoNfe.nfeStatus !== 'nao_emitida' &&
                        pedidoNfe.nfeStatus !== 'cancelada' &&
                        pedidoNfe.nfeStatus !== 'rascunho'
                      );
                      return (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {drafts.map((draft) => (
                            <button
                              key={draft.id}
                              onClick={() => openEmitNfe(order, {
                                avulsa: draft.tipo === 'avulsa',
                                transferencia: draft.tipo === 'transferencia',
                                draft,
                                step: 'preview',
                              })}
                              className="text-[10px] font-black px-3 py-1.5 rounded-xl uppercase border flex items-center gap-1 bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100"
                              title="Revisar prévia e emitir a partir do rascunho"
                            >
                              <FileText size={12} /> Rascunho {draft.tipo === 'avulsa' ? 'avulsa' : draft.tipo === 'transferencia' ? 'transf.' : 'NF-e'}
                            </button>
                          ))}
                          {pedidoNfe && pedidoNfe.nfeStatus && pedidoNfe.nfeStatus !== 'nao_emitida' && !pedidoIsDraft && (
                            <>
                              <span className={`text-[10px] font-black px-3 py-1.5 rounded-xl uppercase border flex items-center gap-1 ${
                                pedidoNfe.nfeStatus === 'autorizada' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                pedidoNfe.nfeStatus === 'rejeitada' ? 'bg-rose-50 text-rose-800 border-rose-200' :
                                pedidoNfe.nfeStatus === 'cancelada' ? 'bg-slate-50 text-slate-700 border-slate-200' :
                                'bg-amber-50 text-amber-800 border-amber-200'
                              }`}>
                                <FileCheck size={12} /> {pedidoNfe.nfeStatus === 'autorizada' ? `NF-e Nº ${pedidoNfe.nfeNumero || ''}` : pedidoNfe.nfeStatus === 'rejeitada' ? 'NF-e rejeitada' : pedidoNfe.nfeStatus === 'cancelada' ? 'NF-e cancelada' : 'NF-e processando'}
                              </span>
                              <button
                                onClick={() => {
                                  setDanfeLinkedNfeId(pedidoNfe.id);
                                  setOrderToViewDanfe(order);
                                }}
                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black transition-all flex items-center gap-1"
                              >
                                <Eye size={12} /> DANFE
                              </button>
                              <button
                                onClick={() => {
                                  const linked = listOrderNfes(order).find((n) => n.id === pedidoNfe.id);
                                  setDuplicateDraft(buildNfeDuplicateDraft(order, linked));
                                }}
                                className="px-2.5 py-1.5 bg-white hover:bg-purple-50 text-purple-800 border border-purple-200 rounded-xl text-[10px] font-black transition-all flex items-center gap-1"
                                title="Emitir uma nota nova com os mesmos dados"
                              >
                                <Copy size={12} /> Duplicar
                              </button>
                              {pedidoNfe.nfeStatus === 'autorizada' && pedidoNfe.nfeChave && (
                                <button
                                  onClick={() => openEmitNfe(order, { devolution: pedidoNfe.nfeChave || '' })}
                                  className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-[10px] font-black transition-all flex items-center gap-1"
                                  title="Emitir NF-e de devolução"
                                >
                                  <Undo2 size={12} /> Devolver
                                </button>
                              )}
                              {pedidoNfe.nfeStatus === 'rejeitada' && (
                                <button
                                  onClick={() => openEmitNfe(order)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-[10px] font-black shadow-sm"
                                >
                                  <Send size={12} /> Reenviar
                                </button>
                              )}
                            </>
                          )}

                          {avulsas.map((nfe) => (
                            <button
                              key={nfe.id}
                              onClick={() => {
                                setDanfeLinkedNfeId(nfe.id);
                                setOrderToViewDanfe(order);
                              }}
                              className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black border flex items-center gap-1 ${
                                nfe.nfeStatus === 'autorizada'
                                  ? 'bg-purple-50 text-purple-800 border-purple-200'
                                  : nfe.nfeStatus === 'rejeitada'
                                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                              title={`NF-e avulsa ${nfe.nfeNumero || nfe.reference}`}
                            >
                              <Files size={12} /> Avulsa {nfe.nfeNumero ? `Nº ${nfe.nfeNumero}` : nfe.nfeStatus}
                            </button>
                          ))}

                          {remainingQty > 0 && (
                            <>
                              {!pedidoBlocksEmit && !drafts.some((d) => d.tipo === 'pedido') && (
                                <>
                                  <button
                                    onClick={() => openEmitNfe(order)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-[10px] font-black shadow-sm transition-all"
                                  >
                                    <Send size={12} /> Emitir NF-e
                                  </button>
                                  <button
                                    onClick={() => openEmitNfe(order, { transferencia: true })}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-xl text-[10px] font-black transition-all"
                                    title="NF-e de transferência de estoque (CFOP 5152/6152)"
                                  >
                                    <ArrowRightLeft size={12} /> Transferência
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => openEmitNfe(order, { avulsa: true })}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-purple-50 text-purple-800 border border-purple-300 rounded-xl text-[10px] font-black transition-all"
                                title="Emitir NF-e avulsa com quantidade parcial desta venda"
                              >
                                <Files size={12} /> NF avulsa
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Resumo de Produtos Faturados no Pedido */}
                <div className="flex flex-wrap items-center gap-2 py-1">
                  {order.items.map((item, idx) => {
                    const remainingMap = remainingQuantityByProduct(order);
                    const rem = remainingMap.get(saleItemKey(item));
                    return (
                    <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100/80 border border-slate-200/80 rounded-xl text-xs font-bold text-slate-700">
                      <Package size={13} className="text-slate-400" />
                      <span>{item.productName}:</span>
                      <span className="font-black text-slate-900">{item.quantity} {item.unit || 'Ton'}</span>
                      {order.status === OrderStatus.FINALIZED && rem != null && rem < item.quantity && (
                        <span className="text-[10px] font-black text-purple-700">saldo NF {rem.toLocaleString('pt-BR')} {item.unit || 'Ton'}</span>
                      )}
                      <span className="text-slate-400 font-mono text-[11px]">(@ {formatBRL(item.unitPrice)}/{item.unit || 'Ton'})</span>
                      <span className="text-purple-700 font-mono font-black">={formatBRL(item.total)}</span>
                    </span>
                    );
                  })}
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

                {order.status === OrderStatus.BUDGET ? (
                  <div className="bg-amber-50/70 p-5 rounded-3xl border border-amber-200 space-y-2">
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Proposta comercial</span>
                      <span className="text-xs font-black text-amber-900">Válido até {order.validUntil || 'não informado'}</span>
                    </div>
                    <p className="text-xs text-amber-900/80 font-medium">
                      Este orçamento não reserva estoque nem gera cobrança. Converta em venda somente após a aprovação do cliente.
                    </p>
                  </div>
                ) : (
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
                )}

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
                          className="px-3.5 py-2.5 min-h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5"
                          title="Registrar Entrada ou Abatimento e Emitir Recibo"
                        >
                          <DollarSign size={14} /> <span className="sm:hidden">Receber</span><span className="hidden sm:inline">Receber Entrada / Abatimento</span>
                        </button>

                        <button
                          onClick={() => setOrderForWithdrawal(order)}
                          className="px-3.5 py-2.5 min-h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5"
                          title="Registrar saída de caminhão e emitir ticket"
                        >
                          <Truck size={14} /> <span className="sm:hidden">Carga</span><span className="hidden sm:inline">Registrar Retirada (Caminhão)</span>
                        </button>
                      </>
                    )}

                    {(order.receipts && order.receipts.length > 0) || (order.nfes && order.nfes.length > 0) || (order.withdrawals && order.withdrawals.length > 0) || order.status === OrderStatus.FINALIZED ? (
                      <button
                        onClick={() => setSelectedOrderDetails(order)}
                        className="px-3.5 py-2.5 min-h-11 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <Receipt size={14} /> Histórico
                      </button>
                    ) : null}
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
        <ErrorBoundary label="novo pedido de venda">
        <FlowSheet
          zIndexClass="z-[100]"
          title={editingOrder ? `Editar ${editingOrder.reference}` : (isBudget ? 'Novo orçamento' : 'Novo pedido')}
          subtitle={`${company?.name || 'Empresa'} · ${currentStep}/3`}
          onClose={handleCloseModal}
          footer={(
            <div className="flex items-center gap-2">
              {currentStep === 1 ? (
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-3 py-3 text-xs font-bold text-slate-500 hover:text-slate-800 rounded-xl min-h-11"
                >
                  Fechar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="px-3 py-3 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl min-h-11"
                >
                  Voltar
                </button>
              )}
              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="flex-1 min-h-12 px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-sm font-bold shadow-sm"
                >
                  {currentStep === 1 ? 'Continuar' : 'Revisar pedido'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateOrUpdateOrder}
                  className={`flex-1 min-h-12 px-4 py-3 rounded-2xl text-sm font-bold text-white shadow-sm ${
                    isBudget ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-700 hover:bg-emerald-800'
                  }`}
                >
                  {editingOrder ? 'Salvar' : (isBudget ? 'Emitir orçamento' : 'Emitir pedido')}
                </button>
              )}
            </div>
          )}
        >
            <div className="mb-3">
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
                  <div className="min-w-0">
                    <p className="text-[10px] sm:text-xs font-bold leading-tight truncate">Cliente</p>
                    <p className="hidden sm:block text-[10px] text-slate-400 leading-none">Dados da carga</p>
                  </div>
                </button>

                {/* Etapa 2 */}
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCustomerId && hasValidLineItems) {
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
                  <div className="min-w-0">
                    <p className="text-[10px] sm:text-xs font-bold leading-tight truncate">Pagamento</p>
                    <p className="hidden sm:block text-[10px] text-slate-400 leading-none">Entrada & Prazos</p>
                  </div>
                </button>

                {/* Etapa 3 */}
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCustomerId && hasValidLineItems) {
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
                  <div className="min-w-0">
                    <p className="text-[10px] sm:text-xs font-bold leading-tight truncate">Revisar</p>
                    <p className="hidden sm:block text-[10px] text-slate-400 leading-none">Confirmação final</p>
                  </div>
                </button>

              </div>
            </div>

            {/* Conteúdo Dinâmico do Stepper */}
            <form onSubmit={handleCreateOrUpdateOrder} className="space-y-4">
              
              {/* ETAPA 1: CLIENTE & ITENS */}
              {currentStep === 1 && (
                <div className="space-y-5 animate-in fade-in duration-150">
                  
                  {/* Seletor de Tipo de Documento */}
                  <div className="flex items-center justify-between p-1 bg-slate-100 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setIsBudget(false)}
                      className={`flex-1 py-2.5 rounded-lg font-bold text-xs transition-all min-h-11 ${
                        !isBudget ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span className="sm:hidden">Venda</span>
                      <span className="hidden sm:inline">Venda Confirmada (Faturamento)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsBudget(true)}
                      className={`flex-1 py-2.5 rounded-lg font-bold text-xs transition-all min-h-11 ${
                        isBudget ? 'bg-white text-amber-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span className="sm:hidden">Orçamento</span>
                      <span className="hidden sm:inline">Orçamento Comercial (Cotação)</span>
                    </button>
                  </div>

                  {/* Seleção do Cliente com Busca */}
                  <div className="space-y-1.5 relative" ref={customerDropdownRef}>
                    <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><User size={13} /> Cliente Destinatário / Produtor *</span>
                      <div className="flex items-center gap-2">
                        {selectedCustomerId && (
                          <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                            <Check size={12} /> Cliente Selecionado
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setIsQuickCustomerModalOpen(true)}
                          className="text-[11px] text-purple-700 hover:text-purple-900 font-black flex items-center gap-1 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-lg border border-purple-200 transition-all active:scale-95"
                          title="Cadastrar novo cliente rapidamente com busca de endereço via CEP"
                        >
                          <UserPlus size={13} /> + Cadastrar Cliente Rápido
                        </button>
                      </div>
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
                      <div className="absolute z-[110] top-full left-0 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto custom-scrollbar">
                        {/* Botão de Destaque para Cadastro Rápido */}
                        <div className="p-2 border-b border-purple-100 bg-purple-50/70 sticky top-0 z-10">
                          <button
                            type="button"
                            onClick={() => {
                              setIsQuickCustomerModalOpen(true);
                              setIsCustomerDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold flex items-center justify-between transition-all shadow-sm"
                          >
                            <span className="flex items-center gap-2">
                              <UserPlus size={14} />
                              <span>Cadastrar {customerSearch ? <strong>"{customerSearch}"</strong> : 'Novo Cliente'} Rápido</span>
                            </span>
                            <span className="text-[10px] bg-purple-500 text-purple-100 px-2 py-0.5 rounded uppercase tracking-wider font-extrabold">ViaCEP</span>
                          </button>
                        </div>

                        {filteredCustomers.length === 0 ? (
                          <div className="p-4 text-center text-slate-500 text-xs">
                            Nenhum cliente cadastrado com esse termo. Clique acima para cadastrar em segundos!
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
                                <p className="text-[11px] text-slate-400">
                                  Doc: {c.document} {c.phone ? `• Tel: ${c.phone}` : ''} {c.city ? `• ${c.city}/${c.state}` : ''}
                                </p>
                              </div>
                              {selectedCustomerId === c.id && <Check size={14} className="text-emerald-600" />}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Itens do pedido (multi-produto) */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Package size={14} /> Itens do pedido ({lineItems.length})
                      </span>
                      <button
                        type="button"
                        onClick={addLineItem}
                        className="text-[11px] font-black text-purple-700 hover:text-purple-900 flex items-center gap-1 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-lg border border-purple-200"
                      >
                        <Plus size={14} /> Adicionar produto
                      </button>
                    </div>

                    <div className="space-y-3 max-h-[min(42vh,420px)] overflow-y-auto custom-scrollbar pr-1">
                      {lineItems.map((line, lineIndex) => {
                        const lineProd = resolveInventoryProduct(line.productId, sellableProducts, inventory);
                        const lineTotal = lineDraftSubtotal(line);
                        return (
                          <div
                            key={line.lineId}
                            className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 shadow-sm"
                          >
                            <div className="flex justify-between items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                Item {String(lineIndex + 1).padStart(2, '0')}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-emerald-700">{formatBRL(lineTotal)}</span>
                                {lineItems.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeLineItem(line.lineId)}
                                    className="p-1 text-slate-400 hover:text-rose-600"
                                    title="Remover item"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-slate-500 block mb-1">Produto *</label>
                              <select
                                value={line.productId}
                                onChange={e => handleLineProductChange(line.lineId, e.target.value)}
                                className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none font-bold text-xs"
                              >
                                {sellableProducts.length === 0 ? (
                                  <option value="moido">Cadastre produtos no estoque</option>
                                ) : (
                                  sellableProducts.map(p => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} — {formatBRL(p.unitPrice)}/{p.unit || 'TON'}
                                    </option>
                                  ))
                                )}
                              </select>
                              {lineProd && (
                                <p className="text-[10px] text-slate-400 mt-1">
                                  Estoque: {Number(lineProd.quantity).toLocaleString('pt-BR')} {lineProd.unit || 'TON'}
                                </p>
                              )}
                            </div>

                            <details className="group/desc">
                              <summary className="text-[11px] font-bold text-slate-500 cursor-pointer list-none [&::-webkit-details-marker]:hidden py-1">
                                Descrição no PDF <span className="text-slate-400 font-medium group-open/desc:hidden">· opcional</span>
                              </summary>
                              <input
                                type="text"
                                value={line.productDescription}
                                onChange={e => updateLineItem(line.lineId, { productDescription: e.target.value })}
                                placeholder={lineProd?.name || 'Descrição na tabela impressa'}
                                className="mt-1 w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                              />
                            </details>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] font-bold text-slate-500 block mb-1">
                                  Qtd. ({lineProd?.unit || 'TON'})
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={line.quantity}
                                  onChange={e => updateLineItem(line.lineId, { quantity: e.target.value })}
                                  className="w-full p-2 bg-white border border-slate-300 rounded-lg font-bold text-sm"
                                  placeholder="0"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-slate-500 block mb-1">
                                  Preço / {lineProd?.unit || 'TON'}
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={line.unitPrice}
                                  onChange={e => updateLineItem(line.lineId, { unitPrice: e.target.value })}
                                  className="w-full p-2 bg-white border border-slate-300 rounded-lg font-bold text-sm"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <details className="p-3 bg-white border border-slate-200 rounded-xl">
                      <summary className="text-[11px] font-bold text-slate-700 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                        Ficha técnica do PDF · opcional
                      </summary>
                      <div className="pt-3 space-y-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">Título</label>
                        <input
                          type="text"
                          value={productSheetTitle}
                          onChange={e => setProductSheetTitle(e.target.value)}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">Especificações (uma linha por parágrafo)</label>
                        <textarea
                          value={productSheetBody}
                          onChange={e => setProductSheetBody(e.target.value)}
                          rows={3}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium resize-y"
                        />
                      </div>
                      {lineItems[0] && (
                        <button
                          type="button"
                          onClick={() => applyProductSheetFromLine(lineItems[0].lineId)}
                          className="text-[10px] font-bold text-purple-700 hover:text-purple-900"
                        >
                          Usar ficha padrão do 1º item
                        </button>
                      )}
                      </div>
                    </details>

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
                      <p className="font-bold">{lineItems.length} item(ns) • Subtotal {formatBRL(subtotalValue)}</p>
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
                            {payments.filter(p => p && p.id).map((p, idx) => (
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
                    <div className="space-y-2 pt-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Itens</span>
                      <ul className="space-y-1.5">
                        {lineItems.map((line, idx) => {
                          const prod = resolveInventoryProduct(line.productId, sellableProducts, inventory);
                          const qty = parseFloat(line.quantity) || 0;
                          if (qty <= 0) return null;
                          return (
                            <li key={line.lineId} className="flex justify-between gap-2 text-[11px] border-b border-slate-100 pb-1">
                              <span className="font-medium text-slate-800">
                                {String(idx + 1).padStart(2, '0')} — {line.productDescription || prod?.name || 'Produto'}{' '}
                                <span className="text-slate-500">
                                  ({qty} {prod?.unit || 'TON'} × {formatBRL(parseFloat(line.unitPrice) || 0)})
                                </span>
                              </span>
                              <span className="font-bold shrink-0">{formatBRL(lineDraftSubtotal(line))}</span>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold">SUBTOTAL</span>
                          <p className="font-bold text-slate-900">{formatBRL(subtotalValue)}</p>
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
        </FlowSheet>
        </ErrorBoundary>
      )}

      {/* Modal de Histórico de Recibos & Retiradas do Pedido */}
      {selectedOrderDetails && (() => {
        const { totalPaid, remainingDebt, paymentStatus } = calculateOrderPayment(selectedOrderDetails);
        const modalCustomer = customers.find(c => c.id === selectedOrderDetails.customerId);

        return (
          <FlowSheet
            title="Extrato do pedido"
            zIndexClass="z-[110]"
            onClose={() => setSelectedOrderDetails(null)}
            subtitle={
              <span>
                {selectedOrderDetails.reference} · {modalCustomer?.name} · {formatBRL(selectedOrderDetails.total)}
                {selectedOrderDetails.status === OrderStatus.BUDGET
                  ? ' · Orçamento'
                  : paymentStatus === 'PAGO'
                    ? ' · Quitado'
                    : ` · Débito ${formatBRL(remainingDebt)}`}
              </span>
            }
            footer={
              <button
                type="button"
                onClick={() => setSelectedOrderDetails(null)}
                className="w-full min-h-11 bg-slate-900 text-white font-bold text-xs rounded-xl"
              >
                Fechar
              </button>
            }
          >
            <div className="space-y-5">

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
                    <div key={r.id} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
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

            {/* Notas fiscais da venda */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <FileCheck size={14} className="text-purple-600" /> Notas fiscais desta venda
              </h4>
              {listOrderNfes(selectedOrderDetails).length === 0 ? (
                <p className="text-xs text-slate-400 italic">Nenhuma NF-e emitida ainda. Use “NF avulsa” para faturar só parte do pedido.</p>
              ) : (
                <div className="space-y-2">
                  {listOrderNfes(selectedOrderDetails).map((nfe) => (
                    <div key={nfe.id} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-sm text-slate-800">
                            {nfe.nfeNumero ? `NF-e Nº ${nfe.nfeNumero}` : nfe.reference}
                          </span>
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                            nfe.tipo === 'avulsa' ? 'bg-purple-100 text-purple-800' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {nfe.tipo === 'avulsa' ? 'Avulsa / parcial' : nfe.tipo}
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-white border border-slate-200 text-slate-600 rounded-md">
                            {nfe.nfeStatus}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium pt-0.5">
                          {(nfe.items || []).map((it) => `${it.productName}: ${it.quantity} ${it.unit || ''}`).join(' · ') || 'Itens do pedido'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-black text-slate-800 text-sm">{formatBRL(nfe.total)}</span>
                        <button
                          onClick={() => {
                            setDanfeLinkedNfeId(nfe.id);
                            setOrderToViewDanfe(selectedOrderDetails);
                            setSelectedOrderDetails(null);
                          }}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl"
                        >
                          DANFE
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
                    <div key={w.id} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-800">{w.plateNumber}</span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md">
                            Ticket {w.weighTicketNumber}
                          </span>
                          {w.nfeNumero ? (
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
                              NF-e {w.nfeNumero}
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded-md">
                              Sem NF-e
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 pt-0.5">
                          <p className="text-xs text-slate-500 font-medium">
                            Motorista: {w.driverName} • {w.date}
                          </p>
                          {w.nfeDanfeUrl && (
                            <a
                              href={w.nfeDanfeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-0.5"
                            >
                              <FileText size={11} /> Abrir DANFE
                            </a>
                          )}
                        </div>
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

            </div>
          </FlowSheet>
      );
    })()}

      {!isModalOpen && !orderForPayment && !orderForWithdrawal && !selectedOrderDetails && !orderToEmitNfe && !orderToViewDanfe && !viewingReceipt && (
      <button
        type="button"
        onClick={openNewOrder}
        className="sm:hidden fixed right-4 bottom-[5.75rem] z-50 min-h-12 px-5 bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-xl inline-flex items-center gap-2"
      >
        <Plus size={18} /> {isQuotesView ? 'Novo orçamento' : 'Novo pedido'}
      </button>
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
          fiscalConfig={fiscalConfig}
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
        <ErrorBoundary label="emissão NF-e">
        <EmitirNfeModal
          order={{ ...orderToEmitNfe, companyId: orderToEmitNfe.companyId || companyId || company.id }}
          customer={resolveCustomerForOrder(customers, orderToEmitNfe.customerId)}
          config={fiscalConfig}
          company={company}
          transportadores={transportadores}
          onAddTransportador={onAddTransportador}
          devolutionChave={devolutionChave}
          transferencia={emitTransferencia}
          modo={emitAvulsa ? 'avulsa' : 'pedido'}
          draftNfe={draftToResume}
          initialStep={emitInitialStep}
          onClose={closeEmitNfe}
          onDraftSaved={(updatedOrder) => {
            onUpdateOrder(updatedOrder);
            setOrderToEmitNfe(updatedOrder);
            const draft = listDraftNfes(updatedOrder).find((n) =>
              draftToResume ? n.id === draftToResume.id : true
            ) || listDraftNfes(updatedOrder)[0];
            if (draft) setDraftToResume(draft);
          }}
          onSuccess={async (updatedOrder) => {
            try {
              await onUpdateOrder(updatedOrder, { waitForCloud: true });
              closeEmitNfe();
              const last = listOrderNfes(updatedOrder).filter((n) => !isDraftNfe(n)).slice(-1)[0]
                || listOrderNfes(updatedOrder).slice(-1)[0];
              if (last && !isDraftNfe(last)) {
                setDanfeLinkedNfeId(last.id);
                setOrderToViewDanfe(updatedOrder);
              }
            } catch (err) {
              window.alert('A NF-e foi transmitida, mas o banco ainda não confirmou. Não limpe o navegador e toque em Reenviar agora.');
            }
          }}
        />
        </ErrorBoundary>
      )}

      {/* Modal de Visualização e Impressão de DANFE */}
      {orderToViewDanfe && (
        <DanfeModal
          order={orderToViewDanfe}
          linkedNfeId={danfeLinkedNfeId}
          customer={resolveCustomerForOrder(customers, orderToViewDanfe.customerId)}
          config={fiscalConfig}
          company={company}
          onClose={() => {
            setOrderToViewDanfe(null);
            setDanfeLinkedNfeId(undefined);
          }}
          onDuplicate={() => {
            const linked = listOrderNfes(orderToViewDanfe).find((n) => n.id === danfeLinkedNfeId)
              || listOrderNfes(orderToViewDanfe).slice(-1)[0];
            setDuplicateDraft(buildNfeDuplicateDraft(orderToViewDanfe, linked));
            setOrderToViewDanfe(null);
            setDanfeLinkedNfeId(undefined);
          }}
          onOrderUpdated={(updatedOrder) => {
            onUpdateOrder(updatedOrder);
            setOrderToViewDanfe(updatedOrder);
          }}
        />
      )}

      {/* Confirmação de Exclusão com a senha do usuário atual */}
      {selectedOrderToDelete && (
        <DeletionPasswordModal
          isOpen={isDeleteModalOpen}
          title={selectedOrderToDelete.status === OrderStatus.FINALIZED ? 'Excluir Venda' : 'Excluir Pedido / Orçamento'}
          description={selectedOrderToDelete.status === OrderStatus.FINALIZED
            ? `A venda REF: ${selectedOrderToDelete.reference} será excluída. Os recebimentos financeiros vinculados serão removidos e o estoque será devolvido.`
            : `O documento REF: ${selectedOrderToDelete.reference} será excluído. Digite sua senha de acesso para confirmar.`}
          itemDescription={`${selectedOrderToDelete.status === OrderStatus.FINALIZED ? 'Venda' : 'Documento'} REF: ${selectedOrderToDelete.reference}`}
          onConfirm={handleConfirmDeletion}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setSelectedOrderToDelete(null);
          }}
          onVerifyPassword={onVerifyDeletionPassword}
        />
      )}

      {/* Template e Modal de Impressão A4 Profissional e Elegante */}
      {printOrder && (
        <SalesOrderPdfModal
          order={printOrder}
          customer={resolveCustomerForOrder(customers, printOrder.customerId)}
          company={company}
          onClose={() => setPrintOrder(null)}
        />
      )}

      {/* Modal Cadastro Rápido de Cliente */}
      <QuickCustomerModal
        isOpen={isQuickCustomerModalOpen}
        onClose={() => setIsQuickCustomerModalOpen(false)}
        initialName={customerSearch}
        onAddCustomer={onAddCustomer}
        onSuccess={(newCustomer) => {
          setSelectedCustomerId(newCustomer.id);
          setCustomerSearch(newCustomer.name);
          setIsCustomerDropdownOpen(false);
        }}
      />

      {duplicateDraft && (
        <ErrorBoundary label="duplicar NF-e">
        <EmitirNfeAvulsaModal
          customers={customers}
          inventory={inventory}
          config={fiscalConfig}
          company={company}
          transportadores={transportadores}
          onAddTransportador={onAddTransportador}
          duplicateFrom={duplicateDraft}
          onClose={() => setDuplicateDraft(null)}
          onSuccess={(newOrder) => {
            const isDraft =
              newOrder.nfeStatus === 'rascunho' ||
              listDraftNfes(newOrder).length > 0;
            onUpdateOrder(newOrder);
            setDuplicateDraft(null);
            if (!isDraft) {
              const last = listOrderNfes(newOrder).filter((n) => !isDraftNfe(n)).slice(-1)[0]
                || listOrderNfes(newOrder).slice(-1)[0];
              if (last && !isDraftNfe(last)) {
                setDanfeLinkedNfeId(last.id);
                setOrderToViewDanfe(newOrder);
              }
            }
          }}
          onDraftSaved={(draftOrder) => {
            onUpdateOrder(draftOrder);
          }}
        />
        </ErrorBoundary>
      )}

      {showRecoverNfe && (
        <RecoverSaleNfeModal
          orders={orders}
          customers={customers}
          onClose={() => setShowRecoverNfe(false)}
          onRecovered={(updated) => onUpdateOrder(updated, { waitForCloud: true })}
        />
      )}

    </div>
  );
};

export default SalesOrders;
