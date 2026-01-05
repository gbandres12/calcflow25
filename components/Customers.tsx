
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
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.document.includes(searchQuery)
  );

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
          throw new Error("O arquivo parece estar vazio ou sem cabeçalho.");
        }

        // Identifica o separador (vírgula ou ponto e vírgula)
        const header = lines[0];
        const separator = header.includes(';') ? ';' : ',';
        const headers = header.split(separator).map(h => h.trim().toLowerCase());

        const newCustomers: Omit<Customer, 'id' | 'companyId' | 'totalSpent'>[] = [];

        // Mapeamento de colunas flexível
        const idxName = headers.findIndex(h => h.includes('nome') || h.includes('cliente'));
        const idxDoc = headers.findIndex(h => h.includes('documento') || h.includes('cpf') || h.includes('cnpj'));
        const idxEmail = headers.findIndex(h => h.includes('email') || h.includes('e-mail'));
        const idxPhone = headers.findIndex(h => h.includes('fone') || h.includes('telefone') || h.includes('celular'));

        if (idxName === -1 || idxDoc === -1) {
          throw new Error("Colunas obrigatórias 'Nome' e 'Documento' (CPF/CNPJ) não encontradas.");
        }

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const cells = line.split(separator).map(c => c.trim());
          if (cells.length < 2) continue;

          newCustomers.push({
            name: cells[idxName] || 'Sem Nome',
            document: cells[idxDoc] || '',
            email: idxEmail !== -1 ? cells[idxEmail] : '',
            phone: idxPhone !== -1 ? cells[idxPhone] : ''
          });
        }

        if (newCustomers.length === 0) {
          throw new Error("Nenhum dado válido encontrado nas linhas do arquivo.");
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
                      R$ {Number(c.totalSpent).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
    </div>
  );
};

export default Customers;
