import React, { useState } from 'react';
import { Employee } from '../types';
import { Plus, Trash2 } from 'lucide-react';

interface EmployeesPayrollPageProps {
  employees: Employee[];
  onSave: (employee: Employee) => void;
  onDelete: (id: string) => void;
}

const empty: Omit<Employee, 'id'> = {
  name: '',
  document: '',
  jobTitle: '',
  pixKey: '',
  bankName: '',
  agency: '',
  accountNumber: '',
  depositAmount: 0,
  status: 'Ativo',
};

export const EmployeesPayrollPage: React.FC<EmployeesPayrollPageProps> = ({ employees, onSave, onDelete }) => {
  const [draft, setDraft] = useState(empty);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name || draft.depositAmount <= 0) return;
    onSave({ ...draft, id: `emp-${Date.now()}` });
    setDraft(empty);
  };

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-slate-800">Funcionários e depósitos</h2>
        <p className="text-xs text-slate-500">Cadastro de folha separado do login. Cada competência abre conta a pagar; depósito real sai do caixa.</p>
      </header>
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <input className="p-3 border border-slate-200 rounded-xl text-sm font-semibold" placeholder="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input className="p-3 border border-slate-200 rounded-xl text-sm" placeholder="CPF" value={draft.document || ''} onChange={(e) => setDraft({ ...draft, document: e.target.value })} />
        <input className="p-3 border border-slate-200 rounded-xl text-sm" placeholder="Cargo" value={draft.jobTitle || ''} onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })} />
        <input className="p-3 border border-slate-200 rounded-xl text-sm" placeholder="Chave PIX" value={draft.pixKey || ''} onChange={(e) => setDraft({ ...draft, pixKey: e.target.value })} />
        <input className="p-3 border border-slate-200 rounded-xl text-sm" placeholder="Banco" value={draft.bankName || ''} onChange={(e) => setDraft({ ...draft, bankName: e.target.value })} />
        <input className="p-3 border border-slate-200 rounded-xl text-sm" placeholder="Agência / conta" value={draft.accountNumber || ''} onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value, agency: draft.agency })} />
        <input type="number" step="0.01" className="p-3 border border-slate-200 rounded-xl text-sm font-semibold" placeholder="Valor do depósito" value={draft.depositAmount || ''} onChange={(e) => setDraft({ ...draft, depositAmount: Number(e.target.value) })} />
        <button type="submit" className="p-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase flex items-center justify-center gap-1">
          <Plus size={14} /> Cadastrar
        </button>
      </form>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Funcionário</th>
              <th className="text-left px-4 py-3">Depósito</th>
              <th className="text-left px-4 py-3">PIX / Banco</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <p className="font-semibold">{emp.name}</p>
                  <p className="text-[11px] text-slate-500">{emp.jobTitle} {emp.document ? `• ${emp.document}` : ''}</p>
                </td>
                <td className="px-4 py-3 font-black">{emp.depositAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td className="px-4 py-3 text-slate-600 text-xs">{emp.pixKey || `${emp.bankName || ''} ${emp.accountNumber || ''}`}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => onDelete(emp.id)} className="text-rose-600"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {employees.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Nenhum funcionário cadastrado para depósito.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};
