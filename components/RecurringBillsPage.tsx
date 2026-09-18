import React, { useState } from 'react';
import { RecurringBill, CostCenter, Category, FinancialAccount } from '../types';
import { Plus, Trash2 } from 'lucide-react';

interface RecurringBillsPageProps {
  bills: RecurringBill[];
  categories: Category[];
  costCenters: CostCenter[];
  accounts: FinancialAccount[];
  onSave: (bill: RecurringBill) => void;
  onDelete: (id: string) => void;
}

const empty = (accounts: FinancialAccount[]): Omit<RecurringBill, 'id'> => ({
  description: '',
  amount: 0,
  dueDay: 10,
  frequency: 'monthly',
  category: 'Energia Elétrica (Alta Tensão)',
  accountId: accounts[0]?.id,
  contactName: '',
  active: true,
});

export const RecurringBillsPage: React.FC<RecurringBillsPageProps> = ({
  bills, categories, costCenters, accounts, onSave, onDelete
}) => {
  const [draft, setDraft] = useState<Omit<RecurringBill, 'id'>>(empty(accounts));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.description || draft.amount <= 0) return;
    onSave({ ...draft, id: `rec-${Date.now()}` });
    setDraft(empty(accounts));
  };

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-slate-800">Contas recorrentes</h2>
        <p className="text-xs text-slate-500">Gera título a pagar na competência. Caixa só quando o pagamento for confirmado.</p>
      </header>
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input className="md:col-span-2 p-3 border border-slate-200 rounded-xl text-sm font-semibold" placeholder="Descrição (aluguel, energia…)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <input type="number" step="0.01" className="p-3 border border-slate-200 rounded-xl text-sm font-semibold" placeholder="Valor" value={draft.amount || ''} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} />
        <input type="number" min={1} max={31} className="p-3 border border-slate-200 rounded-xl text-sm font-semibold" placeholder="Dia venc." value={draft.dueDay} onChange={(e) => setDraft({ ...draft, dueDay: Number(e.target.value) })} />
        <select className="p-3 border border-slate-200 rounded-xl text-sm" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
          {categories.filter((c) => c.type === 'OUTFLOW').map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select className="p-3 border border-slate-200 rounded-xl text-sm" value={draft.costCenterId || ''} onChange={(e) => setDraft({ ...draft, costCenterId: e.target.value })}>
          <option value="">Centro de custo</option>
          {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="p-3 border border-slate-200 rounded-xl text-sm" value={draft.accountId || ''} onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input className="p-3 border border-slate-200 rounded-xl text-sm" placeholder="Fornecedor / contato" value={draft.contactName || ''} onChange={(e) => setDraft({ ...draft, contactName: e.target.value })} />
        <button type="submit" className="p-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase flex items-center justify-center gap-1">
          <Plus size={14} /> Cadastrar
        </button>
      </form>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Conta</th>
              <th className="text-left px-4 py-3">Venc.</th>
              <th className="text-right px-4 py-3">Valor</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => (
              <tr key={bill.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <p className="font-semibold">{bill.description}</p>
                  <p className="text-[11px] text-slate-500">{bill.contactName || bill.category}</p>
                </td>
                <td className="px-4 py-3">Dia {bill.dueDay}</td>
                <td className="px-4 py-3 text-right font-black">{bill.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => onDelete(bill.id)} className="text-rose-600"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {bills.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Nenhuma conta recorrente cadastrada.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};
