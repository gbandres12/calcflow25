import React, { useMemo, useState } from 'react';
import { Database, Menu, RefreshCw, Search, X } from 'lucide-react';
import { View, User, SaleOrder, TransferShipment, Customer } from '../types';

interface Props {
  user: User;
  companyLabel: string;
  syncing?: boolean;
  activeCompanyId?: string;
  orders?: SaleOrder[];
  transfers?: TransferShipment[];
  customers?: Customer[];
  onNavigate: (view: View) => void;
  onOpenMenu: () => void;
  onOpenDatabase: () => void;
  onLogout: () => void;
}

export const AppTopbar: React.FC<Props> = ({
  user, companyLabel, syncing, activeCompanyId,
  orders = [], transfers = [], customers = [],
  onNavigate, onOpenMenu, onOpenDatabase, onLogout
}) => {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const hits: { view: View; label: string; hint: string }[] = [];
    orders.forEach((o) => {
      const cust = customers.find((c) => c.id === o.customerId)?.name || '';
      if ((o.reference || '').toLowerCase().includes(term) || cust.toLowerCase().includes(term)) {
        hits.push({ view: 'orders', label: o.reference, hint: cust || 'Pedido' });
      }
    });
    transfers.forEach((t) => {
      if ((t.code || '').toLowerCase().includes(term) || (t.originLocation || '').toLowerCase().includes(term)) {
        hits.push({ view: 'transfers', label: t.code, hint: t.status });
      }
    });
    customers.forEach((c) => {
      if ((c.name || '').toLowerCase().includes(term) || (c.document || '').includes(term)) {
        hits.push({ view: 'customers', label: c.name, hint: c.document || 'Cliente' });
      }
    });
    return hits.slice(0, 8);
  }, [q, orders, transfers, customers]);

  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5 print:hidden">
      <div className="flex items-center gap-2 w-full">
        <button type="button" onClick={onOpenMenu} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 lg:hidden">
          <Menu size={18} />
        </button>
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar romaneio, NF-e, cliente, fazenda…" className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-9 py-2 text-sm outline-none focus:border-blue-500" />
          {q && (
            <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>
          )}
          {results.length > 0 && (
            <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
              {results.map((r, i) => (
                <button key={i} type="button" onClick={() => { onNavigate(r.view); setQ(''); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex justify-between gap-3">
                  <span className="font-medium text-slate-700 truncate">{r.label}</span>
                  <span className="text-[11px] text-slate-400 shrink-0">{r.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button type="button" onClick={onOpenDatabase} className="hidden sm:flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-600">
          {syncing ? <RefreshCw size={12} className="animate-spin" /> : <Database size={12} className="text-emerald-600" />}
          {companyLabel}
        </button>
        <span className={`hidden md:inline text-[10px] font-semibold px-2 py-1 rounded-md border ${activeCompanyId === 'matriz-demo' ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
          {activeCompanyId === 'matriz-demo' ? 'Demo' : 'Produção'}
        </span>
        <div className="hidden sm:block text-right px-2">
          <p className="text-[11px] font-semibold text-slate-800 leading-tight">{user.name.split(' ')[0]}</p>
          <p className="text-[10px] text-slate-400">{user.role}</p>
        </div>
        <button type="button" onClick={onLogout} className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 border border-slate-200 rounded-lg bg-white hover:bg-slate-50">Sair</button>
      </div>
    </div>
  );
};

export default AppTopbar;
