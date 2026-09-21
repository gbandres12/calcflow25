import React, { useState, useRef, useMemo } from 'react';
import { Customer, InventoryItem, FiscalConfig, Company, User, SaleOrder, OrderStatus, TransactionStatus, NfeStatus, FreteInfo, Transportador, OrderWithdrawal } from '../types';
import { fiscalService, mergeNfeConsulta } from '../services/fiscalService';
import { NfeDuplicateDraft } from '../services/nfeDuplicate';
import { assembleAutoInfCpl } from '../services/nfeComplementares';
import { buildLinkedNfe, upsertLinkedNfe } from '../services/saleNfe';
import { newId } from '../services/ids';
import { db } from '../services/dataService';
import { FreteNfeSection } from './FreteNfeSection';
import { 
  X, Send, Plus, Trash2, FileText, CheckCircle2, AlertCircle, 
  Building, User as UserIcon, Truck, Sparkles, Search, ShoppingBag, 
  CreditCard, Info, HelpCircle, Copy, Save, Eye, RefreshCw, ArrowLeft, Loader2
} from 'lucide-react';
import { FlowSheet } from './ui/FlowSheet';
import { NfeDraftPdfPreview } from './NfeDraftPdfPreview';

interface EmitirNfeAvulsaModalProps {
  customers: Customer[];
  inventory: InventoryItem[];
  config: FiscalConfig;
  company: Company;
  currentUser?: User;
  orders?: SaleOrder[];
  onClose: () => void;
  onSuccess: (newOrder: SaleOrder, linkedOrderId?: string, withdrawal?: OrderWithdrawal) => void;
  onDraftSaved?: (draftOrder: SaleOrder) => void;
  transportadores?: Transportador[];
  onAddTransportador?: (data: Omit<Transportador, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>) => Transportador | void;
  duplicateFrom?: NfeDuplicateDraft | null;
}

interface AvulsaItem {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  ncm: string;
  cfop: string;
  cst: string;
  cClassTrib?: string;
  aliquotaIbs?: number;
  aliquotaCbs?: number;
  aliquotaIs?: number;
  informacoesComplementares?: string;
}

const getLocalDateStr = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const EmitirNfeAvulsaModal: React.FC<EmitirNfeAvulsaModalProps> = ({
  customers = [],
  inventory = [],
  config,
  company,
  currentUser,
  orders,
  onClose,
  onSuccess,
  onDraftSaved,
  transportadores = [],
  onAddTransportador,
  duplicateFrom
}) => {
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draftSavedMsg, setDraftSavedMsg] = useState<string | null>(null);
  const [step, setStep] = useState<'edit' | 'preview'>('edit');
  const [draftOrderId] = useState(() => `order_avulsa_${Date.now()}`);
  const isSubmittingRef = useRef(false);
  const avulsaReferenceRef = useRef(`NFA-${Math.floor(1000 + Math.random() * 9000)}`);
  const [draftLinkedId, setDraftLinkedId] = useState<string | null>(null);
  const seedCustomer = (Array.isArray(customers) ? customers : []).find((c) => c && c.id === duplicateFrom?.customerId);

  // Destinatário
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(duplicateFrom?.customerId || '');
  const [customerSearch, setCustomerSearch] = useState<string>(seedCustomer?.name || '');
  const [isNewCustomer, setIsNewCustomer] = useState(false);

  // Dados manuais se for novo cliente
  const [destName, setDestName] = useState(seedCustomer?.name || '');
  const [destDoc, setDestDoc] = useState(seedCustomer?.document || '');
  const [destIe, setDestIe] = useState(seedCustomer?.ie || '');
  const [destIsentoIe, setDestIsentoIe] = useState(Boolean(seedCustomer?.isentoIE));
  const [destStreet, setDestStreet] = useState(seedCustomer?.street || '');
  const [destNumber, setDestNumber] = useState(seedCustomer?.number || '');
  const [destNeighborhood, setDestNeighborhood] = useState(seedCustomer?.neighborhood || '');
  const [destCity, setDestCity] = useState(seedCustomer?.city || 'Santarém');
  const [destState, setDestState] = useState(seedCustomer?.state || 'PA');
  const [destZip, setDestZip] = useState(seedCustomer?.zipCode || '68000-000');
  const [destIbge, setDestIbge] = useState(seedCustomer?.ibgeCode || '1506807');
  const [destEmail, setDestEmail] = useState(seedCustomer?.email || '');

  // Parâmetros da NF-e
  const [naturezaOperacao, setNaturezaOperacao] = useState(
    duplicateFrom?.naturezaOperacao || config?.naturezaOperacaoPadrao || 'Venda de producao do estabelecimento'
  );
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'Boleto' | 'Dinheiro' | 'Transferência' | 'Sem Pagamento'>(
    duplicateFrom?.paymentMethod || 'PIX'
  );
  // Frete / transporte (modFrete SEFAZ): 9 sem frete · 0 CIF remetente · 1 FOB destinatário · 2/3/4
  const [frete, setFrete] = useState<FreteInfo>(duplicateFrom?.frete || { modalidade: 9, valor: 0 });
  const [infCplCustom, setInfCplCustom] = useState<string>(duplicateFrom?.infCpl || '');
  const [infCplTouched, setInfCplTouched] = useState(Boolean(duplicateFrom?.infCpl?.trim()));

  // Vínculo com Pedido de Venda e Dados do Carregamento
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [generateFinance, setGenerateFinance] = useState<boolean>(false);
  const [financeDueDate, setFinanceDueDate] = useState<string>(getLocalDateStr());
  const [placaCaminhao, setPlacaCaminhao] = useState<string>('');
  const [nomeMotorista, setNomeMotorista] = useState<string>('');
  const [ticketBalanca, setTicketBalanca] = useState<string>('');
  const [pedidoExterno, setPedidoExterno] = useState<string>('');

  // Itens da Nota
  const [items, setItems] = useState<AvulsaItem[]>(() => {
    if (duplicateFrom?.items?.length) {
      return duplicateFrom.items.map((it, idx) => ({
        id: `item-dup-${idx}`,
        productId: it.productId || 'custom',
        productCode: it.productCode || String(idx + 1).padStart(3, '0'),
        productName: it.productName || 'Item',
        unit: it.unit || 'TON',
        quantity: Number(it.quantity) || 0,
        unitPrice: Number(it.unitPrice) || 0,
        discount: Number(it.discount) || 0,
        total: Number(it.total) || 0,
        ncm: it.ncm || '2517.10.00',
        cfop: it.cfop || config?.cfopPadraoEstadual || '5101',
        cst: it.cst || config?.cstIcmsPadrao || '40',
        cClassTrib: it.cClassTrib,
        aliquotaIbs: it.aliquotaIbs,
        aliquotaCbs: it.aliquotaCbs,
        aliquotaIs: it.aliquotaIs,
        informacoesComplementares: it.informacoesComplementares
      }));
    }
    const firstProd = (inventory || [])[0];
    return [
    {
      id: `item-1`,
      productId: firstProd?.id || 'moido',
      productCode: firstProd?.code || '001',
      productName: firstProd?.name || 'Calcário Agrícola Moído (PRNT > 85%)',
      unit: firstProd?.unit || 'TON',
      quantity: 10,
      unitPrice: firstProd?.unitPrice || 180,
      discount: 0,
      total: (firstProd?.unitPrice || 180) * 10,
      ncm: firstProd?.ncm || '2517.10.00',
      cfop: firstProd?.cfop || config?.cfopPadraoEstadual || '5101',
      cst: firstProd?.cst || config?.cstIcmsPadrao || '40',
      cClassTrib: firstProd?.cClassTrib,
      aliquotaIbs: firstProd?.aliquotaIbs,
      aliquotaCbs: firstProd?.aliquotaCbs,
      aliquotaIs: firstProd?.aliquotaIs,
      informacoesComplementares: firstProd?.informacoesComplementares
    }
  ];
  });

  // Cliente selecionado ou montado
  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const activeCustomer: Customer = useMemo(() => {
    if (!isNewCustomer && selectedCustomerId) {
      const found = (Array.isArray(customers) ? customers : []).find(c => c && c.id === selectedCustomerId);
      if (found) return found;
    }
    return {
      id: selectedCustomerId || `cust_avulso_${Date.now()}`,
      name: destName || 'Cliente Avulso',
      document: destDoc,
      email: destEmail,
      phone: '',
      totalSpent: 0,
      ie: destIe,
      isentoIE: destIsentoIe,
      street: destStreet,
      number: destNumber || 'SN',
      neighborhood: destNeighborhood,
      city: destCity,
      state: destState,
      zipCode: destZip,
      ibgeCode: destIbge
    };
  }, [
    isNewCustomer, selectedCustomerId, customers, destName, destDoc, 
    destIe, destIsentoIe, destStreet, destNumber, destNeighborhood, 
    destCity, destState, destZip, destIbge, destEmail
  ]);

  // Pedidos ativos do cliente selecionado
  const customerOrders = useMemo(() => {
    if (!orders || !activeCustomer?.id) return [];
    return orders.filter(o => o.customerId === activeCustomer.id && o.status !== OrderStatus.CANCELLED);
  }, [orders, activeCustomer?.id]);

  // Seletor de clientes cadastrados (blindado contra cadastros com campos vazios)
  const filteredCustomers = useMemo(() => {
    const list = Array.isArray(customers) ? customers.filter(Boolean) : [];
    const rawSearch = (customerSearch || '').trim();
    if (!rawSearch) return list.slice(0, 60);
    const term = rawSearch.toLowerCase();
    const cleanDigits = rawSearch.replace(/\D/g, '');
    return list.filter(c => {
      const name = String(c.name || '').toLowerCase();
      const doc = String(c.document || '').replace(/\D/g, '');
      const city = String(c.city || '').toLowerCase();
      const docMatch = cleanDigits ? doc.includes(cleanDigits) : false;
      return name.includes(term) || docMatch || city.includes(term);
    }).slice(0, 60);
  }, [customers, customerSearch]);

  const selectCustomer = (c: Customer) => {
    if (!c) return;
    setSelectedCustomerId(c.id || '');
    setIsNewCustomer(false);
    setDestName(c.name || '');
    setDestDoc(c.document || '');
    setDestIe(c.ie || '');
    setDestIsentoIe(Boolean(c.isentoIE));
    setDestStreet(c.street || '');
    setDestNumber(c.number || '');
    setDestNeighborhood(c.neighborhood || '');
    setDestCity(c.city || 'Santarém');
    setDestState(c.state || 'PA');
    setDestZip(c.zipCode || '');
    setDestIbge(c.ibgeCode || '');
    setDestEmail(c.email || '');

    // Ajustar CFOPs dos itens caso mude para interestadual (sem quebrar com CFOP vazio)
    const isInter = Boolean(c.state) && c.state !== 'PA';
    const cfopInter = config?.cfopPadraoInterestadual || '6101';
    const cfopEstadual = config?.cfopPadraoEstadual || '5101';
    setItems(prev => prev.map(it => {
      const cfopAtual = String(it.cfop || '');
      return {
        ...it,
        cfop: isInter
          ? (cfopAtual.startsWith('5') ? '6' + cfopAtual.slice(1) : (cfopAtual.startsWith('6') ? cfopAtual : cfopInter))
          : (cfopAtual.startsWith('6') ? '5' + cfopAtual.slice(1) : (cfopAtual.startsWith('5') ? cfopAtual : cfopEstadual))
      };
    }));
  };

  // Manipulação de Itens
  const handleAddItem = () => {
    const list = Array.isArray(inventory) ? inventory : [];
    const isInter = Boolean(activeCustomer.state) && activeCustomer.state !== 'PA';
    const defaultCfop = isInter ? (config?.cfopPadraoInterestadual || '6101') : (config?.cfopPadraoEstadual || '5101');
    const firstProd = list[0];
    const newItem: AvulsaItem = {
      id: `item-${Date.now()}`,
      productId: firstProd?.id || 'custom',
      productCode: firstProd?.code || `00${items.length + 1}`,
      productName: firstProd?.name || 'Calcário Agrícola Granel',
      unit: firstProd?.unit || 'TON',
      quantity: 1,
      unitPrice: firstProd?.unitPrice || 180,
      discount: 0,
      total: firstProd?.unitPrice || 180,
      ncm: firstProd?.ncm || '2517.10.00',
      cfop: defaultCfop,
      cst: firstProd?.cst || config?.cstIcmsPadrao || '40',
      cClassTrib: firstProd?.cClassTrib,
      aliquotaIbs: firstProd?.aliquotaIbs,
      aliquotaCbs: firstProd?.aliquotaCbs,
      aliquotaIs: firstProd?.aliquotaIs,
      informacoesComplementares: firstProd?.informacoesComplementares
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (idx: number) => {
    if (items.length <= 1) {
      alert("A nota fiscal deve conter pelo menos 1 item.");
      return;
    }
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleUpdateItem = (idx: number, field: keyof AvulsaItem, value: any) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [field]: value };
      if (field === 'quantity' || field === 'unitPrice' || field === 'discount') {
        const q = field === 'quantity' ? parseFloat(value) || 0 : it.quantity;
        const p = field === 'unitPrice' ? parseFloat(value) || 0 : it.unitPrice;
        const d = field === 'discount' ? parseFloat(value) || 0 : it.discount;
        updated.total = Math.max(0, (q * p) - d);
      }
      if (field === 'productId') {
        const prod = (Array.isArray(inventory) ? inventory : []).find(p => p && p.id === value);
        if (prod) {
          const isInter = Boolean(activeCustomer.state) && activeCustomer.state !== 'PA';
          updated.productCode = prod.code || updated.productCode;
          updated.productName = prod.name || updated.productName;
          updated.unit = prod.unit || 'TON';
          updated.unitPrice = prod.unitPrice || updated.unitPrice;
          updated.ncm = prod.ncm || updated.ncm;
          updated.cfop = prod.cfop || (isInter ? (config?.cfopPadraoInterestadual || '6101') : (config?.cfopPadraoEstadual || '5101'));
          updated.cst = prod.cst || updated.cst;
          updated.cClassTrib = prod.cClassTrib;
          updated.aliquotaIbs = prod.aliquotaIbs;
          updated.aliquotaCbs = prod.aliquotaCbs;
          updated.aliquotaIs = prod.aliquotaIs;
          updated.informacoesComplementares = prod.informacoesComplementares;
          updated.total = (updated.quantity * updated.unitPrice) - updated.discount;
        }
      }
      return updated;
    }));
  };

  // Totais — frete soma no total apenas quando modalidade ≠ 9 (sem frete)
  const subtotal = useMemo(() => items.reduce((acc, it) => acc + it.total, 0), [items]);
  const freteModalidadeNum = Number(frete.modalidade ?? 9);
  const shippingVal = freteModalidadeNum === 9 ? 0 : (Math.max(0, Number(frete.valor) || 0));
  const total = subtotal + shippingVal;
  const totalQuantidade = useMemo(() => items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0), [items]);

  const autoInfCpl = useMemo(
    () => assembleAutoInfCpl(config?.observacoesFiscaisPadrao, items),
    [config?.observacoesFiscaisPadrao, items]
  );

  const resolvedInfCpl = infCplTouched ? infCplCustom : autoInfCpl;

  // Mock de Ordem de Venda correspondente para emitirNFe
  const syntheticOrder: SaleOrder = useMemo(() => ({
    id: draftOrderId,
    reference: avulsaReferenceRef.current,
    customerId: activeCustomer.id,
    sellerName: currentUser?.name || 'Emissão Fiscal Direta',
    date: getLocalDateStr(),
    isAvulsa: true,
    items: items.map(it => ({
      productId: it.productId,
      productCode: it.productCode,
      productName: it.productName,
      unit: it.unit,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discount: it.discount,
      total: it.total,
      ncm: it.ncm,
      cfop: it.cfop,
      cst: it.cst,
      cClassTrib: it.cClassTrib,
      aliquotaIbs: it.aliquotaIbs,
      aliquotaCbs: it.aliquotaCbs,
      aliquotaIs: it.aliquotaIs,
      informacoesComplementares: it.informacoesComplementares
    })),
    subtotal,
    discount: 0,
    shipping: shippingVal,
    total,
    frete: { ...frete, modalidade: freteModalidadeNum as FreteInfo['modalidade'], valor: shippingVal },
    status: OrderStatus.FINALIZED,
    withoutFinance: !generateFinance || Boolean(selectedOrderId),
    paymentMethod: paymentMethod === 'Sem Pagamento' || !generateFinance ? 'Outros' : paymentMethod,
    payments: generateFinance && !selectedOrderId ? [{
      id: `pay-${Date.now()}`,
      amount: total,
      date: financeDueDate || getLocalDateStr(),
      status: TransactionStatus.PENDENTE,
      accountId: 'acc-1',
      description: 'Contas a Receber - NF-e Avulsa'
    }] : [],
    receipts: [],
    nfeNaturezaOperacao: naturezaOperacao,
    nfeInfCpl: resolvedInfCpl
  }), [draftOrderId, activeCustomer, currentUser, items, subtotal, shippingVal, total, frete, freteModalidadeNum, paymentMethod, naturezaOperacao, resolvedInfCpl, generateFinance, financeDueDate, selectedOrderId]);

  const previewOrder: SaleOrder = useMemo(() => ({
    ...syntheticOrder,
    nfeStatus: 'rascunho',
    nfeNumero: String(config?.proxNumeroNFe || ''),
    nfeSerie: String(config?.serieNFe || '1'),
  }), [syntheticOrder, config?.proxNumeroNFe, config?.serieNFe]);

  const validation = fiscalService.validarDadosFiscais(syntheticOrder, activeCustomer);
  const formatBRL = (val: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const isPreview = step === 'preview';

  const buildDraftOrder = (): SaleOrder | null => {
    if (!items.length || items.every((it) => !(Number(it.quantity) > 0))) {
      setErrorMsg('Adicione ao menos um item com quantidade para salvar o rascunho.');
      return null;
    }
    const linkedId = draftLinkedId || newId('nfa');
    let payloadSent: any;
    try {
      payloadSent = fiscalService.montarPayloadNotaAs(syntheticOrder, activeCustomer, config);
    } catch {
      payloadSent = undefined;
    }
    const linked = buildLinkedNfe({
      id: linkedId,
      tipo: 'avulsa',
      reference: syntheticOrder.reference,
      order: syntheticOrder,
      items: syntheticOrder.items,
      subtotal,
      discount: 0,
      shipping: shippingVal,
      total,
      nfeStatus: 'rascunho',
      nfeNaturezaOperacao: naturezaOperacao,
      nfeInfCpl: resolvedInfCpl,
      nfePayload: payloadSent,
    });
    setDraftLinkedId(linkedId);
    return upsertLinkedNfe(
      {
        ...syntheticOrder,
        companyId: company.id,
        status: OrderStatus.BUDGET,
        nfeStatus: 'rascunho',
        nfeNaturezaOperacao: naturezaOperacao,
        nfeInfCpl: resolvedInfCpl,
        nfePayload: payloadSent,
      },
      linked
    );
  };

  const persistAvulsaDraft = async (draft: SaleOrder) => {
    await db.upsert('sales_orders', company.id, { ...draft, companyId: company.id });
  };

  const handleSalvarRascunho = async () => {
    if (savingDraft || loading) return;
    setSavingDraft(true);
    setErrorMsg(null);
    setDraftSavedMsg(null);
    try {
      const draft = buildDraftOrder();
      if (!draft) return;
      await persistAvulsaDraft(draft);
      if (onDraftSaved) onDraftSaved(draft);
      else onSuccess(draft);
      setDraftSavedMsg('Rascunho salvo. Revise a prévia e emita quando estiver pronto.');
      setTimeout(() => setDraftSavedMsg(null), 4000);
    } catch (e: any) {
      setErrorMsg(e.message || 'Não foi possível salvar o rascunho.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleIrParaPrevia = async () => {
    const draft = buildDraftOrder();
    if (!draft) return;
    try {
      await persistAvulsaDraft(draft);
    } catch (e: any) {
      setErrorMsg(e.message || 'Rascunho ficou na tela, mas o banco não confirmou o salvamento.');
    }
    if (onDraftSaved) onDraftSaved(draft);
    setStep('preview');
  };

  // Emissão Direta à SEFAZ
  const handleEmitirAvulsa = async () => {
    if (isSubmittingRef.current || loading) return;
    if (!validation.valid) {
      alert(`Corrija as pendências antes de emitir: \n- ${validation.errors.join('\n- ')}`);
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setErrorMsg(null);

    try {
      const semPgto = !generateFinance || Boolean(selectedOrderId);
      const opts = {
        semPagamento: semPgto,
        carregamento: {
          ticketPesagem: ticketBalanca.trim() || undefined,
          placa: placaCaminhao.trim() || undefined,
          motorista: nomeMotorista.trim() || undefined,
          pedidoExterno: pedidoExterno.trim() || undefined
        }
      };

      const payloadSent = fiscalService.montarPayloadNotaAs(syntheticOrder, activeCustomer, config, opts);
      const result = await fiscalService.emitirNFe(syntheticOrder, activeCustomer, config, company.id, opts);

      if (result.success || result.nfeId) {
        const linkedId = draftLinkedId || newId('nfa');
        let createdOrder: SaleOrder = {
          ...syntheticOrder,
          companyId: company.id,
          status: OrderStatus.FINALIZED,
          nfeStatus: result.nfeStatus,
          nfeId: result.nfeId,
          nfeChave: result.nfeChave,
          nfeNumero: result.nfeNumero,
          nfeSerie: result.nfeSerie,
          nfeProtocolo: result.nfeProtocolo,
          nfeDanfeUrl: result.nfeDanfeUrl,
          nfeXmlUrl: result.nfeXmlUrl,
          nfeEmissao: result.nfeEmissao,
          nfeErro: result.nfeErro,
          nfeNaturezaOperacao: result.naturezaOperacao,
          nfePayload: payloadSent,
          nfeRawResponse: result.rawResponse
        };

        if (result.nfeId) {
          const pollResult = await fiscalService.consultarEAtualizarStatusProcessamento(result.nfeId, config, 8, 2500);
          if (pollResult.status && pollResult.status !== 'nao_emitida') {
            createdOrder = mergeNfeConsulta(createdOrder, pollResult);
          }
        }

        const linked = buildLinkedNfe({
          id: linkedId,
          tipo: 'avulsa',
          reference: syntheticOrder.reference,
          order: createdOrder,
          items: createdOrder.items,
          subtotal,
          discount: 0,
          shipping: shippingVal,
          total,
          nfeStatus: (createdOrder.nfeStatus || 'processando') as NfeStatus,
          nfeId: createdOrder.nfeId,
          nfeChave: createdOrder.nfeChave,
          nfeNumero: createdOrder.nfeNumero,
          nfeSerie: createdOrder.nfeSerie,
          nfeProtocolo: createdOrder.nfeProtocolo,
          nfeDanfeUrl: createdOrder.nfeDanfeUrl,
          nfeXmlUrl: createdOrder.nfeXmlUrl,
          nfeEmissao: createdOrder.nfeEmissao,
          nfeErro: createdOrder.nfeErro,
          nfeNaturezaOperacao: createdOrder.nfeNaturezaOperacao,
          nfeInfCpl: resolvedInfCpl,
          nfePayload: payloadSent,
          nfeRawResponse: createdOrder.nfeRawResponse,
        });

        const orderWithLinked = upsertLinkedNfe(createdOrder, linked);

        let withdrawal: OrderWithdrawal | undefined;
        if (selectedOrderId && orders) {
          const linkedOrder = orders.find(o => o.id === selectedOrderId);
          if (linkedOrder) {
            const totalQty = (linkedOrder.items || []).reduce((sum, it) => sum + (it.quantity || 0), 0);
            const alreadyWithdrawn = (linkedOrder.withdrawals || []).reduce((sum, w) => sum + (w.quantityWithdrawn || 0), 0);
            const thisQty = items.reduce((sum, it) => sum + (it.quantity || 0), 0);
            const remaining = Math.max(0, totalQty - (alreadyWithdrawn + thisQty));

            withdrawal = {
              id: `RET-${Date.now()}`,
              orderId: linkedOrder.id,
              orderReference: linkedOrder.reference,
              date: getLocalDateStr(),
              driverName: nomeMotorista.trim() || 'Motorista',
              plateNumber: placaCaminhao.trim().toUpperCase() || 'PLACA',
              quantityWithdrawn: thisQty,
              productName: items[0]?.productName || 'Calcário Agrícola',
              weighTicketNumber: ticketBalanca.trim() || `PES-${Math.floor(100000 + Math.random() * 900000)}`,
              remainingBalanceQuantity: remaining,
              nfeStatus: (createdOrder.nfeStatus || 'processando') as NfeStatus,
              nfeId: createdOrder.nfeId,
              nfeChave: createdOrder.nfeChave,
              nfeNumero: createdOrder.nfeNumero,
              nfeSerie: createdOrder.nfeSerie,
              nfeProtocolo: createdOrder.nfeProtocolo,
              nfeDanfeUrl: createdOrder.nfeDanfeUrl,
              nfeXmlUrl: createdOrder.nfeXmlUrl,
              nfeEmissao: createdOrder.nfeEmissao
            };
          }
        }

        onSuccess(orderWithLinked, selectedOrderId || undefined, withdrawal);
      } else {
        setErrorMsg(result.nfeErro || 'Rejeição na emissão da NF-e.');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro inesperado na transmissão da nota fiscal.');
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <FlowSheet
      wide
      zIndexClass="z-[160]"
      title={isPreview
        ? 'Prévia do rascunho da NF-e avulsa'
        : duplicateFrom?.sourceNumero ? `Duplicar NF-e Nº ${duplicateFrom.sourceNumero}` : 'NF-e avulsa'}
      subtitle={duplicateFrom
        ? 'Cópia para emissão nova. Número, chave e protocolo da original não são reutilizados.'
        : `Nº ${config?.proxNumeroNFe || 1042} · série ${config?.serieNFe || 1} · ${config?.environment === 'production' ? 'Produção' : 'Homologação'}${isPreview ? ' · revise os dados antes de transmitir' : ''}`}
      onClose={onClose}
      footer={(
        <div className="flex items-center gap-2 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total</p>
            <p className="text-base font-black text-slate-900 leading-none">{formatBRL(total)}</p>
          </div>
          {isPreview ? (
            <>
              <button
                type="button"
                onClick={() => setStep('edit')}
                disabled={loading}
                className="min-h-12 px-4 py-3 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-2xl disabled:opacity-50 flex items-center gap-2"
              >
                <ArrowLeft size={16} /> Editar
              </button>
              <button
                disabled={loading || !validation.valid}
                onClick={handleEmitirAvulsa}
                className="min-h-12 px-4 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-2xl disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Enviando…
                  </>
                ) : (
                  <>
                    <Send size={16} /> Confirmar e emitir
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSalvarRascunho}
                disabled={loading || savingDraft || items.length === 0}
                className="min-h-12 px-4 py-3 bg-white border border-amber-300 text-amber-900 font-bold text-sm rounded-2xl disabled:opacity-50 flex items-center gap-2"
              >
                {savingDraft ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    <Save size={16} /> Salvar rascunho
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleIrParaPrevia}
                disabled={loading || savingDraft || items.length === 0}
                className="min-h-12 px-4 py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm rounded-2xl disabled:opacity-50 flex items-center gap-2"
              >
                <Eye size={16} /> Revisar prévia
              </button>
              <button
                disabled={loading || !validation.valid}
                onClick={handleEmitirAvulsa}
                className="min-h-12 px-4 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-2xl disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Enviando…
                  </>
                ) : (
                  <>
                    <Send size={16} /> Transmitir
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    >
        <div className="space-y-4">
          {duplicateFrom && (
            <div className="p-3.5 rounded-2xl border border-purple-200 bg-purple-50 text-purple-900 flex items-start gap-2.5">
              <Copy className="text-purple-600 mt-0.5 shrink-0" size={16} />
              <p className="text-xs font-medium leading-relaxed">
                Destinatário, itens, CFOP e frete vieram da NF-e {duplicateFrom.sourceNumero ? `Nº ${duplicateFrom.sourceNumero}` : 'original'}.
                Revise quantidades e transmita como nota nova.
              </p>
            </div>
          )}
          {draftSavedMsg && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 font-bold flex items-center gap-2">
              <Save size={14} className="text-amber-600 shrink-0" /> {draftSavedMsg}
            </div>
          )}
          {isPreview && (
            <div className="p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-950">
              <p className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <Eye size={14} /> Prévia em PDF do rascunho — revise antes de transmitir
              </p>
              <p className="text-xs font-medium mt-1">
                Destinatário: <b>{activeCustomer.name}</b> · {items.length} item(ns) · Total {formatBRL(total)}
              </p>
              <p className="text-[11px] text-emerald-800 mt-1">
                Este PDF é uma prévia interna (RASCUNHO / SEM VALOR FISCAL). O DANFE oficial só existe depois da autorização da SEFAZ.
              </p>
            </div>
          )}
          
          {/* Status de Validação SEFAZ */}
          <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
            validation.valid ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            {validation.valid ? (
              <CheckCircle2 className="text-emerald-600 mt-0.5 shrink-0" size={20} />
            ) : (
              <AlertCircle className="text-rose-600 mt-0.5 shrink-0" size={20} />
            )}
            <div className="text-xs space-y-1">
              <p className="font-black uppercase tracking-wider text-[10px]">
                {validation.valid ? 'Validação Cadastral Pronta para Envio SEFAZ' : 'Pendências Cadastrais Detectadas'}
              </p>
              {validation.valid ? (
                <p className="text-slate-600">
                  Os dados do destinatário, NCM, CFOP e alíquotas estão validados para transmissão imediata via API NotaAs.
                </p>
              ) : (
                <ul className="list-disc pl-4 space-y-0.5 text-rose-700">
                  {validation.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {isPreview && (
            <NfeDraftPdfPreview
              order={previewOrder}
              customer={activeCustomer}
              config={config}
              company={company}
            />
          )}

          {!isPreview && (
          <>
          {/* Seção 1: Destinatário */}
          <div className="space-y-4 p-3.5 sm:p-5 bg-slate-50 rounded-2xl sm:rounded-3xl border border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
              <span className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
                <UserIcon size={16} className="text-purple-600" /> 1. Destinatário da NF-e
              </span>
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsNewCustomer(false)}
                  className={`px-2 sm:px-3 py-2 sm:py-1 rounded-xl text-[10px] sm:text-xs font-bold transition-all ${
                    !isNewCustomer ? 'bg-purple-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Selecionar Cadastrado
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsNewCustomer(true);
                    setSelectedCustomerId('');
                  }}
                  className={`px-2 sm:px-3 py-2 sm:py-1 rounded-xl text-[10px] sm:text-xs font-bold transition-all ${
                    isNewCustomer ? 'bg-purple-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Informar Manualmente
                </button>
              </div>
            </div>

            {!isNewCustomer ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search size={16} className="absolute left-4 top-3.5 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="Buscar cliente por Razão Social, CNPJ/CPF ou Município..."
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-medium outline-none focus:border-purple-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-1">
                  {filteredCustomers.length === 0 ? (
                    <p className="col-span-full text-center text-xs text-slate-400 font-medium py-6">
                      Nenhum cliente encontrado para essa busca.
                    </p>
                  ) : filteredCustomers.map((c, idx) => (
                    <button
                      key={c.id || `cust-${idx}`}
                      type="button"
                      onClick={() => selectCustomer(c)}
                      className={`text-left p-3 rounded-2xl border transition-all ${
                        selectedCustomerId === c.id
                          ? 'bg-purple-50 border-purple-500 shadow-sm ring-1 ring-purple-500'
                          : 'bg-white border-slate-200 hover:bg-slate-100/70'
                      }`}
                    >
                      <p className="font-bold text-slate-800 text-xs truncate">{c.name || 'Sem nome'}</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{c.document || 'Sem documento'}</p>
                      <p className="text-[9px] text-slate-400 truncate">{c.city || '—'} - {c.state || '—'}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Nome / Razão Social *</label>
                  <input 
                    type="text" 
                    value={destName} 
                    onChange={e => setDestName(e.target.value)} 
                    placeholder="Nome completo ou Razão Social"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">CNPJ ou CPF (Apenas dígitos) *</label>
                  <input 
                    type="text" 
                    value={destDoc} 
                    onChange={e => setDestDoc(e.target.value)} 
                    placeholder="CNPJ ou CPF"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:border-purple-500"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black uppercase text-slate-400">Inscrição Estadual (IE)</label>
                    <label className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={destIsentoIe} 
                        onChange={e => setDestIsentoIe(e.target.checked)} 
                        className="rounded h-3 w-3"
                      />
                      Isento
                    </label>
                  </div>
                  <input 
                    type="text" 
                    disabled={destIsentoIe}
                    value={destIsentoIe ? 'ISENTO' : destIe} 
                    onChange={e => setDestIe(e.target.value)} 
                    placeholder="Inscrição Estadual"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-none focus:border-purple-500 disabled:bg-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Logradouro / Endereço</label>
                  <input 
                    type="text" 
                    value={destStreet} 
                    onChange={e => setDestStreet(e.target.value)} 
                    placeholder="Rua, Rodovia, Fazenda"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Número e Bairro</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={destNumber} 
                      onChange={e => setDestNumber(e.target.value)} 
                      placeholder="Nº"
                      className="w-20 p-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500"
                    />
                    <input 
                      type="text" 
                      value={destNeighborhood} 
                      onChange={e => setDestNeighborhood(e.target.value)} 
                      placeholder="Bairro ou Zona Rural"
                      className="flex-1 p-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Município, UF e CEP</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={destCity} 
                      onChange={e => setDestCity(e.target.value)} 
                      placeholder="Cidade"
                      className="flex-1 p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                    />
                    <input 
                      type="text" 
                      value={destState} 
                      onChange={e => setDestState(e.target.value.toUpperCase())} 
                      placeholder="UF"
                      className="w-14 p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-center uppercase outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Vínculo Opcional a Pedido de Venda */}
            {customerOrders.length > 0 && (
              <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-2 mt-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span className="text-xs font-black text-purple-900 uppercase flex items-center gap-1.5">
                    <ShoppingBag size={15} className="text-purple-700" /> Vincular esta NF-e a um Pedido de Venda deste Cliente?
                  </span>
                  <span className="text-[10px] text-purple-600 font-bold">
                    Abate o saldo sem duplicar venda no financeiro
                  </span>
                </div>
                <select
                  value={selectedOrderId}
                  onChange={e => {
                    const ordId = e.target.value;
                    setSelectedOrderId(ordId);
                    if (ordId) {
                      setGenerateFinance(false);
                      const foundOrd = orders?.find(o => o.id === ordId);
                      if (foundOrd && foundOrd.items.length > 0) {
                        const first = foundOrd.items[0];
                        const totalQty = (foundOrd.items || []).reduce((sum, it) => sum + (it.quantity || 0), 0);
                        const alreadyWithdrawn = (foundOrd.withdrawals || []).reduce((sum, w) => sum + (w.quantityWithdrawn || 0), 0);
                        const remaining = Math.max(0, totalQty - alreadyWithdrawn);
                        const suggestedQty = remaining > 35 ? 32 : (remaining > 0 ? remaining : 10);
                        setItems([{
                          id: `item-1`,
                          productId: first.productId,
                          productCode: first.productCode || 'CALC-01',
                          productName: first.productName,
                          unit: first.unit || 'TON',
                          quantity: suggestedQty,
                          unitPrice: first.unitPrice || 180,
                          discount: 0,
                          total: suggestedQty * (first.unitPrice || 180),
                          ncm: first.ncm || '2517.10.00',
                          cfop: first.cfop || config.cfopPadraoEstadual || '5101',
                          cst: first.cst || config.cstIcmsPadrao || '40',
                          informacoesComplementares: first.informacoesComplementares
                        }]);
                      }
                    }
                  }}
                  className="w-full p-2.5 bg-white border border-purple-200 rounded-xl text-xs font-bold outline-none focus:border-purple-600 text-slate-800"
                >
                  <option value="">Sem vínculo (NF-e Avulsa Independente)</option>
                  {customerOrders.map(o => {
                    const totalQty = (o.items || []).reduce((sum, it) => sum + (it.quantity || 0), 0);
                    const alreadyWithdrawn = (o.withdrawals || []).reduce((sum, w) => sum + (w.quantityWithdrawn || 0), 0);
                    const remaining = Math.max(0, totalQty - alreadyWithdrawn);
                    return (
                      <option key={o.id} value={o.id}>
                        {o.reference} — Saldo a retirar: {remaining.toFixed(1)} TON (Total comprado: {totalQty} TON)
                      </option>
                    );
                  })}
                </select>
                {selectedOrderId && (
                  <p className="text-[10px] text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 p-2 rounded-xl border border-emerald-200">
                    <CheckCircle2 size={13} /> Esta nota fiscal abaterá a quantidade diretamente do pedido selecionado acima. Não gerará pedido duplicado e não lançará receita no caixa.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Seção 2: Itens da NF-e (com CFOP e CST editáveis) */}
          <div className="space-y-3 p-3.5 sm:p-5 bg-slate-50 rounded-2xl sm:rounded-3xl border border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200/60 pb-3">
              <span className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
                <ShoppingBag size={16} className="text-purple-600" /> 2. Produtos & Enquadramento Fiscal (CFOP / CST Editáveis)
              </span>
              <button
                type="button"
                onClick={handleAddItem}
                className="w-full sm:w-auto justify-center flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
              >
                <Plus size={14} /> Adicionar Item
              </button>
            </div>

            <div className="space-y-3">
              {items.map((it, idx) => (
                <div key={it.id} className="p-3 sm:p-4 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                      Item #{idx + 1}
                    </span>
                    {it.cClassTrib && (
                      <span className="text-[9px] font-black uppercase text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                        Reforma Trib. (RTC): {it.cClassTrib === 'AGRO_60' ? 'Insumo Agro -60%' : 'Insumo Agro 0%'}
                      </span>
                    )}
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                        title="Remover Item"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    {/* Produto Selecionável ou Nome */}
                    <div className="col-span-2 md:col-span-2 space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400">Produto do Catálogo</label>
                      <select
                        value={it.productId}
                        onChange={e => handleUpdateItem(idx, 'productId', e.target.value)}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                      >
                        {safeInventory.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.unit || 'TON'})</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400">Quantidade</label>
                      <input 
                        type="number" 
                        step="0.1" 
                        value={it.quantity} 
                        onChange={e => handleUpdateItem(idx, 'quantity', e.target.value)} 
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-center outline-none focus:border-purple-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400">Valor Unitário (R$)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        value={it.unitPrice} 
                        onChange={e => handleUpdateItem(idx, 'unitPrice', e.target.value)} 
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-right outline-none focus:border-purple-500"
                      />
                    </div>

                    {/* CFOP Editável */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-purple-700">CFOP *</label>
                      <input 
                        type="text" 
                        value={it.cfop} 
                        onChange={e => handleUpdateItem(idx, 'cfop', e.target.value)} 
                        placeholder="5101"
                        className="w-full p-2 bg-purple-50 border border-purple-300 rounded-xl text-xs font-mono font-black text-purple-900 outline-none focus:border-purple-600"
                      />
                    </div>

                    {/* CST Editável */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-blue-700">CST / CSOSN *</label>
                      <input 
                        type="text" 
                        value={it.cst} 
                        onChange={e => handleUpdateItem(idx, 'cst', e.target.value)} 
                        placeholder="102"
                        className="w-full p-2 bg-blue-50 border border-blue-300 rounded-xl text-xs font-mono font-bold text-blue-900 outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs pt-1 border-t border-slate-100">
                    <span className="text-[10px] text-slate-400 font-mono">NCM: {it.ncm}</span>
                    <span className="font-black text-slate-800">Total do Item: {formatBRL(it.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Seção 3: Parâmetros Fiscais e Informações Complementares */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <div className="space-y-3 p-3.5 sm:p-5 bg-slate-50 rounded-2xl sm:rounded-3xl border border-slate-100">
              <span className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2 border-b border-slate-200/60 pb-2">
                <CreditCard size={16} className="text-purple-600" /> 3. Parâmetros Fiscais & Pagamento
              </span>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400">Natureza da Operação</label>
                <input 
                  type="text" 
                  value={naturezaOperacao} 
                  onChange={e => setNaturezaOperacao(e.target.value)} 
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Forma de Pagamento</label>
                <select 
                  value={paymentMethod} 
                  onChange={e => setPaymentMethod(e.target.value as any)} 
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                >
                  <option value="PIX">PIX</option>
                  <option value="Boleto">Boleto Bancário</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Transferência">Transferência Bancária</option>
                  <option value="Sem Pagamento">90 - Sem Pagamento</option>
                </select>
              </div>

              {/* Dados do Veículo / Transporte da Carga */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-slate-200/60">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Placa Veículo</label>
                  <input 
                    type="text" 
                    value={placaCaminhao} 
                    onChange={e => setPlacaCaminhao(e.target.value.toUpperCase())} 
                    placeholder="ABC-1D23"
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold uppercase outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Motorista</label>
                  <input 
                    type="text" 
                    value={nomeMotorista} 
                    onChange={e => setNomeMotorista(e.target.value)} 
                    placeholder="Nome"
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Ticket Balança</label>
                  <input 
                    type="text" 
                    value={ticketBalanca} 
                    onChange={e => setTicketBalanca(e.target.value)} 
                    placeholder="PES-123456"
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-purple-700">Nº Pedido Externo</label>
                  <input 
                    type="text" 
                    value={pedidoExterno} 
                    onChange={e => setPedidoExterno(e.target.value)} 
                    placeholder="Ex: PED-1052"
                    className="w-full p-2 bg-purple-50/50 border border-purple-200 rounded-xl text-xs font-bold outline-none focus:border-purple-600 text-purple-950"
                  />
                </div>
              </div>

              {/* Opção de Geração Financeira */}
              {!selectedOrderId && (
                <div className="space-y-2 mt-2">
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <span className="text-xs font-black text-slate-900 block">
                        Lançar no Contas a Receber (Pendente)?
                      </span>
                      <p className="text-[10px] text-slate-600">
                        {generateFinance 
                          ? 'Cria lançamento no Contas a Receber como PENDENTE. O valor só entrará no saldo do caixa/banco após a confirmação do recebimento no Financeiro.' 
                          : 'Desativado: Não cria título no financeiro (ideal quando o faturamento for controlado à parte).'}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input 
                        type="checkbox" 
                        checked={generateFinance} 
                        onChange={e => setGenerateFinance(e.target.checked)} 
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  {generateFinance && (
                    <div className="p-3 bg-white border border-blue-100 rounded-xl flex items-center justify-between gap-3 animate-in fade-in duration-150">
                      <label className="text-xs font-bold text-slate-700">Data de Vencimento do Título:</label>
                      <input
                        type="date"
                        value={financeDueDate}
                        onChange={e => setFinanceDueDate(e.target.value)}
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3 p-3.5 sm:p-5 bg-slate-50 rounded-2xl sm:rounded-3xl border border-slate-100">
              <span className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2 border-b border-slate-200/60 pb-2">
                <Info size={16} className="text-purple-600" /> 4. Informações Complementares (infCpl)
              </span>

              <p className="text-[10px] text-slate-500">
                Só este texto vai para os Dados Adicionais da NF-e. As cláusulas cadastradas no produto entram automaticamente; edite ou apague à vontade.
              </p>

              <textarea 
                rows={5}
                value={resolvedInfCpl}
                onChange={e => {
                  setInfCplTouched(true);
                  setInfCplCustom(e.target.value);
                }}
                className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-xs outline-none focus:border-purple-500 resize-none font-medium text-slate-700"
                placeholder="Observações legais, convênios, prazos..."
              />
            </div>

          </div>

          {/* Seção 5: Frete & Transporte — sem frete, CIF, FOB */}
          <FreteNfeSection
            value={frete}
            onChange={setFrete}
            totalQuantidade={totalQuantidade}
            transportadores={transportadores}
            onAddTransportador={onAddTransportador}
          />

          {/* Totais do Documento */}
          <div className="p-4 sm:p-5 bg-slate-900 text-white rounded-2xl sm:rounded-3xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-0.5 w-full text-left">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Resumo da Nota Fiscal Avulsa
              </span>
              <p className="text-xs text-slate-400">
                Produtos ({items.length} itens): {formatBRL(subtotal)} | Frete: {formatBRL(shippingVal)}
              </p>
            </div>
            <div className="text-right w-full sm:w-auto">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Valor Total NF-e:</span>
              <p className="text-2xl font-black text-emerald-400">{formatBRL(total)}</p>
            </div>
          </div>
          </>
          )}

          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 font-bold flex items-center gap-2">
              <AlertCircle size={16} /> {errorMsg}
            </div>
          )}

        </div>
    </FlowSheet>
  );
};
