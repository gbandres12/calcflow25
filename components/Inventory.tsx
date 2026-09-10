import React, { useState, useMemo, useEffect, useRef } from 'react';
import { InventoryItem, Customer } from '../types';
import { 
  Package, 
  PlusCircle, 
  ShoppingCart, 
  AlertTriangle, 
  ShieldCheck, 
  Plus, 
  Search, 
  Check, 
  Phone, 
  Fingerprint, 
  Edit3, 
  Trash2, 
  FileCheck, 
  Sparkles, 
  HelpCircle, 
  Filter, 
  Tag, 
  DollarSign, 
  Layers, 
  Percent, 
  X,
  FileText,
  Boxes
} from 'lucide-react';

interface InventoryProps {
  inventory: InventoryItem[];
  customers: Customer[];
  onPurchase: (qty: number, cost: number, details: {
    supplier: string;
    initialPayment: number;
    dueDate?: string;
    paymentMethod: string;
    notes?: string;
  }) => void;
  onSale: (qty: number, price: number, customerId: string) => void;
  onAddProduct: (item: Omit<InventoryItem, 'id' | 'companyId'> & { id?: string }) => void;
  onUpdateProduct?: (item: InventoryItem) => void;
  onDeleteProduct?: (id: string) => void;
}

// NCMs comuns do Setor de Mineração de Calcário para Atalho Rápido
const COMMON_NCMS = [
  { code: '2517.10.00', desc: 'Pedras britadas, calhaus e cascalhos (Calcário Britado/Moído)' },
  { code: '2521.00.00', desc: 'Castinas e pedras calcárias para agricultura / cal' },
  { code: '2518.10.00', desc: 'Dolomita não calcinada nem sinterizada (Calcário Dolomítico)' },
  { code: '2522.10.00', desc: 'Cal viva para correção de solo' },
  { code: '2522.20.00', desc: 'Cal apagada ou hidratada' },
  { code: '3824.99.99', desc: 'Outros corretivos químicos de solo' }
];

const CATEGORIES = [
  'Calcário Agrícola Calcítico',
  'Calcário Agrícola Dolomítico',
  'Calcário Britado (Matéria-prima)',
  'Calcário Ensacado (50kg)',
  'Big Bags (1.000kg)',
  'Insumos e Sacaria',
  'Serviços / Fretes',
  'Outros'
];

const CST_ICMS_OPTIONS = [
  // Simples Nacional (CSOSN)
  { value: '102', label: '102 - Tributada pelo Simples Nacional sem permissão de crédito (Mais Comum)', group: 'Simples Nacional' },
  { value: '101', label: '101 - Tributada pelo Simples Nacional com permissão de crédito', group: 'Simples Nacional' },
  { value: '103', label: '103 - Isenção do ICMS no Simples Nacional para faixa de receita bruta', group: 'Simples Nacional' },
  { value: '201', label: '201 - Tributada no Simples com permissão de crédito e cobrança ICMS-ST', group: 'Simples Nacional' },
  { value: '202', label: '202 - Tributada no Simples sem permissão de crédito e cobrança ICMS-ST', group: 'Simples Nacional' },
  { value: '300', label: '300 - Imune', group: 'Simples Nacional' },
  { value: '400', label: '400 - Não tributada pelo Simples Nacional', group: 'Simples Nacional' },
  { value: '500', label: '500 - ICMS cobrado anteriormente por substituição tributária (ST)', group: 'Simples Nacional' },
  { value: '900', label: '900 - Outros (Simples Nacional)', group: 'Simples Nacional' },
  
  // Regime Normal (CST ICMS)
  { value: '40', label: '40 - Isenta de ICMS (Convênio ICMS 100/97)', group: 'Regime Normal' },
  { value: '41', label: '41 - Não tributada', group: 'Regime Normal' },
  { value: '51', label: '51 - Diferimento do ICMS (Operação interna mineral/agrícola)', group: 'Regime Normal' },
  { value: '00', label: '00 - Tributada integralmente', group: 'Regime Normal' },
  { value: '20', label: '20 - Com Redução de Base de Cálculo', group: 'Regime Normal' },
  { value: '10', label: '10 - Tributada com cobrança do ICMS por substituição tributária', group: 'Regime Normal' },
  { value: '60', label: '60 - ICMS cobrado anteriormente por substituição tributária', group: 'Regime Normal' },
  { value: '70', label: '70 - Com redução de base e cobrança ICMS-ST', group: 'Regime Normal' },
  { value: '90', label: '90 - Outras Saídas (Regime Normal)', group: 'Regime Normal' }
];

const CST_PIS_COFINS_OPTIONS = [
  { value: '07', label: '07 - Operação Isenta da Contribuição (Insumo Agropecuário)' },
  { value: '08', label: '08 - Operação sem Incidência da Contribuição' },
  { value: '06', label: '06 - Operação Tributável a Alíquota Zero' },
  { value: '01', label: '01 - Operação Tributável com Alíquota Básica' },
  { value: '02', label: '02 - Operação Tributável com Alíquota Diferenciada' },
  { value: '04', label: '04 - Operação Tributável Monofásica - Alíquota Zero' },
  { value: '49', label: '49 - Outras Operações de Saída' },
  { value: '99', label: '99 - Outras Operações' }
];

const RTC_ENQUADRAMENTOS = [
  { value: 'AGRO_60', label: 'Insumos Agropecuários — Redução de 60% (Art. 9º EC 132/2023)', reducaoIbs: 60, reducaoCbs: 60 },
  { value: 'AGRO_ZERO', label: 'Calcário Agrícola e Corretivo de Solo — Alíquota Zero / Isenção', reducaoIbs: 100, reducaoCbs: 100 },
  { value: 'REGULAR', label: 'Tributação Regular Integral (Sem Benefício RTC)', reducaoIbs: 0, reducaoCbs: 0 },
  { value: 'IMUNE', label: 'Imunidade Tributária Constitucional', reducaoIbs: 100, reducaoCbs: 100 }
];

export const Inventory: React.FC<InventoryProps> = ({ 
  inventory, 
  customers, 
  onPurchase, 
  onSale, 
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct
}) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'overview'>('catalog');
  const [activeModal, setActiveModal] = useState<'purchase' | 'sale' | 'productForm' | null>(null);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // Modal Form Tab
  const [formTab, setFormTab] = useState<'commercial' | 'fiscal'>('commercial');

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');

  // Purchase/Sale Form States
  const [qty, setQty] = useState('');
  const [val, setVal] = useState('');
  const [purchaseSupplier, setPurchaseSupplier] = useState('');
  const [purchaseInitialPayment, setPurchaseInitialPayment] = useState('0');
  const [purchaseDueDate, setPurchaseDueDate] = useState('');
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState('PIX');
  const [purchaseNotes, setPurchaseNotes] = useState('');

  // Searchable Customer State (for sale modal)
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Product Form State (Commercial + Fiscal + RTC)
  const [formData, setFormData] = useState({
    id: '',
    code: '',
    name: '',
    category: 'Calcário Agrícola Calcítico',
    quantity: '0',
    unitPrice: '',
    costPrice: '',
    minStock: '50',
    unit: 'Ton',
    ncm: '2517.10.00',
    cst: '102',
    cstPis: '07',
    cstCofins: '07',
    cfop: '5101',
    origem: '0',
    aliquotaIcms: '0',
    aliquotaPis: '0',
    aliquotaCofins: '0',
    unidadeTributavel: 'TON',
    observacoesFiscais: 'Isento de ICMS para uso agrícola conforme Convênio ICMS 100/97.',
    informacoesComplementares: 'Produto destinado ao uso exclusivo na agricultura com isenção/redução conforme Convênio ICMS 100/97 e art. 9º da EC 132/2023 (Reforma Tributária - Insumos Agropecuários).',
    
    // Reforma Tributária (RTC)
    cClassTrib: 'AGRO_60',
    cstIbsCbs: '02',
    aliquotaIbs: '0.10',
    reducaoBcIbs: '60',
    aliquotaCbs: '0.90',
    reducaoBcCbs: '60',
    sujeitoIs: false,
    aliquotaIs: '0'
  });

  const britado = inventory.find(i => i.id === 'britado');
  const moido = inventory.find(i => i.id === 'moido');

  // Searchable customers filtering
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

  // Products filtering for the Catalog
  const filteredProducts = useMemo(() => {
    return inventory.filter(item => {
      const matchesCategory = selectedCategory === 'Todas' || item.category === selectedCategory;
      const term = searchTerm.toLowerCase();
      const matchesSearch = 
        item.name.toLowerCase().includes(term) ||
        (item.code && item.code.toLowerCase().includes(term)) ||
        (item.ncm && item.ncm.includes(term)) ||
        (item.category && item.category.toLowerCase().includes(term));
      
      return matchesCategory && matchesSearch;
    });
  }, [inventory, searchTerm, selectedCategory]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openNewProductModal = () => {
    setEditingItem(null);
    setFormTab('commercial');
    setFormData({
      id: '',
      code: `CALC-${(inventory.length + 1).toString().padStart(3, '0')}`,
      name: '',
      category: 'Calcário Agrícola Calcítico',
      quantity: '0',
      unitPrice: '',
      costPrice: '',
      minStock: '50',
      unit: 'Ton',
      ncm: '2517.10.00',
      cst: '102',
      cstPis: '07',
      cstCofins: '07',
      cfop: '5101',
      origem: '0',
      aliquotaIcms: '0',
      aliquotaPis: '0',
      aliquotaCofins: '0',
      unidadeTributavel: 'TON',
      observacoesFiscais: 'Isento de ICMS para uso agrícola conforme Convênio ICMS 100/97.',
      informacoesComplementares: 'Produto destinado ao uso exclusivo na agricultura com isenção/redução conforme Convênio ICMS 100/97 e art. 9º da EC 132/2023 (Reforma Tributária - Insumos Agropecuários).',
      cClassTrib: 'AGRO_60',
      cstIbsCbs: '02',
      aliquotaIbs: '0.10',
      reducaoBcIbs: '60',
      aliquotaCbs: '0.90',
      reducaoBcCbs: '60',
      sujeitoIs: false,
      aliquotaIs: '0'
    });
    setActiveModal('productForm');
  };

  const openEditProductModal = (item: InventoryItem) => {
    setEditingItem(item);
    setFormTab('commercial');
    setFormData({
      id: item.id,
      code: item.code || '',
      name: item.name,
      category: item.category || 'Calcário Agrícola Calcítico',
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      costPrice: item.costPrice ? item.costPrice.toString() : '',
      minStock: item.minStock.toString(),
      unit: item.unit || 'Ton',
      ncm: item.ncm || '2517.10.00',
      cst: item.cst || '102',
      cstPis: item.cstPis || '07',
      cstCofins: item.cstCofins || '07',
      cfop: item.cfop || '5101',
      origem: item.origem || '0',
      aliquotaIcms: item.aliquotaIcms !== undefined ? item.aliquotaIcms.toString() : '0',
      aliquotaPis: item.aliquotaPis !== undefined ? item.aliquotaPis.toString() : '0',
      aliquotaCofins: item.aliquotaCofins !== undefined ? item.aliquotaCofins.toString() : '0',
      unidadeTributavel: item.unidadeTributavel || 'TON',
      observacoesFiscais: item.observacoesFiscais || 'Isento de ICMS para uso agrícola conforme Convênio ICMS 100/97.',
      informacoesComplementares: item.informacoesComplementares || 'Produto destinado ao uso exclusivo na agricultura com isenção/redução conforme Convênio ICMS 100/97 e art. 9º da EC 132/2023 (Reforma Tributária - Insumos Agropecuários).',
      cClassTrib: item.cClassTrib || 'AGRO_60',
      cstIbsCbs: item.cstIbsCbs || '02',
      aliquotaIbs: item.aliquotaIbs !== undefined ? item.aliquotaIbs.toString() : '0.10',
      reducaoBcIbs: item.reducaoBcIbs !== undefined ? item.reducaoBcIbs.toString() : '60',
      aliquotaCbs: item.aliquotaCbs !== undefined ? item.aliquotaCbs.toString() : '0.90',
      reducaoBcCbs: item.reducaoBcCbs !== undefined ? item.reducaoBcCbs.toString() : '60',
      sujeitoIs: Boolean(item.sujeitoIs),
      aliquotaIs: item.aliquotaIs !== undefined ? item.aliquotaIs.toString() : '0'
    });
    setActiveModal('productForm');
  };

  const handleClose = () => {
    setActiveModal(null);
    setEditingItem(null);
    setQty('');
    setVal('');
    setPurchaseSupplier('');
    setPurchaseInitialPayment('0');
    setPurchaseDueDate('');
    setPurchasePaymentMethod('PIX');
    setPurchaseNotes('');
    setCustomerId('');
    setCustomerSearch('');
  };

  const submitPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    const quantity = parseFloat(qty);
    const unitCost = parseFloat(val);
    const total = quantity * unitCost;
    const initialPayment = parseFloat(purchaseInitialPayment || '0');
    if (!quantity || !unitCost || quantity <= 0 || unitCost <= 0) {
      alert('Informe uma quantidade e um custo unitário válidos.');
      return;
    }
    if (initialPayment < 0 || initialPayment > total + 0.01) {
      alert('A entrada não pode ser maior que o valor total da compra.');
      return;
    }
    onPurchase(quantity, unitCost, {
      supplier: purchaseSupplier.trim() || 'Fornecedor não informado',
      initialPayment,
      dueDate: purchaseDueDate || undefined,
      paymentMethod: purchasePaymentMethod,
      notes: purchaseNotes.trim() || undefined
    });
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

  const submitProductForm = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      alert("Informe o nome do produto.");
      return;
    }

    const payload: Omit<InventoryItem, 'companyId'> = {
      id: formData.id || `prod-${Date.now()}`,
      code: formData.code,
      name: formData.name,
      category: formData.category,
      quantity: parseFloat(formData.quantity || '0'),
      unitPrice: parseFloat(formData.unitPrice || '0'),
      costPrice: formData.costPrice ? parseFloat(formData.costPrice) : undefined,
      minStock: parseFloat(formData.minStock || '0'),
      unit: formData.unit,
      ncm: formData.ncm,
      cst: formData.cst,
      cstPis: formData.cstPis,
      cstCofins: formData.cstCofins,
      cfop: formData.cfop,
      origem: formData.origem,
      aliquotaIcms: parseFloat(formData.aliquotaIcms || '0'),
      aliquotaPis: parseFloat(formData.aliquotaPis || '0'),
      aliquotaCofins: parseFloat(formData.aliquotaCofins || '0'),
      unidadeTributavel: formData.unidadeTributavel,
      observacoesFiscais: formData.observacoesFiscais,
      informacoesComplementares: formData.informacoesComplementares,
      cClassTrib: formData.cClassTrib,
      cstIbsCbs: formData.cstIbsCbs,
      aliquotaIbs: parseFloat(formData.aliquotaIbs || '0'),
      reducaoBcIbs: parseFloat(formData.reducaoBcIbs || '0'),
      aliquotaCbs: parseFloat(formData.aliquotaCbs || '0'),
      reducaoBcCbs: parseFloat(formData.reducaoBcCbs || '0'),
      sujeitoIs: formData.sujeitoIs,
      aliquotaIs: parseFloat(formData.aliquotaIs || '0')
    };

    if (editingItem && onUpdateProduct) {
      onUpdateProduct(payload as InventoryItem);
    } else {
      onAddProduct(payload);
    }

    handleClose();
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Tem certeza que deseja remover o produto "${name}"?`)) {
      if (onDeleteProduct) {
        onDeleteProduct(id);
      }
    }
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

  // Stats calculation
  const totalItemsCount = inventory.length;
  const itemsWithNcmCount = inventory.filter(i => i.ncm && i.ncm.trim().length > 0).length;
  const totalStockValue = inventory.reduce((acc, i) => acc + (i.quantity * i.unitPrice), 0);

  return (
    <div className="space-y-6">
      {/* Header com Navegação de Abas */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Boxes size={22} />
            </span>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Cadastro de Produtos & Parâmetros Fiscais</h2>
          </div>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1 ml-1">
            Gestão de catálogo, estoque, códigos NCM, CST e parâmetros de NF-e
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1.5 rounded-2xl">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-2 ${
                activeTab === 'catalog' 
                  ? 'bg-slate-900 text-white shadow-md' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileCheck size={16} /> Catálogo & Área Fiscal
            </button>
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center gap-2 ${
                activeTab === 'overview' 
                  ? 'bg-slate-900 text-white shadow-md' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Package size={16} /> Resumo & Entradas/Saídas
            </button>
          </div>

          <button 
            onClick={openNewProductModal}
            className="bg-purple-600 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-purple-700 transition-all text-xs uppercase tracking-wider shadow-lg shadow-purple-100"
          >
            <Plus size={18} /> Novo Produto (NCM)
          </button>
        </div>
      </header>

      {/* Visão de Abas */}
      {activeTab === 'catalog' ? (
        <div className="space-y-6">
          {/* Métricas do Catálogo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl">
                <Boxes size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total de Produtos</p>
                <p className="text-2xl font-black text-slate-800 tracking-tight">{totalItemsCount} cadastrados</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
                <FileCheck size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Conformidade Fiscal (NCM)</p>
                <p className="text-2xl font-black text-emerald-600 tracking-tight">{itemsWithNcmCount} de {totalItemsCount} com NCM</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl">
                <DollarSign size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor do Estoque Comercial</p>
                <p className="text-2xl font-black text-slate-800 tracking-tight">R$ {totalStockValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>

          {/* Barra de Filtros e Busca */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Buscar produto por nome, código SKU, NCM ou categoria..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-xs"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <Filter size={16} className="text-slate-400" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-xs w-full md:w-64"
              >
                <option value="Todas">Todas as Categorias</option>
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </div>

          {/* Tabela do Catálogo Geral com Parâmetros Fiscais */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="p-5">Código / Produto</th>
                    <th className="p-5">Categoria & Medida</th>
                    <th className="p-5">Preço Venda / Custo</th>
                    <th className="p-5">Estoque Atual</th>
                    <th className="p-5">Área Fiscal (NCM / CST)</th>
                    <th className="p-5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-16 text-slate-400 font-bold">
                        Nenhum produto encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-5">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                              <Package size={18} />
                            </div>
                            <div>
                              <p className="font-black text-slate-800 uppercase text-sm">{item.name}</p>
                              <span className="text-[10px] font-bold text-slate-400 tracking-wider">
                                SKU: {item.code || `ID-${item.id}`}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="p-5">
                          <div className="space-y-1">
                            <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md font-bold text-[10px] uppercase">
                              {item.category || 'Geral'}
                            </span>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">
                              Unidade: <strong className="text-slate-700">{item.unit || 'Ton'}</strong>
                            </p>
                          </div>
                        </td>

                        <td className="p-5">
                          <div>
                            <p className="font-black text-slate-800 text-sm">
                              R$ {item.unitPrice.toFixed(2)}
                            </p>
                            {item.costPrice !== undefined && item.costPrice > 0 && (
                              <p className="text-[10px] font-bold text-slate-400">
                                Custo: R$ {item.costPrice.toFixed(2)}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="p-5">
                          <div className="space-y-1">
                            <div className="flex items-baseline gap-1">
                              <span className="font-black text-slate-800 text-sm">{item.quantity.toFixed(1)}</span>
                              <span className="text-[10px] font-bold text-slate-400">{item.unit || 'TON'}</span>
                            </div>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase ${getStatusColor(item)}`}>
                              {getStatusText(item)}
                            </span>
                          </div>
                        </td>

                        <td className="p-5">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-100 rounded-lg font-black text-[10px]">
                                NCM: {item.ncm || 'Não informado'}
                              </span>
                              <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-lg font-black text-[10px]">
                                CST: {item.cst || '102'}
                              </span>
                            </div>
                            <p className="text-[10px] font-bold text-slate-400">
                              CFOP: <strong className="text-slate-700">{item.cfop || '5101'}</strong> | ICMS: <strong className="text-slate-700">{item.aliquotaIcms || 0}%</strong>
                            </p>
                          </div>
                        </td>

                        <td className="p-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEditProductModal(item)}
                              className="p-2.5 bg-slate-100 text-slate-700 hover:bg-purple-600 hover:text-white rounded-xl transition-all"
                              title="Editar Produto e Fiscal"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id, item.name)}
                              className="p-2.5 bg-slate-100 text-slate-400 hover:bg-rose-500 hover:text-white rounded-xl transition-all"
                              title="Remover Produto"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Aba de Resumo & Operações Rápida de Entrada e Saída */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {inventory.length === 0 ? (
            <div className="col-span-2 flex flex-col items-center justify-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
              <div className="p-6 bg-slate-50 rounded-full text-slate-300 mb-4">
                <Package size={48} />
              </div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Nenhum produto cadastrado</h3>
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
                  <div className="flex flex-wrap items-center gap-1.5 justify-end">
                    {item.ncm && (
                      <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-black rounded-lg border border-purple-100">
                        NCM {item.ncm}
                      </span>
                    )}
                    {item.cst && (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-black rounded-lg border border-blue-100" title="CST / CSOSN Padrão">
                        CST {item.cst}
                      </span>
                    )}
                    {item.cfop && (
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-lg border border-emerald-100" title="CFOP Padrão">
                        CFOP {item.cfop}
                      </span>
                    )}
                    {item.cClassTrib && (
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded-lg border border-indigo-100" title="Reforma Tributária (RTC)">
                        RTC {item.cClassTrib === 'AGRO_60' ? 'Agro -60%' : item.cClassTrib === 'AGRO_ZERO' ? 'Agro 0%' : 'RTC'}
                      </span>
                    )}
                    <div className={`px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${getStatusColor(item)}`}>
                      {getStatusText(item)}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 mb-8">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.category || (item.id === 'britado' ? 'Matéria-Prima' : 'Produto Final')}</h3>
                  <p className="text-2xl font-black text-slate-800 tracking-tight uppercase">{item.name}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantidade</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black text-slate-800 tracking-tighter">{item.quantity.toFixed(1)}</span>
                      <span className="text-[10px] font-black text-slate-400">{item.unit || 'TONS'}</span>
                    </div>
                    <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase">Mínimo: {item.minStock} {item.unit || 'T'}</p>
                  </div>

                  <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Preço Venda</p>
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
                  <button 
                    onClick={() => openEditProductModal(item)}
                    className="p-4 bg-slate-100 text-slate-700 hover:bg-purple-600 hover:text-white rounded-2xl transition-all"
                    title="Editar Fiscal e Preço"
                  >
                    <Edit3 size={18} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal de Cadastro / Edição de Produto (Com Aba Comercial e Fiscal) */}
      {activeModal === 'productForm' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">
                  {editingItem ? 'Editar Produto e Parâmetros Fiscais' : 'Novo Cadastro de Produto'}
                </h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Parâmetros comerciais e tributários para emissão de NF-e
                </p>
              </div>
              <button onClick={handleClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400"><X /></button>
            </div>

            {/* Sub-abas na Modal (Comercial vs Fiscal) */}
            <div className="flex border-b border-slate-100 bg-slate-50/80 px-8">
              <button
                type="button"
                onClick={() => setFormTab('commercial')}
                className={`py-4 px-6 font-black text-xs uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all ${
                  formTab === 'commercial' 
                    ? 'border-purple-600 text-purple-600 bg-white' 
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <Tag size={16} /> 1. Dados Comerciais & Estoque
              </button>
              <button
                type="button"
                onClick={() => setFormTab('fiscal')}
                className={`py-4 px-6 font-black text-xs uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all ${
                  formTab === 'fiscal' 
                    ? 'border-purple-600 text-purple-600 bg-white' 
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <FileCheck size={16} /> 2. Área Fiscal (NCM / CST / CFOP)
              </button>
            </div>

            <form onSubmit={submitProductForm} className="p-8 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
              {formTab === 'commercial' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5 md:col-span-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Código / SKU</label>
                      <input 
                        type="text" 
                        value={formData.code} 
                        onChange={e => setFormData({ ...formData, code: e.target.value })} 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-bold text-xs" 
                        placeholder="Ex: CALC-001" 
                      />
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Produto *</label>
                      <input 
                        required 
                        type="text" 
                        value={formData.name} 
                        onChange={e => setFormData({ ...formData, name: e.target.value })} 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-purple-500 outline-none font-bold text-xs" 
                        placeholder="Ex: Calcário Agrícola Calcítico Moído" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
                      <select 
                        value={formData.category} 
                        onChange={e => setFormData({ ...formData, category: e.target.value })} 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-purple-500"
                      >
                        {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidade de Medida</label>
                      <select 
                        value={formData.unit} 
                        onChange={e => setFormData({ ...formData, unit: e.target.value })} 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-purple-500"
                      >
                        <option value="Ton">Tonelada (Ton)</option>
                        <option value="Sacos">Saco (50kg)</option>
                        <option value="BigBag">Big Bag (1.000kg)</option>
                        <option value="Kg">Quilograma (Kg)</option>
                        <option value="Unid">Unidade (Unid)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preço de Venda Unitário (R$) *</label>
                      <input 
                        required 
                        type="number" 
                        step="0.01" 
                        value={formData.unitPrice} 
                        onChange={e => setFormData({ ...formData, unitPrice: e.target.value })} 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-sm focus:border-purple-500" 
                        placeholder="98.00" 
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preço de Custo (R$)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        value={formData.costPrice} 
                        onChange={e => setFormData({ ...formData, costPrice: e.target.value })} 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-sm focus:border-purple-500" 
                        placeholder="42.00" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estoque Inicial / Atual</label>
                      <input 
                        type="number" 
                        step="0.1" 
                        value={formData.quantity} 
                        onChange={e => setFormData({ ...formData, quantity: e.target.value })} 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-sm focus:border-purple-500" 
                        placeholder="0.0" 
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estoque Mínimo de Alerta</label>
                      <input 
                        type="number" 
                        value={formData.minStock} 
                        onChange={e => setFormData({ ...formData, minStock: e.target.value })} 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black text-sm focus:border-purple-500" 
                        placeholder="50" 
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* Aba Fiscal */
                <div className="space-y-5">
                  {/* Atalhos de NCM Comuns de Mineração */}
                  <div className="bg-purple-50/70 p-4 rounded-2xl border border-purple-100 space-y-2">
                    <div className="flex items-center gap-1.5 text-purple-800 text-xs font-black">
                      <Sparkles size={14} /> Atalho Rápido: NCMs Comuns do Setor de Calcário
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {COMMON_NCMS.map(item => (
                        <button
                          type="button"
                          key={item.code}
                          onClick={() => setFormData({ ...formData, ncm: item.code })}
                          className={`text-left p-2.5 rounded-xl border text-[10px] transition-all flex items-center justify-between ${
                            formData.ncm === item.code 
                              ? 'bg-purple-600 text-white border-purple-600 font-black shadow-md' 
                              : 'bg-white text-slate-700 border-purple-200 hover:bg-purple-100 font-bold'
                          }`}
                        >
                          <div>
                            <span className="font-black block">{item.code}</span>
                            <span className="text-[9px] opacity-80 line-clamp-1">{item.desc}</span>
                          </div>
                          {formData.ncm === item.code && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">NCM (8 Dígitos) *</label>
                      <input 
                        required 
                        type="text" 
                        value={formData.ncm} 
                        onChange={e => setFormData({ ...formData, ncm: e.target.value })} 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none focus:border-purple-500 tracking-wider" 
                        placeholder="2517.10.00" 
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CST / CSOSN ICMS Padrão *</label>
                        <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">NF-e Tag cst</span>
                      </div>
                      <select 
                        value={formData.cst} 
                        onChange={e => setFormData({ ...formData, cst: e.target.value })} 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-purple-500"
                      >
                        <optgroup label="Simples Nacional (CSOSN)">
                          {CST_ICMS_OPTIONS.filter(c => c.group === 'Simples Nacional').map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Regime Normal (CST)">
                          {CST_ICMS_OPTIONS.filter(c => c.group === 'Regime Normal').map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CFOP Padrão</label>
                      <input 
                        type="text" 
                        value={formData.cfop} 
                        onChange={e => setFormData({ ...formData, cfop: e.target.value })} 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xs outline-none focus:border-purple-500" 
                        placeholder="5101" 
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Origem da Mercadoria</label>
                      <select 
                        value={formData.origem} 
                        onChange={e => setFormData({ ...formData, origem: e.target.value })} 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-purple-500"
                      >
                        <option value="0">0 - Nacional</option>
                        <option value="1">1 - Estrangeira (Importação Direta)</option>
                        <option value="2">2 - Estrangeira (Mercado Interno)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidade Tributável SEFAZ</label>
                      <input 
                        type="text" 
                        value={formData.unidadeTributavel} 
                        onChange={e => setFormData({ ...formData, unidadeTributavel: e.target.value })} 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xs outline-none focus:border-purple-500 uppercase" 
                        placeholder="TON" 
                      />
                    </div>
                  </div>

                  {/* CST e Alíquotas PIS / COFINS / ICMS */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CST PIS Padrão</label>
                      <select 
                        value={formData.cstPis} 
                        onChange={e => setFormData({ ...formData, cstPis: e.target.value })} 
                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-purple-500"
                      >
                        {CST_PIS_COFINS_OPTIONS.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CST COFINS Padrão</label>
                      <select 
                        value={formData.cstCofins} 
                        onChange={e => setFormData({ ...formData, cstCofins: e.target.value })} 
                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none focus:border-purple-500"
                      >
                        {CST_PIS_COFINS_OPTIONS.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alíquota ICMS (%)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        value={formData.aliquotaIcms} 
                        onChange={e => setFormData({ ...formData, aliquotaIcms: e.target.value })} 
                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xs outline-none focus:border-purple-500" 
                        placeholder="0.0" 
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alíquota PIS (%)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        value={formData.aliquotaPis} 
                        onChange={e => setFormData({ ...formData, aliquotaPis: e.target.value })} 
                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xs outline-none focus:border-purple-500" 
                        placeholder="0.0" 
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alíquota COFINS (%)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        value={formData.aliquotaCofins} 
                        onChange={e => setFormData({ ...formData, aliquotaCofins: e.target.value })} 
                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xs outline-none focus:border-purple-500" 
                        placeholder="0.0" 
                      />
                    </div>
                  </div>

                  {/* Seção: Reforma Tributária (RTC - EC 132/2023) */}
                  <div className="p-5 bg-gradient-to-br from-indigo-50/70 to-purple-50/50 rounded-3xl border border-indigo-100/80 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-100">
                          <Sparkles size={16} />
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wide">Reforma Tributária (RTC — EC 132/2023)</h4>
                          <p className="text-[10px] text-indigo-600 font-bold">Enquadramento do IBS, CBS e Imposto Seletivo</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-black px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-full border border-indigo-200 uppercase tracking-wider">
                        RTC 2026/2033
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Regime / Classificação Específica</label>
                      <select 
                        value={formData.cClassTrib} 
                        onChange={e => {
                          const val = e.target.value;
                          const enq = RTC_ENQUADRAMENTOS.find(r => r.value === val);
                          setFormData({
                            ...formData,
                            cClassTrib: val,
                            reducaoBcIbs: enq ? enq.reducaoIbs.toString() : formData.reducaoBcIbs,
                            reducaoBcCbs: enq ? enq.reducaoCbs.toString() : formData.reducaoBcCbs
                          });
                        }} 
                        className="w-full p-3.5 bg-white border border-indigo-200 rounded-2xl font-bold text-xs outline-none focus:border-indigo-500 text-slate-800"
                      >
                        {RTC_ENQUADRAMENTOS.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase">Alíquota IBS (%)</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          value={formData.aliquotaIbs} 
                          onChange={e => setFormData({ ...formData, aliquotaIbs: e.target.value })} 
                          className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-500" 
                          placeholder="0.10" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase">Redução BC IBS (%)</label>
                        <input 
                          type="number" 
                          step="1" 
                          value={formData.reducaoBcIbs} 
                          onChange={e => setFormData({ ...formData, reducaoBcIbs: e.target.value })} 
                          className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-500" 
                          placeholder="60" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase">Alíquota CBS (%)</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          value={formData.aliquotaCbs} 
                          onChange={e => setFormData({ ...formData, aliquotaCbs: e.target.value })} 
                          className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-500" 
                          placeholder="0.90" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase">Redução BC CBS (%)</label>
                        <input 
                          type="number" 
                          step="1" 
                          value={formData.reducaoBcCbs} 
                          onChange={e => setFormData({ ...formData, reducaoBcCbs: e.target.value })} 
                          className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-500" 
                          placeholder="60" 
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-4 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={formData.sujeitoIs} 
                          onChange={e => setFormData({ ...formData, sujeitoIs: e.target.checked })} 
                          className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                        />
                        <span className="text-[10px] font-black text-slate-700 uppercase">Sujeito ao Imposto Seletivo (IS)</span>
                      </label>
                      {formData.sujeitoIs && (
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase">Alíquota IS:</span>
                          <input 
                            type="number" 
                            step="0.1" 
                            value={formData.aliquotaIs} 
                            onChange={e => setFormData({ ...formData, aliquotaIs: e.target.value })} 
                            className="w-20 p-2 bg-white border border-indigo-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-500" 
                            placeholder="0.0" 
                          />
                          <span className="text-[10px] font-bold text-slate-400">%</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Informações Complementares Pré-definidas no Produto */}
                  <div className="space-y-2 p-5 bg-slate-50 rounded-3xl border border-slate-200">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                        Informações Complementares Pré-definidas (Tag infCpl da NF-e)
                      </label>
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                        Auto-incorporada na Nota Fiscal
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Este texto será incluído automaticamente nos dados adicionais da nota fiscal sempre que este produto for faturado:
                    </p>

                    {/* Botões de sugestão rápida */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button 
                        type="button" 
                        onClick={() => setFormData({
                          ...formData,
                          informacoesComplementares: 'Isenção de ICMS para uso agrícola conforme Convênio ICMS 100/97.'
                        })}
                        className="px-2.5 py-1 text-[9px] font-bold bg-white text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50"
                      >
                        + Convênio ICMS 100/97
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setFormData({
                          ...formData,
                          informacoesComplementares: 'ICMS Diferido conforme art. 40 do RICMS/PA para operações internas com calcário agrícola.'
                        })}
                        className="px-2.5 py-1 text-[9px] font-bold bg-white text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50"
                      >
                        + Diferimento RICMS/PA
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setFormData({
                          ...formData,
                          informacoesComplementares: 'Produto enquadrado no regime favorecido de Insumos Agropecuários com redução de alíquota conforme Art. 9º da EC 132/2023 (Reforma Tributária).'
                        })}
                        className="px-2.5 py-1 text-[9px] font-bold bg-white text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50"
                      >
                        + Reforma Tributária (Insumo Agro)
                      </button>
                    </div>

                    <textarea 
                      rows={3} 
                      value={formData.informacoesComplementares} 
                      onChange={e => setFormData({ ...formData, informacoesComplementares: e.target.value })} 
                      className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl font-medium text-xs outline-none focus:border-purple-500 resize-none" 
                      placeholder="Insira as cláusulas legais, convênios ou informações adicionais deste produto..." 
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                {formTab === 'commercial' ? (
                  <button 
                    type="button" 
                    onClick={() => setFormTab('fiscal')} 
                    className="flex-1 py-4 bg-slate-100 text-slate-700 text-xs font-black uppercase rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                  >
                    Próximo: Área Fiscal (NCM) &rarr;
                  </button>
                ) : (
                  <button 
                    type="button" 
                    onClick={() => setFormTab('commercial')} 
                    className="py-4 px-6 bg-slate-100 text-slate-700 text-xs font-black uppercase rounded-2xl hover:bg-slate-200 transition-all"
                  >
                    &larr; Voltar
                  </button>
                )}

                <button 
                  type="submit" 
                  className="flex-1 py-4 bg-purple-600 text-white text-xs font-black uppercase rounded-2xl hover:bg-purple-700 transition-all shadow-xl shadow-purple-100"
                >
                  {editingItem ? 'Salvar Alterações do Produto' : 'Confirmar Cadastro do Produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modais Antigos de Entrada / Saída Direta */}
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
              <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-xs">
                <div className="flex justify-between gap-4 font-black text-slate-700">
                  <span>Valor total da compra</span>
                  <span className="text-amber-700">R$ {((parseFloat(qty) || 0) * (parseFloat(val) || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <p className="mt-1 text-[10px] font-medium text-slate-500">O saldo não pago ficará em aberto no Financeiro para baixas parciais.</p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fornecedor</label>
                <input type="text" value={purchaseSupplier} onChange={e => setPurchaseSupplier(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-amber-500 outline-none font-bold text-sm" placeholder="Ex.: Pedreira São José" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entrada paga agora (R$)</label>
                  <input type="number" min="0" step="0.01" value={purchaseInitialPayment} onChange={e => setPurchaseInitialPayment(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-amber-500 outline-none font-black text-lg" placeholder="0,00" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vencimento do saldo</label>
                  <input type="date" value={purchaseDueDate} onChange={e => setPurchaseDueDate(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-amber-500 outline-none font-bold text-sm" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma da entrada</label>
                <select value={purchasePaymentMethod} onChange={e => setPurchasePaymentMethod(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-amber-500 outline-none font-bold text-sm">
                  <option value="PIX">PIX</option>
                  <option value="Transferência Bancária">Transferência bancária</option>
                  <option value="Boleto Bancário">Boleto bancário</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observações</label>
                <input type="text" value={purchaseNotes} onChange={e => setPurchaseNotes(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-amber-500 outline-none font-medium text-sm" placeholder="NF, romaneio ou acordo de pagamento" />
              </div>
              <button type="submit" className="w-full py-5 bg-slate-900 text-white text-xs font-black uppercase rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-100">Confirmar Compra e Lançar Saldo</button>
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
    </div>
  );
};

export default Inventory;
