import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Edit3,
  FileCheck,
  FileText,
  Filter,
  PackageCheck,
  PieChart,
  Plus,
  Printer,
  Scale,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  X
} from 'lucide-react';
import {
  Category,
  Company,
  CostCenter,
  Customer,
  FinancialAccount,
  InventoryItem,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderPriority,
  PurchaseOrderQuote,
  PurchaseOrderStatus,
  StoreItem,
  StoreItemCategory,
  Transaction,
  TransactionStatus,
  TransactionType,
  User,
  View
} from '../types';
import { OUTFLOW_CATEGORIES } from '../constants';
import { simulatePurchaseOrderBudgetImpact } from '../services/domain/costCenterBudget';
import { openPurchaseOrderPdfInBrowser } from '../services/domain/purchaseOrderPdf';
import { addDaysISO, splitAmountIntoInstallments } from '../services/domain/payablesReceivables';
import { newId, nextPurchaseOrderReference } from '../services/ids';
import { dateISOBR } from '../utils/dateFilterUtils';
import { useToast } from './ui/Toast';
import { useConfirm } from './ui/ConfirmDialog';

interface PurchaseOrdersProps {
  purchaseOrders: PurchaseOrder[];
  costCenters: CostCenter[];
  categories: Category[];
  customers: Customer[];
  storeItems: StoreItem[];
  inventory: InventoryItem[];
  transactions: Transaction[];
  accounts: FinancialAccount[];
  currentUser: User;
  company: Company;
  onSavePurchaseOrder: (po: PurchaseOrder) => void;
  onDeletePurchaseOrder: (id: string) => void;
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'companyId'>) => void;
  onUpsertStoreItem: (item: StoreItem) => void;
  onNavigate?: (view: View) => void;
}

const formatBRL = (val?: number) =>
  (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_META: Record<
  PurchaseOrderStatus,
  { label: string; badgeClass: string; step: number }
> = {
  RASCUNHO: {
    label: 'Rascunho / Solicitação',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    step: 1
  },
  EM_COTACAO: {
    label: 'Em Cotação',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    step: 2
  },
  AGUARDANDO_APROVACAO: {
    label: 'Aguardando Aprovação',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    step: 3
  },
  APROVADA: {
    label: 'Aprovada (Verba Comprometida)',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    step: 4
  },
  RECEBIDA: {
    label: 'Recebida & Faturada',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    step: 5
  },
  CANCELADA: {
    label: 'Cancelada',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    step: 0
  }
};

const PRIORITY_META: Record<PurchaseOrderPriority, { label: string; badgeClass: string }> = {
  NORMAL: { label: 'Normal', badgeClass: 'bg-slate-100 text-slate-600' },
  ALTA: { label: 'Alta', badgeClass: 'bg-amber-100 text-amber-800' },
  URGENTE: { label: 'Urgente', badgeClass: 'bg-rose-100 text-rose-700' }
};

export const PurchaseOrders: React.FC<PurchaseOrdersProps> = ({
  purchaseOrders,
  costCenters,
  categories,
  customers,
  storeItems,
  transactions,
  accounts,
  currentUser,
  company,
  onSavePurchaseOrder,
  onDeletePurchaseOrder,
  onAddTransaction,
  onUpsertStoreItem,
  onNavigate
}) => {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const todayStr = dateISOBR();
  const currentYearMonth = todayStr.slice(0, 7);

  // Filtros da Listagem
  const [statusTab, setStatusTab] = useState<'ALL' | PurchaseOrderStatus>('ALL');
  const [filterCostCenterId, setFilterCostCenterId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal de Criar / Editar OC
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPo, setEditingPo] = useState<PurchaseOrder | null>(null);
  const [formDate, setFormDate] = useState(todayStr);
  const [formExpectedDelivery, setFormExpectedDelivery] = useState(addDaysISO(todayStr, 7));
  const [formStatus, setFormStatus] = useState<PurchaseOrderStatus>('AGUARDANDO_APROVACAO');
  const [formPriority, setFormPriority] = useState<PurchaseOrderPriority>('NORMAL');
  const [formCostCenterId, setFormCostCenterId] = useState(costCenters[0]?.id || 'cc1');
  const [formCategory, setFormCategory] = useState(OUTFLOW_CATEGORIES[0]);
  const [formRequester, setFormRequester] = useState(currentUser.name);
  const [formSupplierName, setFormSupplierName] = useState('');
  const [formSupplierDoc, setFormSupplierDoc] = useState('');
  const [formSupplierContact, setFormSupplierContact] = useState('');
  const [formPaymentMethod, setFormPaymentMethod] = useState('Boleto Bancário');
  const [formInstallmentsCount, setFormInstallmentsCount] = useState(1);
  const [formFirstDueDate, setFormFirstDueDate] = useState(addDaysISO(todayStr, 28));
  const [formDiscount, setFormDiscount] = useState(0);
  const [formShipping, setFormShipping] = useState(0);
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<PurchaseOrderItem[]>([
    {
      id: newId('poi'),
      description: '',
      category: 'Peças',
      quantity: 1,
      unit: 'UN',
      unitPrice: 0,
      total: 0
    }
  ]);
  const [formQuotes, setFormQuotes] = useState<PurchaseOrderQuote[]>([]);

  // Modal de Recebimento / Faturamento da OC
  const [receivingPo, setReceivingPo] = useState<PurchaseOrder | null>(null);
  const [receiveNfeNumber, setReceiveNfeNumber] = useState('');
  const [receiveInstallments, setReceiveInstallments] = useState(1);
  const [receiveFirstDueDate, setReceiveFirstDueDate] = useState(addDaysISO(todayStr, 28));
  const [receiveAccountId, setReceiveAccountId] = useState(accounts[0]?.id || 'acc-1');
  const [receiveGeneratePayable, setReceiveGeneratePayable] = useState(true);
  const [receiveIntegrateStock, setReceiveIntegrateStock] = useState(true);

  const outflowCategoryNames = useMemo(() => {
    const fromState = categories.filter((c) => c.type === 'OUTFLOW').map((c) => c.name);
    return Array.from(new Set([...fromState, ...OUTFLOW_CATEGORIES]));
  }, [categories]);

  // KPIs de Topo
  const kpis = useMemo(() => {
    let openQuotesTotal = 0;
    let awaitingApprovalCount = 0;
    let awaitingApprovalTotal = 0;
    let committedApprovedTotal = 0;
    let receivedMonthTotal = 0;

    for (const po of purchaseOrders) {
      const val = Number(po.total) || 0;
      if (po.status === 'RASCUNHO' || po.status === 'EM_COTACAO') {
        openQuotesTotal += val;
      } else if (po.status === 'AGUARDANDO_APROVACAO') {
        awaitingApprovalCount += 1;
        awaitingApprovalTotal += val;
      } else if (po.status === 'APROVADA') {
        committedApprovedTotal += val;
      } else if (po.status === 'RECEBIDA' && (po.receivedAt || po.date).slice(0, 7) === currentYearMonth) {
        receivedMonthTotal += val;
      }
    }

    return {
      openQuotesTotal,
      awaitingApprovalCount,
      awaitingApprovalTotal,
      committedApprovedTotal,
      receivedMonthTotal
    };
  }, [purchaseOrders, currentYearMonth]);

  const filteredOrders = useMemo(() => {
    return purchaseOrders
      .filter((po) => {
        if (statusTab !== 'ALL' && po.status !== statusTab) return false;
        if (filterCostCenterId !== 'ALL' && po.costCenterId !== filterCostCenterId) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchRef = po.reference.toLowerCase().includes(q);
          const matchSup = (po.supplierName || '').toLowerCase().includes(q);
          const matchReq = (po.requesterName || '').toLowerCase().includes(q);
          const matchItems = po.items.some((i) => i.description.toLowerCase().includes(q));
          return matchRef || matchSup || matchReq || matchItems;
        }
        return true;
      })
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [purchaseOrders, statusTab, filterCostCenterId, searchQuery]);

  // Cálculo de totais do formulário
  const formSubtotal = useMemo(
    () => formItems.reduce((acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0),
    [formItems]
  );
  const formTotal = Math.max(0, formSubtotal - (Number(formDiscount) || 0) + (Number(formShipping) || 0));

  // Simulação em tempo real do impacto da OC sobre a verba do Centro de Custo
  const budgetSimulation = useMemo(() => {
    const ym = (formFirstDueDate || formDate || todayStr).slice(0, 7);
    return simulatePurchaseOrderBudgetImpact({
      costCenterId: formCostCenterId,
      orderAmount: formTotal,
      editingOrderId: editingPo?.id,
      yearMonth: ym,
      costCenters,
      transactions,
      purchaseOrders
    });
  }, [
    formCostCenterId,
    formTotal,
    editingPo?.id,
    formFirstDueDate,
    formDate,
    todayStr,
    costCenters,
    transactions,
    purchaseOrders
  ]);

  const openCreateModal = () => {
    setEditingPo(null);
    setFormDate(todayStr);
    setFormExpectedDelivery(addDaysISO(todayStr, 7));
    setFormStatus('AGUARDANDO_APROVACAO');
    setFormPriority('NORMAL');
    setFormCostCenterId(costCenters[0]?.id || 'cc1');
    setFormCategory(outflowCategoryNames[0] || OUTFLOW_CATEGORIES[0]);
    setFormRequester(currentUser.name);
    setFormSupplierName('');
    setFormSupplierDoc('');
    setFormSupplierContact('');
    setFormPaymentMethod('Boleto Bancário');
    setFormInstallmentsCount(1);
    setFormFirstDueDate(addDaysISO(todayStr, 28));
    setFormDiscount(0);
    setFormShipping(0);
    setFormNotes('');
    setFormItems([
      {
        id: newId('poi'),
        description: '',
        category: 'Peças',
        quantity: 1,
        unit: 'UN',
        unitPrice: 0,
        total: 0
      }
    ]);
    setFormQuotes([]);
    setIsFormOpen(true);
  };

  const openEditModal = (po: PurchaseOrder) => {
    setEditingPo(po);
    setFormDate(po.date || todayStr);
    setFormExpectedDelivery(po.expectedDeliveryDate || addDaysISO(todayStr, 7));
    setFormStatus(po.status);
    setFormPriority(po.priority || 'NORMAL');
    setFormCostCenterId(po.costCenterId || costCenters[0]?.id || 'cc1');
    setFormCategory(po.category || outflowCategoryNames[0]);
    setFormRequester(po.requesterName || currentUser.name);
    setFormSupplierName(po.supplierName || '');
    setFormSupplierDoc(po.supplierDocument || '');
    setFormSupplierContact(po.supplierContact || '');
    setFormPaymentMethod(po.paymentMethod || 'Boleto Bancário');
    setFormInstallmentsCount(po.installmentsCount || 1);
    setFormFirstDueDate(po.firstDueDate || addDaysISO(todayStr, 28));
    setFormDiscount(po.discount || 0);
    setFormShipping(po.shipping || 0);
    setFormNotes(po.notes || '');
    setFormItems(
      po.items.length > 0
        ? po.items.map((i) => ({ ...i }))
        : [
            {
              id: newId('poi'),
              description: '',
              category: 'Peças',
              quantity: 1,
              unit: 'UN',
              unitPrice: 0,
              total: 0
            }
          ]
    );
    setFormQuotes(po.quotes ? po.quotes.map((q) => ({ ...q })) : []);
    setIsFormOpen(true);
  };

  const handleUpdateItem = (index: number, patch: Partial<PurchaseOrderItem>) => {
    setFormItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const next = { ...item, ...patch };
        next.total = (Number(next.quantity) || 0) * (Number(next.unitPrice) || 0);
        return next;
      })
    );
  };

  const handleSelectStoreItem = (index: number, storeItemId: string) => {
    const found = storeItems.find((s) => s.id === storeItemId);
    if (!found) {
      handleUpdateItem(index, { storeItemId: undefined });
      return;
    }
    handleUpdateItem(index, {
      storeItemId: found.id,
      description: found.name,
      category: found.category,
      unit: found.unit || 'UN',
      unitPrice: found.unitCost || 0
    });
  };

  const handleAddQuote = () => {
    setFormQuotes((prev) => [
      ...prev,
      {
        id: newId('q'),
        supplierName: '',
        supplierDocument: '',
        totalAmount: formTotal,
        deliveryDays: 7,
        paymentTerms: '28 dias',
        isSelected: prev.length === 0
      }
    ]);
  };

  const handleSelectWinningQuote = (quoteId: string) => {
    setFormQuotes((prev) =>
      prev.map((q) => {
        const selected = q.id === quoteId;
        if (selected && q.supplierName) {
          setFormSupplierName(q.supplierName);
          if (q.supplierDocument) setFormSupplierDoc(q.supplierDocument);
        }
        return { ...q, isSelected: selected };
      })
    );
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = formItems.filter((i) => i.description.trim() !== '');
    if (validItems.length === 0) {
      toast.push('Adicione pelo menos 1 item válido na Ordem de Compra.', 'danger');
      return;
    }

    const cc = costCenters.find((c) => c.id === formCostCenterId);
    const isNowApproved = formStatus === 'APROVADA' && editingPo?.status !== 'APROVADA';

    const payload: PurchaseOrder = {
      id: editingPo?.id || newId('po'),
      reference: editingPo?.reference || nextPurchaseOrderReference(purchaseOrders),
      date: formDate,
      expectedDeliveryDate: formExpectedDelivery || undefined,
      status: formStatus,
      priority: formPriority,
      costCenterId: formCostCenterId,
      costCenterName: cc?.name || 'Geral',
      category: formCategory,
      requesterName: formRequester.trim() || currentUser.name,
      supplierName: formSupplierName.trim() || 'Fornecedor em Cotação',
      supplierDocument: formSupplierDoc.trim() || undefined,
      supplierContact: formSupplierContact.trim() || undefined,
      items: validItems.map((i) => ({
        ...i,
        total: (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0)
      })),
      quotes: formQuotes,
      subtotal: formSubtotal,
      discount: Number(formDiscount) || 0,
      shipping: Number(formShipping) || 0,
      total: formTotal,
      paymentMethod: formPaymentMethod,
      installmentsCount: Math.max(1, Number(formInstallmentsCount) || 1),
      firstDueDate: formFirstDueDate || undefined,
      notes: formNotes.trim() || undefined,
      approvedBy: isNowApproved ? currentUser.name : editingPo?.approvedBy,
      approvedAt: isNowApproved ? new Date().toISOString() : editingPo?.approvedAt,
      receivedBy: editingPo?.receivedBy,
      receivedAt: editingPo?.receivedAt,
      generatedTransactionIds: editingPo?.generatedTransactionIds,
      stockIntegrated: editingPo?.stockIntegrated
    };

    onSavePurchaseOrder(payload);
    setIsFormOpen(false);
    toast.push(
      editingPo
        ? `Ordem de Compra ${payload.reference} atualizada!`
        : `Ordem de Compra ${payload.reference} criada com sucesso!`,
      'success'
    );
  };

  const handleQuickApprove = async (po: PurchaseOrder) => {
    const sim = simulatePurchaseOrderBudgetImpact({
      costCenterId: po.costCenterId,
      orderAmount: po.total,
      editingOrderId: po.id,
      yearMonth: (po.firstDueDate || po.date || todayStr).slice(0, 7),
      costCenters,
      transactions,
      purchaseOrders
    });

    if (sim.projectedStatus === 'ESTOURO') {
      const ok = await confirmDialog({
        title: 'Atenção: Estouro de Verba do Centro de Custo',
        description: `Aprovar a ${po.reference} (${formatBRL(po.total)}) fará o centro "${sim.costCenterName}" atingir ${sim.projectedPercent.toFixed(1)}% da verba mensal, excedendo o teto em ${formatBRL(sim.projectedOverrun)}. Deseja aprovar mesmo assim?`,
        confirmLabel: 'Aprovar com Excedente',
        danger: true
      });
      if (!ok) return;
    }

    const updated: PurchaseOrder = {
      ...po,
      status: 'APROVADA',
      approvedBy: currentUser.name,
      approvedAt: new Date().toISOString()
    };
    onSavePurchaseOrder(updated);
    toast.push(`OC ${po.reference} aprovada! Valor comprometido na verba de ${po.costCenterName}.`, 'success');
  };

  const openReceiveModal = (po: PurchaseOrder) => {
    setReceivingPo(po);
    setReceiveNfeNumber(po.nfeNumber || '');
    setReceiveInstallments(po.installmentsCount || 1);
    setReceiveFirstDueDate(po.firstDueDate || addDaysISO(todayStr, 28));
    setReceiveAccountId(accounts[0]?.id || 'acc-1');
    setReceiveGeneratePayable(!po.generatedTransactionIds?.length);
    setReceiveIntegrateStock(!po.stockIntegrated);
  };

  const handleConfirmReceive = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingPo) return;

    const cc = costCenters.find((c) => c.id === receivingPo.costCenterId);

    // 1. Gerar parcelas no Contas a Pagar
    if (receiveGeneratePayable) {
      const count = Math.max(1, Number(receiveInstallments) || 1);
      const amounts = splitAmountIntoInstallments(receivingPo.total, count);

      amounts.forEach((amt, idx) => {
        const dueDate = addDaysISO(receiveFirstDueDate || todayStr, idx * 30);
        const installmentLabel = count > 1 ? ` (${idx + 1}/${count})` : '';
        onAddTransaction({
          accountId: receiveAccountId || accounts[0]?.id || 'acc-1',
          costCenterId: receivingPo.costCenterId,
          costCenter: cc?.name || receivingPo.costCenterName || 'Geral',
          date: todayStr,
          dueDate,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.PENDENTE,
          description: `OC ${receivingPo.reference}${receiveNfeNumber ? ` · NF ${receiveNfeNumber}` : ''} - ${receivingPo.supplierName}${installmentLabel}`,
          category: receivingPo.category || 'Outras Despesas Operacionais',
          amount: amt,
          paidAmount: 0,
          contactName: receivingPo.supplierName,
          supplierCnpj: receivingPo.supplierDocument,
          nfeNumero: receiveNfeNumber || undefined,
          documentNumber: receivingPo.reference,
          installmentNumber: idx + 1,
          installmentTotal: count,
          paymentMethod: receivingPo.paymentMethod || 'Boleto Bancário',
          purchaseOrderId: receivingPo.id,
          purchaseOrderReference: receivingPo.reference,
          notes: `Gerado automaticamente no recebimento da Ordem de Compra ${receivingPo.reference}.`
        });
      });
    }

    // 2. Dar entrada no Almoxarifado (store_items)
    if (receiveIntegrateStock) {
      receivingPo.items.forEach((item) => {
        const existing = item.storeItemId
          ? storeItems.find((s) => s.id === item.storeItemId)
          : storeItems.find(
              (s) => s.name.trim().toLowerCase() === item.description.trim().toLowerCase()
            );

        if (existing) {
          onUpsertStoreItem({
            ...existing,
            quantity: (Number(existing.quantity) || 0) + (Number(item.quantity) || 0),
            unitCost: item.unitPrice || existing.unitCost,
            lastNfNumber: receiveNfeNumber || existing.lastNfNumber
          });
        } else {
          onUpsertStoreItem({
            id: newId('si'),
            name: item.description,
            category: (item.category as StoreItemCategory) || 'Peças',
            quantity: Number(item.quantity) || 0,
            unit: item.unit || 'UN',
            minStock: 2,
            unitCost: item.unitPrice,
            lastNfNumber: receiveNfeNumber || undefined,
            status: 'ativo'
          });
        }
      });
    }

    const updatedPo: PurchaseOrder = {
      ...receivingPo,
      status: 'RECEBIDA',
      nfeNumber: receiveNfeNumber || receivingPo.nfeNumber,
      receivedBy: currentUser.name,
      receivedAt: new Date().toISOString(),
      generatedTransactionIds: receiveGeneratePayable
        ? ['generated-on-receive']
        : receivingPo.generatedTransactionIds,
      stockIntegrated: receiveIntegrateStock || receivingPo.stockIntegrated
    };

    onSavePurchaseOrder(updatedPo);
    setReceivingPo(null);
    toast.push(
      `OC ${receivingPo.reference} recebida! ${
        receiveGeneratePayable ? 'Contas a Pagar gerado. ' : ''
      }${receiveIntegrateStock ? 'Estoque atualizado.' : ''}`,
      'success'
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div>
          <span className="px-2.5 py-1 rounded-lg bg-[#E5EEE5] text-[#0F5948] text-[11px] font-extrabold uppercase tracking-wider">
            Suprimentos & Compras
          </span>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            Ordens de Compra (OC)
          </h2>
          <p className="text-slate-500 text-sm">
            Solicitações, mapa de cotações, aprovação vinculada à verba do Centro de Custo e recebimento integrado
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('cost_centers')}
              className="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold flex items-center gap-2 transition-colors"
            >
              <PieChart size={15} /> Verbas por C. Custo
            </button>
          )}
          <button
            type="button"
            onClick={openCreateModal}
            className="px-5 py-2.5 rounded-2xl bg-[#0F5948] hover:bg-[#163C35] text-white text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-emerald-900/10 transition-all"
          >
            <Plus size={16} /> Nova Ordem de Compra
          </button>
        </div>
      </div>

      {/* KPIs Rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-extrabold uppercase text-slate-500">
              Em Solicitação / Cotação
            </span>
            <Clock size={17} className="text-sky-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{formatBRL(kpis.openQuotesTotal)}</p>
          <p className="text-xs text-slate-500 mt-1">Ainda não comprometem verba</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-amber-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-extrabold uppercase text-amber-700">
              Aguardando Aprovação ({kpis.awaitingApprovalCount})
            </span>
            <AlertTriangle size={17} className="text-amber-600" />
          </div>
          <p className="text-2xl font-black text-amber-900">
            {formatBRL(kpis.awaitingApprovalTotal)}
          </p>
          <p className="text-xs text-amber-700/80 mt-1">Prontas para validação da gerência</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-indigo-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-extrabold uppercase text-indigo-700">
              OCs Aprovadas (Verba Comprometida)
            </span>
            <ShieldCheck size={17} className="text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-indigo-950">
            {formatBRL(kpis.committedApprovedTotal)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Aguardando chegada da mercadoria / NF</p>
        </div>

        <div className="bg-[#163C35] text-white p-5 rounded-3xl shadow-md">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-extrabold uppercase text-emerald-200">
              Recebidas & Faturadas no Mês
            </span>
            <PackageCheck size={17} className="text-emerald-300" />
          </div>
          <p className="text-2xl font-black text-white">{formatBRL(kpis.receivedMonthTotal)}</p>
          <p className="text-xs text-emerald-200/90 mt-1">Integradas ao Contas a Pagar</p>
        </div>
      </div>

      {/* Filtros e Abas de Status */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          {(
            [
              { id: 'ALL', label: 'Todas' },
              { id: 'RASCUNHO', label: 'Solicitações' },
              { id: 'EM_COTACAO', label: 'Em Cotação' },
              { id: 'AGUARDANDO_APROVACAO', label: 'Aguard. Aprovação' },
              { id: 'APROVADA', label: 'Aprovadas' },
              { id: 'RECEBIDA', label: 'Recebidas' }
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors ${
                statusTab === tab.id
                  ? 'bg-[#0F5948] text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-60">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar OC, fornecedor, item..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#0F5948]"
            />
          </div>

          <select
            value={filterCostCenterId}
            onChange={(e) => setFilterCostCenterId(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
          >
            <option value="ALL">Todos os Centros de Custo</option>
            {costCenters.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista de Ordens de Compra */}
      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80">
            <ShoppingCart size={36} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-black text-slate-700">
              Nenhuma Ordem de Compra encontrada para os filtros selecionados.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Clique em "Nova Ordem de Compra" para registrar uma requisição ou pedido ao fornecedor.
            </p>
          </div>
        ) : (
          filteredOrders.map((po) => {
            const st = STATUS_META[po.status] || STATUS_META.RASCUNHO;
            const pr = PRIORITY_META[po.priority || 'NORMAL'];
            const cc = costCenters.find((c) => c.id === po.costCenterId);

            return (
              <div
                key={po.id}
                className="bg-white rounded-3xl p-5 border border-slate-200/80 hover:border-slate-300 shadow-sm transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900">{po.reference}</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${st.badgeClass}`}
                    >
                      {st.label}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${pr.badgeClass}`}
                    >
                      Prioridade {pr.label}
                    </span>
                    <span
                      className="px-2.5 py-0.5 rounded-md text-[11px] font-bold text-white"
                      style={{ backgroundColor: cc?.color || '#0F5948' }}
                    >
                      {cc?.name || po.costCenterName || 'Centro de Custo'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
                    <span>
                      <strong className="text-slate-800">Fornecedor:</strong>{' '}
                      {po.supplierName || 'A definir'}
                    </span>
                    <span>
                      <strong className="text-slate-800">Solicitante:</strong> {po.requesterName}
                    </span>
                    <span>
                      <strong className="text-slate-800">Emissão:</strong>{' '}
                      {po.date.slice(0, 10).split('-').reverse().join('/')}
                    </span>
                    {po.expectedDeliveryDate && (
                      <span>
                        <strong className="text-slate-800">Prev. Entrega:</strong>{' '}
                        {po.expectedDeliveryDate.slice(0, 10).split('-').reverse().join('/')}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 truncate">
                    <strong className="text-slate-700">Itens ({po.items.length}):</strong>{' '}
                    {po.items.map((i) => `${i.quantity} ${i.unit} ${i.description}`).join(' · ')}
                  </p>
                </div>

                {/* Valor e Botões de Ação */}
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between lg:justify-end gap-4 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                  <div className="text-left lg:text-right">
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                      Valor Total da OC
                    </span>
                    <span className="text-lg font-black text-slate-900">
                      {formatBRL(po.total)}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {po.paymentMethod || 'A combinar'} · {po.installmentsCount || 1}x
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {(po.status === 'RASCUNHO' ||
                      po.status === 'EM_COTACAO' ||
                      po.status === 'AGUARDANDO_APROVACAO') && (
                      <button
                        type="button"
                        onClick={() => handleQuickApprove(po)}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm"
                        title="Aprovar Ordem de Compra e comprometer verba"
                      >
                        <ShieldCheck size={14} /> Aprovar OC
                      </button>
                    )}

                    {po.status === 'APROVADA' && (
                      <button
                        type="button"
                        onClick={() => openReceiveModal(po)}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm"
                        title="Confirmar chegada da compra, gerar Contas a Pagar e atualizar Almoxarifado"
                      >
                        <PackageCheck size={14} /> Receber / Faturar
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openPurchaseOrderPdfInBrowser(po, company)}
                      className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                      title="Imprimir / Gerar PDF da Ordem de Compra"
                    >
                      <Printer size={15} />
                    </button>

                    <button
                      type="button"
                      onClick={() => openEditModal(po)}
                      className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                      title="Editar Ordem de Compra"
                    >
                      <Edit3 size={15} />
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirmDialog({
                          title: `Excluir ${po.reference}?`,
                          description:
                            'Esta ação removerá a Ordem de Compra. Lançamentos financeiros já gerados no Contas a Pagar não serão apagados.',
                          confirmLabel: 'Excluir OC',
                          danger: true
                        });
                        if (ok) onDeletePurchaseOrder(po.id);
                      }}
                      className="p-2.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                      title="Excluir Ordem de Compra"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Criar / Editar Ordem de Compra */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 md:p-8 shadow-2xl border border-slate-200 my-8 max-h-[92vh] overflow-y-auto custom-scrollbar space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  {editingPo
                    ? `Editar Ordem de Compra ${editingPo.reference}`
                    : 'Nova Ordem de Compra (OC)'}
                </h3>
                <p className="text-xs text-slate-500">
                  Preencha os itens, vincule ao Centro de Custo e confira o impacto na verba mensal
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-6">
              {/* Banner Inteligente de Simulação de Verba do Centro de Custo */}
              <div
                className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  budgetSimulation.projectedStatus === 'ESTOURO'
                    ? 'bg-rose-50/90 border-rose-200 text-rose-900'
                    : budgetSimulation.projectedStatus === 'ATENCAO'
                      ? 'bg-amber-50/90 border-amber-200 text-amber-900'
                      : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <PieChart size={16} />
                    <span className="text-xs font-black uppercase tracking-wider">
                      Impacto na Verba Mensal · {budgetSimulation.costCenterName}
                    </span>
                  </div>
                  <p className="text-xs">
                    Verba do Mês: <strong>{formatBRL(budgetSimulation.budget)}</strong> · Já Consumido:{' '}
                    <strong>
                      {formatBRL(budgetSimulation.currentConsumed)} (
                      {budgetSimulation.currentPercent.toFixed(0)}%)
                    </strong>{' '}
                    ➔ Com esta OC:{' '}
                    <strong>
                      {formatBRL(budgetSimulation.projectedConsumed)} (
                      {budgetSimulation.projectedPercent.toFixed(1)}%)
                    </strong>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {budgetSimulation.projectedStatus === 'ESTOURO' ? (
                    <span className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-extrabold inline-flex items-center gap-1.5">
                      <AlertTriangle size={14} /> Estoura em{' '}
                      {formatBRL(budgetSimulation.projectedOverrun)}
                    </span>
                  ) : (
                    <span className="px-3 py-1.5 rounded-xl bg-white/90 border border-emerald-300 text-emerald-800 text-xs font-extrabold inline-block">
                      Saldo Restante Após OC: {formatBRL(budgetSimulation.projectedRemaining)}
                    </span>
                  )}
                </div>
              </div>

              {/* Bloco 1: Classificação, Status e Datas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Centro de Custo *
                  </label>
                  <select
                    value={formCostCenterId}
                    onChange={(e) => setFormCostCenterId(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-[#0F5948]"
                  >
                    {costCenters.map((cc) => (
                      <option key={cc.id} value={cc.id}>
                        {cc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Categoria de Despesa *
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-[#0F5948]"
                  >
                    {outflowCategoryNames.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Estágio / Status da OC
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as PurchaseOrderStatus)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-[#0F5948]"
                  >
                    <option value="RASCUNHO">1. Rascunho / Solicitação</option>
                    <option value="EM_COTACAO">2. Em Cotação</option>
                    <option value="AGUARDANDO_APROVACAO">3. Aguardando Aprovação</option>
                    <option value="APROVADA">4. Aprovada (Comprometer Verba)</option>
                    <option value="CANCELADA">Cancelada</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Prioridade
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as PurchaseOrderPriority)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-[#0F5948]"
                  >
                    <option value="NORMAL">Normal</option>
                    <option value="ALTA">Alta</option>
                    <option value="URGENTE">Urgente (Parada de Máquina)</option>
                  </select>
                </div>
              </div>

              {/* Bloco 2: Fornecedor e Solicitante */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Fornecedor (Razão Social ou Nome Fantasia) *
                  </label>
                  <input
                    required
                    type="text"
                    list="po-suppliers-list"
                    value={formSupplierName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormSupplierName(val);
                      const matched = customers.find(
                        (c) => c.name.toLowerCase() === val.toLowerCase()
                      );
                      if (matched) {
                        setFormSupplierDoc(matched.document || '');
                        setFormSupplierContact(matched.phone || '');
                      }
                    }}
                    placeholder="Digite ou selecione um fornecedor..."
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-[#0F5948]"
                  />
                  <datalist id="po-suppliers-list">
                    {customers.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    CNPJ / CPF do Fornecedor
                  </label>
                  <input
                    type="text"
                    value={formSupplierDoc}
                    onChange={(e) => setFormSupplierDoc(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-[#0F5948]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Solicitante
                  </label>
                  <input
                    type="text"
                    value={formRequester}
                    onChange={(e) => setFormRequester(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-[#0F5948]"
                  />
                </div>
              </div>

              {/* Bloco 3: Itens da Ordem de Compra */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Itens da Ordem de Compra
                  </h4>
                  <button
                    type="button"
                    onClick={() =>
                      setFormItems((prev) => [
                        ...prev,
                        {
                          id: newId('poi'),
                          description: '',
                          category: 'Peças',
                          quantity: 1,
                          unit: 'UN',
                          unitPrice: 0,
                          total: 0
                        }
                      ])
                    }
                    className="px-3 py-1.5 rounded-xl bg-[#E5EEE5] text-[#0F5948] text-xs font-extrabold flex items-center gap-1 hover:bg-[#d5e5d5]"
                  >
                    <Plus size={14} /> Adicionar Item
                  </button>
                </div>

                <div className="space-y-2">
                  {formItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-3 rounded-2xl border border-slate-200/70"
                    >
                      <div className="col-span-12 md:col-span-3">
                        <label className="text-[10px] font-bold uppercase text-slate-400 block">
                          Vínculo Almoxarifado (Opcional)
                        </label>
                        <select
                          value={item.storeItemId || ''}
                          onChange={(e) => handleSelectStoreItem(idx, e.target.value)}
                          className="w-full p-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold"
                        >
                          <option value="">-- Item Livre / Novo --</option>
                          {storeItems.map((si) => (
                            <option key={si.id} value={si.id}>
                              {si.name} (Saldo: {si.quantity} {si.unit})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-12 md:col-span-4">
                        <label className="text-[10px] font-bold uppercase text-slate-400 block">
                          Descrição do Item / Peça / Serviço *
                        </label>
                        <input
                          required
                          type="text"
                          value={item.description}
                          onChange={(e) =>
                            handleUpdateItem(idx, { description: e.target.value })
                          }
                          placeholder="Ex: Correia em V Industrial B-75"
                          className="w-full p-2 rounded-lg bg-white border border-slate-200 text-xs font-bold"
                        />
                      </div>

                      <div className="col-span-4 md:col-span-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400 block">
                          Qtd
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={item.quantity}
                          onChange={(e) =>
                            handleUpdateItem(idx, { quantity: Number(e.target.value) })
                          }
                          className="w-full p-2 rounded-lg bg-white border border-slate-200 text-xs font-bold"
                        />
                      </div>

                      <div className="col-span-3 md:col-span-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400 block">
                          Unid.
                        </label>
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) =>
                            handleUpdateItem(idx, { unit: e.target.value.toUpperCase() })
                          }
                          className="w-full p-2 rounded-lg bg-white border border-slate-200 text-xs font-bold"
                        />
                      </div>

                      <div className="col-span-5 md:col-span-2">
                        <label className="text-[10px] font-bold uppercase text-slate-400 block">
                          Vl. Unitário (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unitPrice}
                          onChange={(e) =>
                            handleUpdateItem(idx, { unitPrice: Number(e.target.value) })
                          }
                          className="w-full p-2 rounded-lg bg-white border border-slate-200 text-xs font-bold"
                        />
                      </div>

                      <div className="col-span-12 md:col-span-1 flex items-end justify-between md:justify-end pt-2 md:pt-4">
                        <span className="text-xs font-black text-slate-700 md:hidden">
                          Subtotal: {formatBRL(item.total)}
                        </span>
                        {formItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setFormItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bloco 4: Mapa de Cotações (Opcional) */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/70 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                      Mapa Comparativo de Cotações ({formQuotes.length})
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Registre propostas concorrentes e marque a vencedora para auditoria de compras
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddQuote}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-extrabold text-slate-700 hover:bg-slate-100 flex items-center gap-1"
                  >
                    <Plus size={13} /> Adicionar Cotação
                  </button>
                </div>

                {formQuotes.length > 0 && (
                  <div className="space-y-2">
                    {formQuotes.map((q, qIdx) => (
                      <div
                        key={q.id}
                        className={`grid grid-cols-12 gap-2 items-center p-2.5 rounded-xl border ${
                          q.isSelected
                            ? 'bg-emerald-50/70 border-emerald-300'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="col-span-12 sm:col-span-4">
                          <input
                            type="text"
                            value={q.supplierName}
                            onChange={(e) =>
                              setFormQuotes((prev) =>
                                prev.map((row, i) =>
                                  i === qIdx ? { ...row, supplierName: e.target.value } : row
                                )
                              )
                            }
                            placeholder="Nome do Fornecedor Cotado"
                            className="w-full p-2 rounded-lg bg-white border border-slate-200 text-xs font-bold"
                          />
                        </div>
                        <div className="col-span-6 sm:col-span-3">
                          <input
                            type="number"
                            step="0.01"
                            value={q.totalAmount}
                            onChange={(e) =>
                              setFormQuotes((prev) =>
                                prev.map((row, i) =>
                                  i === qIdx
                                    ? { ...row, totalAmount: Number(e.target.value) }
                                    : row
                                )
                              )
                            }
                            placeholder="Valor Total (R$)"
                            className="w-full p-2 rounded-lg bg-white border border-slate-200 text-xs font-bold"
                          />
                        </div>
                        <div className="col-span-6 sm:col-span-2">
                          <input
                            type="text"
                            value={q.paymentTerms || ''}
                            onChange={(e) =>
                              setFormQuotes((prev) =>
                                prev.map((row, i) =>
                                  i === qIdx ? { ...row, paymentTerms: e.target.value } : row
                                )
                              )
                            }
                            placeholder="Prazo (ex: 28dd)"
                            className="w-full p-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold"
                          />
                        </div>
                        <div className="col-span-12 sm:col-span-3 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleSelectWinningQuote(q.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold ${
                              q.isSelected
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {q.isSelected ? '✓ Vencedora' : 'Selecionar'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setFormQuotes((prev) => prev.filter((_, i) => i !== qIdx))
                            }
                            className="p-1.5 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bloco 5: Condições de Pagamento e Totais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Forma de Pagamento
                  </label>
                  <select
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
                  >
                    <option value="Boleto Bancário">Boleto Bancário</option>
                    <option value="PIX">PIX</option>
                    <option value="Transferência Bancária (TED)">Transferência (TED)</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Dinheiro Físico">Dinheiro Físico</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Nº de Parcelas
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={formInstallmentsCount}
                    onChange={(e) => setFormInstallmentsCount(Number(e.target.value))}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    1º Vencimento Previsto
                  </label>
                  <input
                    type="date"
                    value={formFirstDueDate}
                    onChange={(e) => setFormFirstDueDate(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Desconto (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formDiscount}
                    onChange={(e) => setFormDiscount(Number(e.target.value))}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Frete / Outros (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formShipping}
                    onChange={(e) => setFormShipping(Number(e.target.value))}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                  Observações / Aplicação na Usina ou Frota
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Ex: Peças destinadas à revisão preventiva da Pá Carregadeira CAT 938K..."
                  className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold outline-none focus:border-[#0F5948]"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
                <div>
                  <span className="text-xs font-bold text-slate-500">Total Líquido da OC: </span>
                  <span className="text-2xl font-black text-[#0F5948]">
                    {formatBRL(formTotal)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-extrabold text-slate-600"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-[#0F5948] hover:bg-[#163C35] text-white text-xs font-extrabold shadow-lg"
                  >
                    {editingPo ? 'Salvar Alterações' : 'Registrar Ordem de Compra'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Recebimento e Integração Financeira / Estoque */}
      {receivingPo && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-extrabold uppercase">
                  Recebimento de Mercadoria / NF
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-1">
                  Receber {receivingPo.reference}
                </h3>
                <p className="text-xs text-slate-500">
                  {receivingPo.supplierName} · Total: <strong>{formatBRL(receivingPo.total)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceivingPo(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmReceive} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Nº da Nota Fiscal (NF-e)
                  </label>
                  <input
                    type="text"
                    value={receiveNfeNumber}
                    onChange={(e) => setReceiveNfeNumber(e.target.value)}
                    placeholder="Ex: 14580"
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Conta / Caixa Prevista
                  </label>
                  <select
                    value={receiveAccountId}
                    onChange={(e) => setReceiveAccountId(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Parcelas a Gerar
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={receiveInstallments}
                    onChange={(e) => setReceiveInstallments(Number(e.target.value))}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    1º Vencimento
                  </label>
                  <input
                    type="date"
                    value={receiveFirstDueDate}
                    onChange={(e) => setReceiveFirstDueDate(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"
                  />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <label className="flex items-start gap-2.5 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={receiveGeneratePayable}
                    onChange={(e) => setReceiveGeneratePayable(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-[#0F5948]"
                  />
                  <span>
                    Gerar lançamento(s) no <strong>Contas a Pagar</strong> automaticamente
                    <span className="block text-[11px] text-slate-500 font-normal">
                      Transfere o valor de "Comprometido em OC" para "A Pagar" no Centro de Custo{' '}
                      {receivingPo.costCenterName}.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={receiveIntegrateStock}
                    onChange={(e) => setReceiveIntegrateStock(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-[#0F5948]"
                  />
                  <span>
                    Dar entrada automática das quantidades no <strong>Almoxarifado (Peças & Suprimentos)</strong>
                    <span className="block text-[11px] text-slate-500 font-normal">
                      Soma as quantidades dos {receivingPo.items.length} item(ns) no estoque.
                    </span>
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReceivingPo(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-extrabold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-md"
                >
                  <PackageCheck size={15} /> Confirmar Recebimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrders;
