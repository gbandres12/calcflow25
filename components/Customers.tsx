
import React, { useState, useRef } from 'react';
import { Customer } from '../types';
import { 
  UserPlus, Search, Mail, Phone, ExternalLink, 
  FileUp, Database, X, Loader2, AlertCircle, 
  CheckCircle2, Download, Filter, UserCheck
} from 'lucide-react';

interface CustomersProps {
  customers: Customer[];
  onImportCustomers: (newCustomers: Omit<Customer, 'id' | 'companyId' | 'totalSpent'>[]) => void;
}

const Customers: React.FC<CustomersProps> = ({ customers, onImportCustomers }) => {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.document.includes(searchQuery)
  );

  const handleSimulateImport = () => {
    setIsImporting(true);
    // Simulação de processamento de arquivo CSV/Excel
    setTimeout(() => {
      const mockData = [
        { name: 'João da Silva (Fazenda Esperança)', document: '123.456.789-00', email: 'joao@fazenda.com', phone: '(93) 98877-6655' },
        { name: 'Agropecuária Central Barreiras', document: '12.345.678/0001-99', email: 'comercial@agrocentral.com', phone: '(77) 3611-4433' },
        { name: 'Maria Oliveira (Sítio Novo)', document: '987.654.321-11', email: 'maria@sitio.com', phone: '(93) 91122-3344' },
        { name: 'Cooperativa dos Produtores Oeste', document: '44.555.666/0001-22', email: 'contato@coopoeste.org', phone: '(77) 3612-9988' },
      ];

      onImportCustomers(mockData);
      setIsImporting(false);
      setIsImportModalOpen(false);
    }, 2000);
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
            onClick={() => setIsImportModalOpen(true)}
            className="bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all text-sm shadow-sm"
          >
            <FileUp size={18} /> Importar Base
          </button>
          <button className="bg-purple-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-purple-700 transition-all flex items-center gap-2 shadow-lg shadow-purple-100 text-sm">
            <UserPlus size={18} /> Novo Cliente
          </button>
        </div>
      </header>

      {/* Stats Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl"><UserCheck size={24}/></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total de Clientes</p>
               <p className="text-2xl font-black text-slate-800">{customers.length}</p>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><CheckCircle2 size={24}/></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ativos no Mês</p>
               <p className="text-2xl font-black text-slate-800">{Math.floor(customers.length * 0.7)}</p>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl"><Download size={24}/></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Novos (30 dias)</p>
               <p className="text-2xl font-black text-slate-800">12</p>
            </div>
         </div>
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex flex-col md:flex-row gap-4 items-center">
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
          <div className="flex gap-2">
            <button className="px-4 py-3 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-purple-600 transition-all flex items-center gap-2 text-sm font-bold">
               <Filter size={18} /> Filtros
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-8 py-4">Cliente / Contato</th>
                <th className="px-6 py-4">Documento</th>
                <th className="px-6 py-4 text-right">Volume Transacionado</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-20 text-center opacity-30">
                    <div className="flex flex-col items-center gap-2">
                      <UserPlus size={48} />
                      <p className="font-bold">Nenhum cliente encontrado</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="font-black text-slate-800 text-sm mb-1 uppercase tracking-tight">{c.name}</div>
                      <div className="flex gap-4 text-[10px] font-bold text-slate-400 uppercase">
                        <span className="flex items-center gap-1"><Mail size={12} className="text-purple-400" /> {c.email}</span>
                        <span className="flex items-center gap-1"><Phone size={12} className="text-purple-400" /> {c.phone}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-xs text-slate-500 font-mono font-bold bg-slate-50/30">{c.document}</td>
                    <td className="px-6 py-5 text-right font-black text-slate-900 text-sm">
                      R$ {c.totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-center gap-1">
                        <button className="p-2 text-slate-300 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all" title="Ver Perfil">
                          <ExternalLink size={18} />
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

            <div className="space-y-4">
               <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-[2.5rem] p-12 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer group"
                >
                  <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.xls,.xlsx" />
                  <FileUp size={32} className="mx-auto text-slate-300 group-hover:text-blue-400 mb-4 transition-colors" />
                  <p className="text-sm font-black text-slate-700">Selecione o arquivo de clientes</p>
                  <p className="text-xs text-slate-400 mt-1">Colunas recomendadas: Nome, CPF/CNPJ, E-mail, Fone</p>
               </div>
            </div>

            <div className="flex gap-4">
               <button 
                  onClick={() => setIsImportModalOpen(false)}
                  className="flex-1 py-4 text-xs font-black uppercase text-slate-400 hover:bg-slate-50 rounded-2xl border border-slate-200 transition-all"
               >
                  Cancelar
               </button>
               <button 
                  onClick={handleSimulateImport}
                  disabled={isImporting}
                  className="flex-[2] py-4 bg-blue-600 text-white text-xs font-black uppercase rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
               >
                  {isImporting ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} />}
                  {isImporting ? 'Processando Base...' : 'Validar e Importar'}
               </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-3">
               <AlertCircle size={16} className="text-blue-500" />
               <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                 O sistema verificará duplicidades por CPF/CNPJ automaticamente.
               </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
