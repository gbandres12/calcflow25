
import React, { useState, useRef, useMemo } from 'react';
import { Customer, SaleOrder, Transaction, OrderStatus } from '../types';
import { 
  UserPlus, Search, Mail, Phone, ExternalLink, 
  FileUp, Database, X, Loader2, AlertCircle, 
  CheckCircle2, Download, Filter, UserCheck, AlertTriangle,
  DollarSign, ShoppingCart, ArrowUpRight, ChevronRight, Eye
} from 'lucide-react';
import { CustomerDetailsModal } from './CustomerDetailsModal';
import { QuickCustomerModal } from './QuickCustomerModal';
import { calculateOrderPayment } from './SalesOrders';

interface CustomersProps {
  customers: Customer[];
  orders?: SaleOrder[];
  transactions?: Transaction[];
  onImportCustomers: (newCustomers: Omit<Customer, 'id' | 'companyId' | 'totalSpent'>[]) => void;
  onAddCustomer?: (newCustomer: Omit<Customer, 'id' | 'companyId' | 'totalSpent'>) => void;
}

const Customers: React.FC<CustomersProps> = ({ 
  customers, 
  orders = [], 
  transactions = [],
  onImportCustomers, 
  onAddCustomer 
}) => {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDebtOnly, setFilterDebtOnly] = useState<'ALL' | 'DEBT_ONLY' | 'SETTLED_ONLY'>('ALL');
  const [importError, setImportError] = useState('');
  const [selectedCustomerForDetails, setSelectedCustomerForDetails] = useState<Customer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatBRL = (val: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Mapa de Débitos e Vendas por Cliente
  const customerFinancialStats = useMemo(() => {
    const statsMap: Record<string, { totalPurchased: number; totalPaid: number; totalDebt: number; orderCount: number }> = {};

    customers.forEach(c => {
      statsMap[c.id] = { totalPurchased: 0, totalPaid: 0, totalDebt: 0, orderCount: 0 };
    });

    orders.forEach(order => {
      if (!statsMap[order.customerId]) {
        statsMap[order.customerId] = { totalPurchased: 0, totalPaid: 0, totalDebt: 0, orderCount: 0 };
      }
      if (order.status === OrderStatus.FINALIZED) {
        const { totalPaid, remainingDebt } = calculateOrderPayment(order);
        statsMap[order.customerId].totalPurchased += order.total || 0;
        statsMap[order.customerId].totalPaid += totalPaid;
        statsMap[order.customerId].totalDebt += remainingDebt;
        statsMap[order.customerId].orderCount += 1;
      }
    });

    return statsMap;
  }, [customers, orders]);

  // Métricas Globais da Carteira de Clientes
  const walletStats = useMemo(() => {
    let totalPurchased = 0;
    let totalDebt = 0;
    let customersWithDebtCount = 0;
    let settledCustomersCount = 0;

    customers.forEach(c => {
      const stats = customerFinancialStats[c.id] || { totalPurchased: 0, totalPaid: 0, totalDebt: 0, orderCount: 0 };
      totalPurchased += stats.totalPurchased || c.totalSpent || 0;
      totalDebt += stats.totalDebt || 0;
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
  }, [customers, customerFinancialStats]);

  const [customerForm, setCustomerForm] = useState({
    name: '',
    document: '',
    email: '',
    phone: ''
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.name || !customerForm.document) return;
    if (onAddCustomer) {
      onAddCustomer(customerForm);
    } else {
      onImportCustomers([customerForm]);
    }
    setIsAddModalOpen(false);
    setCustomerForm({ name: '', document: '', email: '', phone: '' });
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const q = searchQuery.toLowerCase();
      const matchSearch = 
        c.name.toLowerCase().includes(q) ||
        c.document.includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q));

      if (!matchSearch) return false;

      const stats = customerFinancialStats[c.id] || { totalPurchased: 0, totalPaid: 0, totalDebt: 0, orderCount: 0 };
      if (filterDebtOnly === 'DEBT_ONLY' && stats.totalDebt <= 0.01) return false;
      if (filterDebtOnly === 'SETTLED_ONLY' && (stats.totalPurchased === 0 || stats.totalDebt > 0.01)) return false;

      return true;
    });
  }, [customers, searchQuery, filterDebtOnly, customerFinancialStats]);

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
        alert(`${newCustomers.length} clientes importados com sucesso!`);
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

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Gestão de Clientes</h2>
          <p className="text-slate-500 text-sm font-medium">Controle de produtores rurais, parceiros e revendas</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => { setImportError(''); setIsImportModalOpen(true); }}
            className="bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all text-sm shadow-sm"
          >
            <FileUp size={18} /> Importar Base
          </button>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="bg-purple-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-purple-700 transition-all flex items-center gap-2 shadow-lg shadow-purple-100 text-sm"
          >
            <UserPlus size={18} /> Novo Cliente
          </button>
        </div>
      </header>

      {/* Stats Rápidas da Carteira */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl"><UserCheck size={24}/></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total de Clientes</p>
               <p className="text-2xl font-black text-slate-800">{customers.length}</p>
               <p className="text-[10px] font-bold text-slate-400">Produtores & Revendas</p>
            </div>
         </div>

         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><ShoppingCart size={24}/></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Faturamento da Carteira</p>
               <p className="text-2xl font-black text-slate-800">{formatBRL(walletStats.totalPurchased)}</p>
               <p className="text-[10px] font-bold text-emerald-600 font-black">{walletStats.settledCustomersCount} cliente(s) quites</p>
            </div>
         </div>

         <div className={`p-6 rounded-[2rem] border shadow-sm flex items-center gap-4 ${
           walletStats.totalDebt > 0 
             ? 'bg-rose-50/50 border-rose-200' 
             : 'bg-white border-slate-100'
         }`}>
            <div className={`p-4 rounded-2xl ${walletStats.totalDebt > 0 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
              <AlertTriangle size={24}/>
            </div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Débito a Receber</p>
               <p className={`text-2xl font-black ${walletStats.totalDebt > 0 ? 'text-rose-700' : 'text-slate-800'}`}>
                 {formatBRL(walletStats.totalDebt)}
               </p>
               <p className="text-[10px] font-bold text-rose-600 font-black">
                 {walletStats.customersWithDebtCount} cliente(s) com débitos
               </p>
            </div>
         </div>

         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl"><CheckCircle2 size={24}/></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Taxa de Adimplência</p>
               <p className="text-2xl font-black text-slate-800">
                 {customers.length > 0 ? Math.round(((customers.length - walletStats.customersWithDebtCount) / customers.length) * 100) : 100}%
               </p>
               <p className="text-[10px] font-bold text-blue-600 font-black">Adimplência da base</p>
            </div>
         </div>
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, CPF/CNPJ, e-mail ou telefone..." 
              className="w-full pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:border-purple-500 transition-all font-medium text-sm"
            />
          </div>

          {/* Filtros de Status Financeiro */}
          <div className="flex p-1 bg-slate-100 rounded-2xl w-full md:w-auto">
            <button
              onClick={() => setFilterDebtOnly('ALL')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                filterDebtOnly === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Todos ({customers.length})
            </button>
            <button
              onClick={() => setFilterDebtOnly('DEBT_ONLY')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                filterDebtOnly === 'DEBT_ONLY' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-500 hover:text-rose-700'
              }`}
            >
              <AlertTriangle size={13} /> Com Débito ({walletStats.customersWithDebtCount})
            </button>
            <button
              onClick={() => setFilterDebtOnly('SETTLED_ONLY')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                filterDebtOnly === 'SETTLED_ONLY' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-emerald-700'
              }`}
            >
              <CheckCircle2 size={13} /> Quites ({walletStats.settledCustomersCount})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-8 py-4">Cliente / Contato</th>
                <th className="px-6 py-4">Documento</th>
                <th className="px-6 py-4 text-right">Volume Comprado</th>
                <th className="px-6 py-4 text-center">Situação Financeira</th>
                <th className="px-6 py-4 text-center">Extrato & Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center opacity-30">
                    <div className="flex flex-col items-center gap-2">
                      <UserPlus size={48} />
                      <p className="font-bold">Nenhum cliente encontrado</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map(c => {
                  const stats = customerFinancialStats[c.id] || { totalPurchased: 0, totalPaid: 0, totalDebt: 0, orderCount: 0 };
                  const totalSpent = stats.totalPurchased > 0 ? stats.totalPurchased : (c.totalSpent || 0);

                  return (
                    <tr 
                      key={c.id} 
                      onClick={() => setSelectedCustomerForDetails(c)}
                      className="hover:bg-purple-50/40 transition-colors group cursor-pointer"
                    >
                      <td className="px-8 py-5">
                        <div className="font-black text-slate-800 text-sm mb-1 uppercase tracking-tight group-hover:text-purple-700 transition-colors flex items-center gap-2">
                          {c.name}
                          {stats.orderCount > 0 && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-700">
                              {stats.orderCount} pedido(s)
                            </span>
                          )}
                        </div>
                        <div className="flex gap-4 text-[10px] font-bold text-slate-400 uppercase">
                          {c.email && (
                            <span className="flex items-center gap-1"><Mail size={12} className="text-purple-400" /> {c.email}</span>
                          )}
                          {c.phone && (
                            <span className="flex items-center gap-1"><Phone size={12} className="text-purple-400" /> {c.phone}</span>
                          )}
                          {c.city && (
                            <span className="text-slate-400 font-medium">{c.city}-{c.state || 'PA'}{c.ibgeCode ? ` · IBGE ${c.ibgeCode}` : ''}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-xs text-slate-600 font-mono font-bold bg-slate-50/30">{c.document}</td>
                      <td className="px-6 py-5 text-right font-black text-slate-900 text-sm">
                        {formatBRL(totalSpent)}
                      </td>
                      <td className="px-6 py-5 text-center">
                        {stats.totalDebt > 0.01 ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-[10px] font-black uppercase bg-rose-50 text-rose-700 border border-rose-300">
                            <AlertTriangle size={12} /> Débito: {formatBRL(stats.totalDebt)}
                          </span>
                        ) : stats.totalPurchased > 0 ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-300">
                            <CheckCircle2 size={12} /> Quitado (100%)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-[10px] font-black uppercase bg-slate-100 text-slate-500 border border-slate-200">
                            Sem Compras
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-center">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCustomerForDetails(c);
                          }}
                          className="px-4 py-2 bg-purple-50 hover:bg-purple-600 text-purple-700 hover:text-white rounded-xl transition-all font-black text-xs inline-flex items-center gap-1.5 shadow-xs"
                          title="Abrir Detalhes Consolidados do Cliente"
                        >
                          <Eye size={14} /> Ver Detalhes
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalhes Consolidados do Cliente */}
      <CustomerDetailsModal
        customer={selectedCustomerForDetails}
        isOpen={!!selectedCustomerForDetails}
        onClose={() => setSelectedCustomerForDetails(null)}
        orders={orders}
        transactions={transactions}
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
                  <p className="text-xs text-slate-400 mt-1">Colunas esperadas: Nome, Documento, Email, Telefone</p>
               </div>
            </div>

            <div className="flex gap-4">
               <button 
                  onClick={() => setIsImportModalOpen(false)}
                  className="w-full py-4 text-xs font-black uppercase text-slate-400 hover:bg-slate-50 rounded-2xl border border-slate-200 transition-all"
               >
                  Cancelar
               </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-3">
               <AlertCircle size={16} className="text-blue-500" />
               <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                 Dica: Use ponto e vírgula (;) ou vírgula (,) como separador.
               </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cadastro Rápido de Cliente */}
      <QuickCustomerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddCustomer={onAddCustomer}
        onSuccess={(created) => {
          if (!onAddCustomer) {
            onImportCustomers([created]);
          }
          setIsAddModalOpen(false);
        }}
      />
    </div>
  );
};

export default Customers;
