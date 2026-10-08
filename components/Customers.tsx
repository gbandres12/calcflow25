
import React, { useState, useRef, useMemo } from 'react';
import { Customer, SaleOrder, Transaction, OrderStatus } from '../types';
import { 
  UserPlus, Search, Mail, Phone, ExternalLink, 
  FileUp, Database, X, Loader2, AlertCircle, 
  CheckCircle2, Download, Filter, UserCheck, AlertTriangle,
  DollarSign, ShoppingCart, ArrowUpRight, ChevronRight, Eye,
  Edit3, Trash2
} from 'lucide-react';
import { CustomerDetailsModal } from './CustomerDetailsModal';
import { QuickCustomerModal } from './QuickCustomerModal';
import { calculateOrderPayment } from './SalesOrders';
import { isFiscalOnlyOrder } from '../services/saleNfe';
import { useToast } from './ui/Toast';

interface CustomersProps {
  customers: Customer[];
  orders?: SaleOrder[];
  transactions?: Transaction[];
  onImportCustomers: (newCustomers: Omit<Customer, 'id' | 'companyId' | 'totalSpent'>[]) => void;
  onAddCustomer?: (newCustomer: Omit<Customer, 'id' | 'companyId' | 'totalSpent'>) => Customer | void;
  onUpdateCustomer?: (customer: Customer) => void;
  onDeleteCustomer?: (customerId: string) => void;
}

const Customers: React.FC<CustomersProps> = ({ 
  customers, 
  orders = [], 
  transactions = [],
  onImportCustomers, 
  onAddCustomer,
  onUpdateCustomer,
  onDeleteCustomer
}) => {
  const toast = useToast();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDebtOnly, setFilterDebtOnly] = useState<'ALL' | 'DEBT_ONLY' | 'SETTLED_ONLY' | 'NO_PURCHASE'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [importError, setImportError] = useState('');
  const [selectedCustomerForDetails, setSelectedCustomerForDetails] = useState<Customer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatBRL = (val?: number) => (Number.isFinite(val) ? val!.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00');

  // Lista segura de clientes
  const safeCustomerList = useMemo(() => {
    return Array.isArray(customers) ? customers.filter(c => c && typeof c === 'object' && c.id) : [];
  }, [customers]);

  // Mapa de Débitos e Vendas por Cliente
  const customerFinancialStats = useMemo(() => {
    const statsMap: Record<string, { totalPurchased: number; totalPaid: number; totalDebt: number; orderCount: number }> = {};
    const safeOrders = Array.isArray(orders) ? orders : [];

    safeCustomerList.forEach(c => {
      if (c && c.id) {
        statsMap[c.id] = { totalPurchased: 0, totalPaid: 0, totalDebt: 0, orderCount: 0 };
      }
    });

    safeOrders.forEach(order => {
      if (!order || !order.customerId) return;
      if (isFiscalOnlyOrder(order)) return;
      if (!statsMap[order.customerId]) {
        statsMap[order.customerId] = { totalPurchased: 0, totalPaid: 0, totalDebt: 0, orderCount: 0 };
      }
      if (order.status === OrderStatus.FINALIZED) {
        const { totalPaid, remainingDebt } = calculateOrderPayment(order);
        statsMap[order.customerId].totalPurchased += (Number(order.total) || 0);
        statsMap[order.customerId].totalPaid += (Number(totalPaid) || 0);
        statsMap[order.customerId].totalDebt += (Number(remainingDebt) || 0);
        statsMap[order.customerId].orderCount += 1;
      }
    });

    return statsMap;
  }, [safeCustomerList, orders]);

  // Métricas Globais da Carteira de Clientes
  const walletStats = useMemo(() => {
    let totalPurchased = 0;
    let totalDebt = 0;
    let customersWithDebtCount = 0;
    let settledCustomersCount = 0;

    safeCustomerList.forEach(c => {
      if (!c || !c.id) return;
      const stats = customerFinancialStats[c.id] || { totalPurchased: 0, totalPaid: 0, totalDebt: 0, orderCount: 0 };
      totalPurchased += Number(stats.totalPurchased || c.totalSpent || 0);
      totalDebt += Number(stats.totalDebt || 0);
      if (stats.totalDebt > 0.01) {
        customersWithDebtCount += 1;
      } else if (stats.totalPurchased > 0) {
        settledCustomersCount += 1;
      }
    });

    return {
      totalPurchased,
      totalDebt,
      customersWithDebtCount,
      settledCustomersCount
    };
  }, [safeCustomerList, customerFinancialStats]);

  const filteredCustomers = useMemo(() => {
    const q = (searchQuery || '').toLowerCase().trim();

    return safeCustomerList.filter(c => {
      if (!c) return false;
      const cName = String(c.name || '').toLowerCase();
      const cDoc = String(c.document || '').toLowerCase();
      const cEmail = String(c.email || '').toLowerCase();
      const cPhone = String(c.phone || '').toLowerCase();
      const cCity = String(c.city || '').toLowerCase();

      const matchSearch = !q ||
        cName.includes(q) ||
        cDoc.includes(q) ||
        cEmail.includes(q) ||
        cPhone.includes(q) ||
        cCity.includes(q);

      if (!matchSearch) return false;

      const stats = customerFinancialStats[c.id] || { totalPurchased: 0, totalPaid: 0, totalDebt: 0, orderCount: 0 };
      if (filterDebtOnly === 'DEBT_ONLY' && stats.totalDebt <= 0.01) return false;
      if (filterDebtOnly === 'SETTLED_ONLY' && (stats.totalPurchased === 0 || stats.totalDebt > 0.01)) return false;
      if (filterDebtOnly === 'NO_PURCHASE' && stats.totalPurchased > 0) return false;

      return true;
    });
  }, [safeCustomerList, searchQuery, filterDebtOnly, customerFinancialStats]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportError('');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/);
        
        if (lines.length < 2) {
          throw new Error("O arquivo parece estar vazio ou sem conteúdo suficiente.");
        }

        const parseCSVLine = (line: string, sep: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' || char === "'") {
              inQuotes = !inQuotes;
            } else if (char === sep && !inQuotes) {
              result.push(current.trim().replace(/^["']|["']$/g, ''));
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current.trim().replace(/^["']|["']$/g, ''));
          return result;
        };

        // Procurar dinamicamente a linha de cabeçalho (pode haver títulos como "Tabela 1" nas primeiras linhas)
        let headerIndex = -1;
        let separator = ';';
        let headers: string[] = [];

        for (let i = 0; i < Math.min(lines.length, 25); i++) {
          const candidateLine = lines[i].trim();
          if (!candidateLine) continue;

          const candidateSep = candidateLine.includes(';') ? ';' : (candidateLine.includes('\t') ? '\t' : ',');
          const candidateHeaders = candidateLine.split(candidateSep).map(h => h.trim().toLowerCase());

          const hasName = candidateHeaders.some(h => 
            h.includes('nome') || h.includes('razão') || h.includes('razao') || h.includes('cliente')
          );
          const hasDoc = candidateHeaders.some(h => 
            h.includes('cpf') || h.includes('cnpj') || h.includes('documento') || h.includes('doc')
          );

          if (hasName || hasDoc) {
            headerIndex = i;
            separator = candidateSep;
            headers = candidateHeaders;
            break;
          }
        }

        if (headerIndex === -1) {
          throw new Error("Não foi possível identificar o cabeçalho do arquivo. Certifique-se de que existem colunas como Nome/Razão Social, CPF ou CNPJ.");
        }

        // Mapeamento flexível de índices
        const idxName = headers.findIndex(h => h.includes('nome/razão') || h.includes('nome / razão') || h.includes('razão social') || h.includes('razao social') || h.includes('nome') || h.includes('cliente'));
        const idxFantasia = headers.findIndex(h => h.includes('fantasia') || h.includes('apelido'));
        const idxCPF = headers.findIndex(h => h === 'cpf' || h.startsWith('cpf') || h.endsWith('cpf'));
        const idxCNPJ = headers.findIndex(h => h === 'cnpj' || h.startsWith('cnpj') || h.endsWith('cnpj'));
        const idxDoc = headers.findIndex(h => h.includes('documento') || h === 'doc' || h.includes('cpf/cnpj'));
        const idxIE = headers.findIndex(h => h === 'ie' || h.includes('inscrição') || h.includes('inscricao'));
        const idxCellular = headers.findIndex(h => h.includes('celular'));
        const idxPhone = headers.findIndex(h => h.includes('telefone') || h.includes('fone') || h.includes('contato'));
        const idxFax = headers.findIndex(h => h.includes('fax'));
        const idxEmail = headers.findIndex(h => h.includes('email') || h.includes('e-mail'));
        const idxAddress = headers.findIndex(h => h.includes('endereço') || h.includes('endereco') || h.includes('rua') || h.includes('logradouro'));
        const idxNumber = headers.findIndex(h => h.includes('número') || h.includes('numero') || h === 'num');
        const idxNeighborhood = headers.findIndex(h => h.includes('bairro'));
        const idxCity = headers.findIndex(h => h.includes('cidade') || h.includes('município') || h.includes('municipio'));
        const idxState = headers.findIndex(h => h.includes('estado') || h === 'uf');
        const idxZip = headers.findIndex(h => h.includes('cep'));
        const idxIbge = headers.findIndex(h => h.includes('ibge') || h.includes('código município') || h.includes('codigo municipio') || h.includes('cod municipio'));

        const newCustomers: Omit<Customer, 'id' | 'companyId' | 'totalSpent'>[] = [];

        for (let i = headerIndex + 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const cells = parseCSVLine(line, separator);
          if (cells.length < 2) continue;

          const rawName = (idxName !== -1 ? cells[idxName] : '') || (idxFantasia !== -1 ? cells[idxFantasia] : '');
          if (!rawName) continue;

          const cpfVal = idxCPF !== -1 ? cells[idxCPF] : '';
          const cnpjVal = idxCNPJ !== -1 ? cells[idxCNPJ] : '';
          const docVal = idxDoc !== -1 ? cells[idxDoc] : '';

          const document = cpfVal || cnpjVal || docVal || '';
          const phone = (idxCellular !== -1 ? cells[idxCellular] : '') || (idxPhone !== -1 ? cells[idxPhone] : '') || (idxFax !== -1 ? cells[idxFax] : '');
          
          let tipoPessoa: 'PJ' | 'PF' | 'PRODUTOR' = 'PRODUTOR';
          const cleanDoc = document.replace(/\D/g, '');
          if (cleanDoc.length === 14 || cnpjVal) {
            tipoPessoa = 'PJ';
          } else if (cleanDoc.length === 11 || cpfVal) {
            tipoPessoa = 'PF';
          }

          newCustomers.push({
            name: rawName,
            document: document,
            email: idxEmail !== -1 ? cells[idxEmail] : '',
            phone: phone,
            tipoPessoa: tipoPessoa,
            ie: idxIE !== -1 ? cells[idxIE] : '',
            street: idxAddress !== -1 ? cells[idxAddress] : '',
            number: idxNumber !== -1 ? cells[idxNumber] : '',
            neighborhood: idxNeighborhood !== -1 ? cells[idxNeighborhood] : '',
            city: idxCity !== -1 ? cells[idxCity] : '',
            state: idxState !== -1 ? cells[idxState] : '',
            zipCode: idxZip !== -1 ? cells[idxZip] : '',
            ibgeCode: idxIbge !== -1 ? String(cells[idxIbge] || '').replace(/\D/g, '') : ''
          });
        }

        if (newCustomers.length === 0) {
          throw new Error("Nenhum cliente válido encontrado nas linhas do arquivo.");
        }

        onImportCustomers(newCustomers);
        setIsImportModalOpen(false);
        toast.push(`${newCustomers.length} clientes importados com sucesso!`, 'success');
      } catch (err: any) {
        setImportError(err.message || "Erro ao processar arquivo.");
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      setImportError("Erro ao ler o arquivo.");
      setIsImporting(false);
    };

    reader.readAsText(file);
  };

  const noPurchaseCount = safeCustomerList.filter(c => !(customerFinancialStats[c.id]?.totalPurchased > 0)).length;
  const adimplencia = safeCustomerList.length > 0 ? Math.round(((safeCustomerList.length - walletStats.customersWithDebtCount) / safeCustomerList.length) * 100) : 100;
  const paidShare = walletStats.totalPurchased > 0 ? Math.min(100, ((walletStats.totalPurchased - walletStats.totalDebt) / walletStats.totalPurchased) * 100) : 0;
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedCustomers = filteredCustomers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const splitCents = (v: number) => {
    const [int, dec] = formatBRL(v).split(',');
    return <>{int}<span className="text-lg text-slate-400 font-semibold">,{dec}</span></>;
  };
  const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const avatarTone = (c: Customer) => c.tipoPessoa === 'PJ' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700';
  const categoryOf = (c: Customer) => {
    if (c.tipoPessoa === 'PJ') return { label: 'PJ / Revenda', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    if (c.tipoPessoa === 'PF') return { label: 'Pessoa Física', cls: 'bg-slate-50 text-slate-700 border-slate-200' };
    return { label: 'Produtor Rural', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
  };
  const filterChips: { key: typeof filterDebtOnly; label: string; count: number; active: string; idle: string; dot?: string }[] = [
    { key: 'ALL', label: 'Todos', count: safeCustomerList.length, active: 'bg-slate-900 text-white border-slate-900', idle: 'bg-white text-slate-700 border-slate-200' },
    { key: 'DEBT_ONLY', label: 'Com Débito', count: walletStats.customersWithDebtCount, active: 'bg-rose-600 text-white border-rose-600', idle: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
    { key: 'SETTLED_ONLY', label: 'Quites', count: walletStats.settledCustomersCount, active: 'bg-emerald-600 text-white border-emerald-600', idle: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    { key: 'NO_PURCHASE', label: 'Sem Compras', count: noPurchaseCount, active: 'bg-slate-700 text-white border-slate-700', idle: 'bg-white text-slate-600 border-slate-200' }
  ];

  const exportCsv = () => {
    const rows = [['Nome', 'Documento', 'Cidade', 'UF', 'Telefone', 'E-mail', 'Comprado', 'Débito']];
    filteredCustomers.forEach(c => {
      const st = customerFinancialStats[c.id];
      rows.push([c.name || '', c.document || '', c.city || '', c.state || '', c.phone || '', c.email || '', String((st?.totalPurchased || 0).toFixed(2)).replace('.', ','), String((st?.totalDebt || 0).toFixed(2)).replace('.', ',')]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'clientes.csv'; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Gestão de Clientes</h2>
          <p className="text-slate-500 text-sm mt-1">Controle de produtores rurais, parceiros comerciais e revendas autorizadas</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => { setImportError(''); setIsImportModalOpen(true); }}
            className="bg-white border border-slate-300 text-slate-800 px-4 py-2.5 rounded-lg font-semibold flex items-center gap-2 hover:bg-slate-50 transition-all text-sm shadow-sm"
          >
            <FileUp size={17} /> Importar Base
          </button>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="bg-emerald-800 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-emerald-900 transition-all flex items-center gap-2 shadow-sm text-sm"
          >
            <UserPlus size={17} /> Novo Cliente
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total de Clientes</p>
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100"><UserCheck size={20}/></div>
          </div>
          <p className="text-3xl font-bold text-slate-900 -mt-2">{safeCustomerList.length}</p>
          <div className="flex justify-between text-sm text-slate-500 border-t border-slate-100 mt-4 pt-3">
            <span>Produtores & Revendas</span>
            <span className="text-slate-700">{walletStats.customersWithDebtCount + walletStats.settledCustomersCount} com compras</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Faturamento da Carteira</p>
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100"><ShoppingCart size={20}/></div>
          </div>
          <p className="text-3xl font-bold text-slate-900 -mt-2 tracking-tight">{splitCents(walletStats.totalPurchased)}</p>
          <div className="flex justify-between text-sm mt-4"><span className="text-emerald-700 font-medium">{walletStats.settledCustomersCount} cliente(s) quites</span><span className="text-slate-400">{paidShare.toFixed(1).replace('.', ',')}% realizado</span></div>
          <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-emerald-600 rounded-full" style={{ width: `${paidShare}%` }} /></div>
        </div>

        <div className={`p-5 rounded-2xl border shadow-sm ${walletStats.totalDebt > 0 ? 'bg-rose-50/50 border-rose-200' : 'bg-white border-slate-200'}`}>
          <div className="flex justify-between items-start">
            <p className={`text-xs font-semibold uppercase tracking-wider ${walletStats.totalDebt > 0 ? 'text-rose-700' : 'text-slate-500'}`}>Débito a Receber</p>
            <div className={`p-2.5 rounded-xl border ${walletStats.totalDebt > 0 ? 'bg-rose-100 text-rose-600 border-rose-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}><AlertTriangle size={20}/></div>
          </div>
          <p className={`text-3xl font-bold -mt-2 tracking-tight ${walletStats.totalDebt > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{splitCents(walletStats.totalDebt)}</p>
          <div className="flex justify-between text-sm mt-4"><span className="text-rose-600 font-medium">{walletStats.customersWithDebtCount} cliente(s) com débitos</span>{walletStats.totalDebt > 0 && <span className="text-rose-500">Crítico</span>}</div>
          <div className="h-1.5 bg-rose-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-rose-500 rounded-full" style={{ width: `${walletStats.totalPurchased > 0 ? Math.min(100, walletStats.totalDebt / walletStats.totalPurchased * 100) : 0}%` }} /></div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Taxa de Adimplência</p>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100"><CheckCircle2 size={20}/></div>
          </div>
          <p className="text-3xl font-bold text-slate-900 -mt-2">{adimplencia}% <span className={`text-sm font-medium ${adimplencia >= 95 ? 'text-emerald-700' : 'text-amber-600'}`}>{adimplencia >= 95 ? 'Excepcional' : 'Atenção'}</span></p>
          <div className="flex justify-between text-sm mt-4"><span className="text-blue-700 font-medium">Adimplência da base</span><span className="text-slate-400">Meta: 95%</span></div>
          <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-blue-600 rounded-full" style={{ width: `${adimplencia}%` }} /></div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="Buscar por nome, CPF/CNPJ, e-mail ou telefone..." 
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50/60 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:bg-white transition-all text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filterChips.map(chip => (
            <button
              key={chip.key}
              onClick={() => { setFilterDebtOnly(chip.key); setPage(1); }}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium border flex items-center gap-2 transition-all ${filterDebtOnly === chip.key ? chip.active : chip.idle}`}
            >
              {chip.dot && <span className={`w-1.5 h-1.5 rounded-full ${filterDebtOnly === chip.key ? 'bg-white' : chip.dot}`} />}
              {chip.label}
              <span className={`text-xs px-1.5 rounded-full ${filterDebtOnly === chip.key ? 'bg-white/20' : 'bg-black/5'}`}>{chip.count}</span>
            </button>
          ))}
          <button onClick={exportCsv} className="px-3.5 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-700 flex items-center gap-2 hover:bg-slate-50">
            <Download size={15} /> Exportar Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <th className="px-5 py-4">Cliente / Contato</th>
                <th className="px-3 py-4">Documento</th>
                <th className="px-3 py-4">Categoria</th>
                <th className="px-3 py-4 text-right">Volume Comprado</th>
                <th className="px-3 py-4 text-center">Situação Financeira</th>
                <th className="px-3 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <UserPlus size={40} />
                      <p className="font-medium">Nenhum cliente encontrado</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedCustomers.map(c => {
                  const stats = customerFinancialStats[c.id] || { totalPurchased: 0, totalPaid: 0, totalDebt: 0, orderCount: 0 };
                  const totalSpent = stats.totalPurchased > 0 ? stats.totalPurchased : (c.totalSpent || 0);
                  const hasDebt = stats.totalDebt > 0.01;
                  const cat = categoryOf(c);

                  return (
                    <tr 
                      key={c.id} 
                      onClick={() => setSelectedCustomerForDetails(c)}
                      className={`transition-colors group cursor-pointer ${hasDebt ? 'bg-rose-50/40 hover:bg-rose-50' : 'hover:bg-slate-50'}`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className={`w-9 h-9 shrink-0 rounded-full grid place-items-center text-xs font-bold ${hasDebt ? 'bg-rose-100 text-rose-700' : avatarTone(c)}`}>{initials(c.name || '')}</span>
                          <div className="min-w-[220px]">
                            <div className="font-bold text-slate-900 text-sm uppercase tracking-tight leading-snug group-hover:text-emerald-800 transition-colors">
                              {c.name || 'Cliente Sem Razão Social'}
                            </div>
                            <div className="flex flex-wrap gap-x-3 text-xs text-slate-500 uppercase mt-0.5">
                              {c.city && <span>{c.city}-{c.state || 'PA'}{c.ibgeCode ? ` · IBGE ${c.ibgeCode}` : ''}</span>}
                              {!c.city && c.phone && <span className="flex items-center gap-1"><Phone size={11} /> {c.phone}</span>}
                              {!c.city && !c.phone && c.email && <span className="flex items-center gap-1 normal-case"><Mail size={11} /> {c.email}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-700 font-mono whitespace-nowrap">{c.document || '—'}</td>
                      <td className="px-3 py-4"><span className={`text-xs font-medium px-2 py-1 rounded-md border whitespace-nowrap ${cat.cls}`}>{cat.label}</span></td>
                      <td className="px-3 py-4 text-right whitespace-nowrap">
                        <div className="font-bold text-slate-900 text-sm">{formatBRL(totalSpent)}</div>
                        <div className={`text-xs ${hasDebt ? 'text-rose-600 font-medium' : stats.totalPurchased > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                          {hasDebt ? `Saldo: ${formatBRL(stats.totalDebt)}` : stats.totalPurchased > 0 ? '100% Pago' : `${stats.orderCount} pedido(s)`}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-center">
                        {hasDebt ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Débito pendente
                          </span>
                        ) : stats.totalPurchased > 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Quitado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Sem compras
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setSelectedCustomerForDetails(c); }}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 border transition-all ${hasDebt ? 'bg-rose-600 border-rose-600 text-white hover:bg-rose-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                            title="Ver Detalhes e Extrato"
                          >
                            {hasDebt ? <DollarSign size={14} /> : <Eye size={14} />}
                            <span className="hidden 2xl:inline">{hasDebt ? 'Cobrança' : 'Detalhes'}</span>
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setCustomerToEdit(c); }}
                            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
                            title="Editar Cadastro do Cliente"
                          >
                            <Edit3 size={15} />
                          </button>
                          {onDeleteCustomer && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); setCustomerToDelete(c); }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                              title="Excluir Cliente"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50/40 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            Mostrando
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="border border-slate-200 rounded-md px-2 py-1 bg-white">
              {[20, 50, 100].map(n => <option key={n} value={n}>{n} linhas</option>)}
            </select>
            de <b className="text-slate-900">{filteredCustomers.length}</b> clientes encontrados
          </div>
          <div className="flex items-center gap-1.5">
            <button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="px-3 py-1.5 rounded-md border border-slate-200 bg-white disabled:opacity-40">Anterior</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(n => n === 1 || n === totalPages || Math.abs(n - currentPage) <= 1)
              .map((n, i, arr) => (
                <React.Fragment key={n}>
                  {i > 0 && n - arr[i - 1] > 1 && <span className="px-1 text-slate-400">…</span>}
                  <button onClick={() => setPage(n)} className={`min-w-9 px-2.5 py-1.5 rounded-md border ${n === currentPage ? 'bg-emerald-800 border-emerald-800 text-white' : 'bg-white border-slate-200'}`}>{n}</button>
                </React.Fragment>
              ))}
            <button disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} className="px-3 py-1.5 rounded-md border border-slate-200 bg-white disabled:opacity-40">Próxima</button>
          </div>
        </div>
      </div>

      {/* Modal de Detalhes Consolidados do Cliente */}
      <CustomerDetailsModal
        customer={selectedCustomerForDetails}
        isOpen={!!selectedCustomerForDetails}
        onClose={() => setSelectedCustomerForDetails(null)}
        orders={orders}
        transactions={transactions}
        onEditCustomer={(cust) => {
          setSelectedCustomerForDetails(null);
          setCustomerToEdit(cust);
        }}
      />

      {/* Modal Importação de Clientes */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] p-10 shadow-2xl space-y-8 animate-in zoom-in-95">
            <div className="text-center space-y-4">
               <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                  <Database size={36} />
               </div>
               <div>
                  <h3 className="text-2xl font-black text-slate-800 tracking-tight">Importar Carteira</h3>
                  <p className="text-sm text-slate-500 font-medium px-8">Suba sua lista de clientes (CSV ou Excel) para migração rápida de base.</p>
               </div>
            </div>

            {importError && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600">
                <AlertCircle size={20} />
                <p className="text-xs font-bold uppercase">{importError}</p>
              </div>
            )}

            <div className="space-y-4">
               <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-[2.5rem] p-12 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer group"
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".csv" 
                    onChange={handleFileChange}
                  />
                  {isImporting ? (
                    <Loader2 size={32} className="mx-auto text-blue-500 animate-spin mb-4" />
                  ) : (
                    <FileUp size={32} className="mx-auto text-slate-300 group-hover:text-blue-400 mb-4 transition-colors" />
                  )}
                  <p className="text-sm font-black text-slate-700">
                    {isImporting ? 'Lendo arquivo...' : 'Selecione o arquivo CSV'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Colunas esperadas: Nome, Documento, Email, Telefone</p>
               </div>
            </div>

            <div className="flex gap-4">
               <button 
                  onClick={() => setIsImportModalOpen(false)}
                  className="w-full py-4 text-xs font-black uppercase text-slate-500 hover:bg-slate-50 rounded-2xl border border-slate-200 transition-all"
               >
                  Cancelar
               </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-3">
               <AlertCircle size={16} className="text-blue-500" />
               <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                 Dica: Use ponto e vírgula (;) ou vírgula (,) como separador.
               </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cadastro / Edição de Cliente */}
      <QuickCustomerModal
        isOpen={isAddModalOpen || !!customerToEdit}
        customerToEdit={customerToEdit}
        onClose={() => {
          setIsAddModalOpen(false);
          setCustomerToEdit(null);
        }}
        onAddCustomer={onAddCustomer}
        onUpdateCustomer={onUpdateCustomer}
        onSuccess={(cust) => {
          if (!customerToEdit && !onAddCustomer) {
            onImportCustomers([cust]);
          }
          setIsAddModalOpen(false);
          setCustomerToEdit(null);
        }}
      />

      {/* Modal de Confirmação de Exclusão */}
      {customerToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[130] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-100 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800">Excluir Cliente</h3>
                <p className="text-xs text-slate-500">Confirmação de exclusão da base</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 font-medium">
              Tem certeza que deseja remover o cliente <span className="font-bold text-slate-900">{customerToDelete.name}</span>?
            </p>

            {customerFinancialStats[customerToDelete.id]?.totalDebt > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-bold">
                <AlertTriangle size={16} />
                <span>Atenção: Este cliente possui débito pendente de {formatBRL(customerFinancialStats[customerToDelete.id].totalDebt)}.</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCustomerToDelete(null)}
                className="flex-1 py-2.5 text-xs font-black uppercase text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteCustomer && customerToDelete) {
                    onDeleteCustomer(customerToDelete.id);
                  }
                  setCustomerToDelete(null);
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs uppercase shadow-md shadow-rose-200 transition-all"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
