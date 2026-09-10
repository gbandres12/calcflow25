import React, { useState, useRef, useMemo } from 'react';
import { Customer, InventoryItem, FiscalConfig, Company, User, SaleOrder, OrderStatus, TransactionStatus, NfeStatus } from '../types';
import { fiscalService } from '../services/fiscalService';
import { 
  X, Send, Plus, Trash2, FileText, CheckCircle2, AlertCircle, 
  Building, User as UserIcon, Truck, Sparkles, Search, ShoppingBag, 
  CreditCard, Info, HelpCircle
} from 'lucide-react';

interface EmitirNfeAvulsaModalProps {
  customers: Customer[];
  inventory: InventoryItem[];
  config: FiscalConfig;
  company: Company;
  currentUser?: User;
  onClose: () => void;
  onSuccess: (newOrder: SaleOrder) => void;
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

export const EmitirNfeAvulsaModal: React.FC<EmitirNfeAvulsaModalProps> = ({
  customers,
  inventory,
  config,
  company,
  currentUser,
  onClose,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  // Destinatário
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [isNewCustomer, setIsNewCustomer] = useState(false);

  // Dados manuais se for novo cliente
  const [destName, setDestName] = useState('');
  const [destDoc, setDestDoc] = useState('');
  const [destIe, setDestIe] = useState('');
  const [destIsentoIe, setDestIsentoIe] = useState(false);
  const [destStreet, setDestStreet] = useState('');
  const [destNumber, setDestNumber] = useState('');
  const [destNeighborhood, setDestNeighborhood] = useState('');
  const [destCity, setDestCity] = useState('Santarém');
  const [destState, setDestState] = useState('PA');
  const [destZip, setDestZip] = useState('68000-000');
  const [destIbge, setDestIbge] = useState('1506807');
  const [destEmail, setDestEmail] = useState('');

  // Parâmetros da NF-e
  const [naturezaOperacao, setNaturezaOperacao] = useState(config.naturezaOperacaoPadrao || 'Venda de producao do estabelecimento');
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'Boleto' | 'Dinheiro' | 'Transferência' | 'Sem Pagamento'>('PIX');
  const [freteModalidade, setFreteModalidade] = useState<number>(9); // 9 = sem frete
  const [freteValor, setFreteValor] = useState<string>('0');
  const [infCplCustom, setInfCplCustom] = useState<string>('');

  // Itens da Nota
  const [items, setItems] = useState<AvulsaItem[]>([
    {
      id: `item-1`,
      productId: inventory[0]?.id || 'moido',
      productCode: inventory[0]?.code || '001',
      productName: inventory[0]?.name || 'Calcário Agrícola Moído (PRNT > 85%)',
      unit: inventory[0]?.unit || 'TON',
      quantity: 10,
      unitPrice: inventory[0]?.unitPrice || 180,
      discount: 0,
      total: (inventory[0]?.unitPrice || 180) * 10,
      ncm: inventory[0]?.ncm || '2517.10.00',
      cfop: inventory[0]?.cfop || config.cfopPadraoEstadual || '5101',
      cst: inventory[0]?.cst || config.cstIcmsPadrao || '40',
      cClassTrib: inventory[0]?.cClassTrib,
      aliquotaIbs: inventory[0]?.aliquotaIbs,
      aliquotaCbs: inventory[0]?.aliquotaCbs,
      aliquotaIs: inventory[0]?.aliquotaIs,
      informacoesComplementares: inventory[0]?.informacoesComplementares
    }
  ]);

  // Cliente selecionado ou montado
  const activeCustomer: Customer = useMemo(() => {
    if (!isNewCustomer && selectedCustomerId) {
      const found = customers.find(c => c.id === selectedCustomerId);
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

  // Seletor de clientes cadastrados
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const term = customerSearch.toLowerCase();
    const cleanDigits = customerSearch.replace(/\D/g, '');
    return customers.filter(c => 
      c.name.toLowerCase().includes(term) ||
      (c.document && c.document.replace(/\D/g, '').includes(cleanDigits)) ||
      (c.city && c.city.toLowerCase().includes(term))
    );
  }, [customers, customerSearch]);

  const selectCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setIsNewCustomer(false);
    setDestName(c.name);
    setDestDoc(c.document);
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

    // Ajustar CFOPs dos itens caso mude para interestadual
    const isInter = c.state && c.state !== 'PA';
    setItems(prev => prev.map(it => ({
      ...it,
      cfop: isInter 
        ? (it.cfop.startsWith('5') ? '6' + it.cfop.slice(1) : (config.cfopPadraoInterestadual || '6101'))
        : (it.cfop.startsWith('6') ? '5' + it.cfop.slice(1) : (config.cfopPadraoEstadual || '5101'))
    })));
  };

  // Manipulação de Itens
  const handleAddItem = () => {
    const isInter = activeCustomer.state && activeCustomer.state !== 'PA';
    const defaultCfop = isInter ? (config.cfopPadraoInterestadual || '6101') : (config.cfopPadraoEstadual || '5101');
    const firstProd = inventory[0];
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
      cst: firstProd?.cst || config.cstIcmsPadrao || '40',
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
        const prod = inventory.find(p => p.id === value);
        if (prod) {
          const isInter = activeCustomer.state && activeCustomer.state !== 'PA';
          updated.productCode = prod.code || updated.productCode;
          updated.productName = prod.name;
          updated.unit = prod.unit || 'TON';
          updated.unitPrice = prod.unitPrice || updated.unitPrice;
          updated.ncm = prod.ncm || updated.ncm;
          updated.cfop = prod.cfop || (isInter ? (config.cfopPadraoInterestadual || '6101') : (config.cfopPadraoEstadual || '5101'));
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

  // Totais
  const subtotal = useMemo(() => items.reduce((acc, it) => acc + it.total, 0), [items]);
  const shippingVal = parseFloat(freteValor) || 0;
  const total = subtotal + shippingVal;

  // Informações complementares reunidas
  const productComplementares = useMemo(() => {
    return items
      .map(it => it.informacoesComplementares)
      .filter((txt): txt is string => Boolean(txt && txt.trim()));
  }, [items]);

  const resolvedInfCpl = useMemo(() => {
    if (infCplCustom.trim()) return infCplCustom;
    return [
      config.observacoesFiscaisPadrao,
      ...Array.from(new Set(productComplementares))
    ].filter(Boolean).join(' | ');
  }, [infCplCustom, config.observacoesFiscaisPadrao, productComplementares]);

  // Mock de Ordem de Venda correspondente para emitirNFe
  const syntheticOrder: SaleOrder = useMemo(() => ({
    id: `order_avulsa_${Date.now()}`,
    reference: `NFA-${Math.floor(1000 + Math.random() * 9000)}`,
    customerId: activeCustomer.id,
    sellerName: currentUser?.name || 'Emissão Fiscal Direta',
    date: new Date().toISOString().split('T')[0],
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
    status: OrderStatus.FINALIZED,
    paymentMethod: paymentMethod === 'Sem Pagamento' ? 'Outros' : paymentMethod,
    payments: [{
      id: `pay-${Date.now()}`,
      amount: total,
      date: new Date().toISOString().split('T')[0],
      status: TransactionStatus.PAGO,
      accountId: 'acc-1',
      description: 'Pagamento NF-e Avulsa'
    }],
    nfeNaturezaOperacao: naturezaOperacao,
    nfeInfCpl: resolvedInfCpl
  }), [activeCustomer, currentUser, items, subtotal, shippingVal, total, paymentMethod, naturezaOperacao, resolvedInfCpl]);

  const validation = fiscalService.validarDadosFiscais(syntheticOrder, activeCustomer);
  const formatBRL = (val: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
      const payloadSent = fiscalService.montarPayloadNotaAs(syntheticOrder, activeCustomer, config);
      const result = await fiscalService.emitirNFe(syntheticOrder, activeCustomer, config, company.id);

      if (result.success) {
        let finalStatus = result.nfeStatus;

        if (result.nfeStatus === 'processando' && result.nfeId) {
          const pollResult = await fiscalService.consultarEAtualizarStatusProcessamento(result.nfeId, config, 3, 2000);
          if (pollResult.success && pollResult.status && pollResult.status !== 'nao_emitida') {
            finalStatus = pollResult.status;
          }
        }

        const createdOrder: SaleOrder = {
          ...syntheticOrder,
          nfeStatus: finalStatus,
          nfeId: result.nfeId,
          nfeChave: result.nfeChave,
          nfeNumero: result.nfeNumero,
          nfeSerie: result.nfeSerie,
          nfeProtocolo: result.nfeProtocolo,
          nfeDanfeUrl: result.nfeDanfeUrl,
          nfeXmlUrl: result.nfeXmlUrl,
          nfeEmissao: result.nfeEmissao,
          nfeNaturezaOperacao: result.naturezaOperacao,
          nfePayload: payloadSent,
          nfeRawResponse: result.rawResponse
        };

        onSuccess(createdOrder);
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
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[160] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden my-8 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-600 text-white rounded-2xl shadow-lg shadow-purple-200">
              <FileText size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">
                  Emissão de Nota Fiscal Avulsa (NF-e Direta)
                </h3>
                <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800">
                  Sem Pedido Prévio
                </span>
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                  config.environment === 'production' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {config.environment === 'production' ? 'Produção SEFAZ' : 'Homologação'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Próximo Nº NF-e: <b>{config.proxNumeroNFe || 1042}</b> (Série {config.serieNFe || 1}) | Emitente: <b>{config.razaoSocial}</b>
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Formulário Principal */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
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

          {/* Seção 1: Destinatário */}
          <div className="space-y-4 p-5 bg-slate-50 rounded-3xl border border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
              <span className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
                <UserIcon size={16} className="text-purple-600" /> 1. Destinatário da NF-e
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewCustomer(false)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
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
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
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
                  {filteredCustomers.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectCustomer(c)}
                      className={`text-left p-3 rounded-2xl border transition-all ${
                        selectedCustomerId === c.id
                          ? 'bg-purple-50 border-purple-500 shadow-sm ring-1 ring-purple-500'
                          : 'bg-white border-slate-200 hover:bg-slate-100/70'
                      }`}
                    >
                      <p className="font-bold text-slate-800 text-xs truncate">{c.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{c.document}</p>
                      <p className="text-[9px] text-slate-400 truncate">{c.city} - {c.state}</p>
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
          </div>

          {/* Seção 2: Itens da NF-e (com CFOP e CST editáveis) */}
          <div className="space-y-3 p-5 bg-slate-50 rounded-3xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
              <span className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
                <ShoppingBag size={16} className="text-purple-600" /> 2. Produtos & Enquadramento Fiscal (CFOP / CST Editáveis)
              </span>
              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
              >
                <Plus size={14} /> Adicionar Item
              </button>
            </div>

            <div className="space-y-3">
              {items.map((it, idx) => (
                <div key={it.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
                    {/* Produto Selecionável ou Nome */}
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400">Produto do Catálogo</label>
                      <select
                        value={it.productId}
                        onChange={e => handleUpdateItem(idx, 'productId', e.target.value)}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-purple-500"
                      >
                        {inventory.map(p => (
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

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                    <span className="text-[10px] text-slate-400 font-mono">NCM: {it.ncm}</span>
                    <span className="font-black text-slate-800">Total do Item: {formatBRL(it.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Seção 3: Parâmetros Fiscais e Informações Complementares */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <div className="space-y-3 p-5 bg-slate-50 rounded-3xl border border-slate-100">
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

              <div className="grid grid-cols-2 gap-3">
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

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Modalidade Frete</label>
                  <select 
                    value={freteModalidade} 
                    onChange={e => setFreteModalidade(parseInt(e.target.value, 10))} 
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                  >
                    <option value={9}>9 - Sem Ocorrência de Frete</option>
                    <option value={0}>0 - Contratação pelo Remetente (CIF)</option>
                    <option value={1}>1 - Contratação pelo Destinatário (FOB)</option>
                  </select>
                </div>
              </div>

              {freteModalidade !== 9 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Valor do Frete (R$)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={freteValor} 
                    onChange={e => setFreteValor(e.target.value)} 
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                  />
                </div>
              )}
            </div>

            <div className="space-y-3 p-5 bg-slate-50 rounded-3xl border border-slate-100">
              <span className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2 border-b border-slate-200/60 pb-2">
                <Info size={16} className="text-purple-600" /> 4. Informações Complementares (infCpl)
              </span>

              <p className="text-[10px] text-slate-500">
                Texto impresso nos Dados Adicionais da NF-e. Inclui automaticamente cláusulas pré-definidas dos produtos selecionados:
              </p>

              <textarea 
                rows={5}
                value={infCplCustom || resolvedInfCpl}
                onChange={e => setInfCplCustom(e.target.value)}
                className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-xs outline-none focus:border-purple-500 resize-none font-medium text-slate-700"
                placeholder="Observações legais, convênios, prazos..."
              />
            </div>

          </div>

          {/* Totais do Documento */}
          <div className="p-5 bg-slate-900 text-white rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-0.5 text-center sm:text-left">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Resumo da Nota Fiscal Avulsa
              </span>
              <p className="text-xs text-slate-400">
                Produtos ({items.length} itens): {formatBRL(subtotal)} | Frete: {formatBRL(shippingVal)}
              </p>
            </div>
            <div className="text-center sm:text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Valor Total NF-e:</span>
              <p className="text-2xl font-black text-emerald-400">{formatBRL(total)}</p>
            </div>
          </div>

          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 font-bold flex items-center gap-2">
              <AlertCircle size={16} /> {errorMsg}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-6 py-3 text-xs font-bold uppercase text-slate-500 hover:bg-slate-200 rounded-xl transition-all"
          >
            Cancelar
          </button>

          <button
            disabled={loading || !validation.valid}
            onClick={handleEmitirAvulsa}
            className="flex items-center gap-2 px-8 py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-purple-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02]"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Transmitindo NF-e Avulsa à SEFAZ...
              </>
            ) : (
              <>
                <Send size={16} /> Transmitir e Emitir NF-e Avulsa
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
