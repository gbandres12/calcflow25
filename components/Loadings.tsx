import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Search, Truck, X } from 'lucide-react';
import { Customer, OrderStatus, SaleOrder } from '../types';
import { Button } from './ui/Button';
import { DataTable, DataTableColumn } from './ui/DataTable';
import {
  LoadingRow,
  buildLoadingRows,
  filterLoadingRows,
  formatTons,
  BILLING_LABEL,
  loadingsToCsv,
  orderLoadingProgress,
  roundTons,
  summarizeLoadings
} from '../services/domain/loadings';

interface Props {
  orders: SaleOrder[];
  customers: Customer[];
}

const brDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

const card = 'bg-[var(--cf-paper)] border border-[var(--cf-line)] rounded-xl';
const label = 'text-xs font-semibold text-[var(--cf-ink-soft)]';
const control = 'mt-1 w-full min-h-11 border border-[var(--cf-line)] rounded-lg px-3 text-sm bg-[var(--cf-paper)] text-[var(--cf-ink)]';
const statLabel = 'text-xs font-semibold uppercase tracking-wide text-[var(--cf-muted)]';
const statValue = 'text-2xl font-extrabold text-[var(--cf-ink)] tabular-nums';

const FILTER_KEY = 'calcarioflow_loadings_filters';

// Filtro lembrado só neste navegador — conveniência, não dado do sistema.
const readSavedFilters = (): { customerId?: string; from?: string; to?: string } => {
  try {
    return JSON.parse(localStorage.getItem(FILTER_KEY) || '{}') || {};
  } catch {
    return {};
  }
};

export const Loadings: React.FC<Props> = ({ orders, customers }) => {
  const saved = useMemo(readSavedFilters, []);
  const [customerId, setCustomerId] = useState(saved.customerId || '');
  const [orderId, setOrderId] = useState('');
  const [from, setFrom] = useState(saved.from || '');
  const [to, setTo] = useState(saved.to || '');
  const [search, setSearch] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify({ customerId, from, to }));
    } catch {
      /* navegador sem armazenamento: só não lembra o filtro */
    }
  }, [customerId, from, to]);

  const allRows = useMemo(() => buildLoadingRows(orders, customers), [orders, customers]);
  const rows = useMemo(
    () => filterLoadingRows(allRows, { customerId, orderId, from, to, search }),
    [allRows, customerId, orderId, from, to, search]
  );
  const summary = summarizeLoadings(rows);
  const weighedQuantity = summarizeLoadings(rows.filter((r) => r.netWeight != null)).totalQuantity;

  const customersWithLoads = useMemo(() => {
    const ids = new Set(allRows.map((r) => r.customerId));
    return customers.filter((c) => ids.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [allRows, customers]);

  const customerOrders = useMemo(
    () => orders.filter((o) => o.customerId === customerId && o.status === OrderStatus.FINALIZED),
    [orders, customerId]
  );
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const hasFilter = Boolean(customerId || orderId || from || to || search);

  const selectCustomer = (id: string) => {
    setCustomerId(id);
    setOrderId('');
  };

  const clearFilters = () => {
    selectCustomer('');
    setFrom('');
    setTo('');
    setSearch('');
  };

  const exportCsv = () => {
    const blob = new Blob([loadingsToCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const tag = selectedCustomer ? `-${selectedCustomer.name.replace(/[^\w]+/g, '_')}` : '';
    link.href = url;
    link.download = `carregamentos${tag}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns: DataTableColumn<LoadingRow>[] = [
    { key: 'date', header: 'Data', render: (r) => <span className="font-semibold whitespace-nowrap">{brDate(r.date)}</span>, sortValue: (r) => r.date },
    {
      key: 'customer',
      header: 'Cliente',
      render: (r) => (
        <button type="button" onClick={() => selectCustomer(r.customerId)} className="font-semibold text-left whitespace-nowrap hover:text-[var(--cf-forest)]">
          {r.customerName}
        </button>
      ),
      sortValue: (r) => r.customerName
    },
    { key: 'order', header: 'Pedido', render: (r) => <span className="font-mono text-xs whitespace-nowrap">{r.orderReference}</span> },
    { key: 'transporter', header: 'Transportador', render: (r) => <span className="whitespace-nowrap">{r.transporterName || '—'}</span>, sortValue: (r) => r.transporterName },
    { key: 'driver', header: 'Motorista', render: (r) => <span className="whitespace-nowrap">{r.driverName}</span> },
    { key: 'product', header: 'Produto', render: (r) => <span className="whitespace-nowrap">{r.productName}</span> },
    { key: 'plate', header: 'Placa', render: (r) => <span className="font-mono font-bold whitespace-nowrap">{r.plateNumber}</span> },
    {
      key: 'nf',
      header: 'NF',
      render: (r) => r.nfeNumero || <span className="text-xs font-semibold text-[var(--cf-sand)]">sem NF</span>,
      sortValue: (r) => Number(r.nfeNumero) || 0
    },
    { key: 'qty', header: 'Quant. nota', align: 'right', render: (r) => <b className="whitespace-nowrap">{formatTons(r.quantity)}</b>, sortValue: (r) => r.quantity },
    { key: 'net', header: 'P. líquido', align: 'right', render: (r) => <b className="whitespace-nowrap">{formatTons(r.netWeight)}</b>, sortValue: (r) => r.netWeight ?? -1 },
    { key: 'billing', header: 'Cobrança', render: (r) => <span className="whitespace-nowrap">{BILLING_LABEL[r.billingTerm]}</span>, sortValue: (r) => r.billingTerm },
    {
      key: 'amount',
      header: 'Valor',
      align: 'right',
      render: (r) => <span className="tabular-nums whitespace-nowrap">{r.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>,
      sortValue: (r) => r.amount
    }
  ];

  return (
    <div className="space-y-5 text-[var(--cf-ink)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-[var(--cf-forest)]" /> Carregamentos
          </h2>
          <p className="text-sm text-[var(--cf-muted)] mt-1">
            Cada caminhão que saiu da balança, com a nota e o peso. A balança lança em Pátio → Balança.
          </p>
        </div>
        <Button onClick={exportCsv} disabled={rows.length === 0}>
          <Download size={16} /> Exportar Excel
        </Button>
      </div>

      <div className={`${card} p-4 grid grid-cols-1 md:grid-cols-5 gap-3`}>
        <label className={`${label} md:col-span-2 min-w-0`}>
          Cliente
          <select value={customerId} onChange={(e) => selectCustomer(e.target.value)} className={control}>
            <option value="">Todos os clientes</option>
            {customersWithLoads.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className={`${label} min-w-0`}>
          De
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={control} />
        </label>
        <label className={`${label} min-w-0`}>
          Até
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={control} />
        </label>
        <label className={`${label} min-w-0`}>
          Buscar
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 mt-0.5 text-[var(--cf-muted)]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Placa, motorista, NF…" className={`${control} pl-9`} />
          </div>
        </label>
        {hasFilter && (
          <div className="md:col-span-5">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X size={14} /> Limpar filtros
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`${card} p-4`}>
          <p className={statLabel}>Caminhões</p>
          <p className={statValue}>{summary.trips}</p>
        </div>
        <div className="bg-[var(--cf-sand-soft)] border border-[var(--cf-sand)] rounded-xl p-4">
          <p className={statLabel}>Quant. nota</p>
          <p className={statValue}>{formatTons(summary.totalQuantity)} t</p>
        </div>
        <div className={`${card} p-4`}>
          <p className={statLabel}>Peso líquido</p>
          <p className={statValue}>{formatTons(summary.totalNetWeight)} t</p>
          {summary.netWeightTrips < summary.trips && (
            <p className="text-xs text-[var(--cf-muted)]">{summary.trips - summary.netWeightTrips} sem pesagem registrada</p>
          )}
        </div>
        <div className={`${card} p-4`}>
          <p className={statLabel}>Balança − nota</p>
          <p className={statValue}>
            {summary.netWeightTrips > 0 ? `${formatTons(roundTons(summary.totalNetWeight - weighedQuantity))} t` : '—'}
          </p>
        </div>
      </div>

      {selectedCustomer && (
        <div className={`${card} p-5 space-y-3`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-extrabold">{selectedCustomer.name}</h3>
            <span className="text-sm text-[var(--cf-muted)]">{selectedCustomer.document}</span>
          </div>
          {customerOrders.length === 0 && <p className="text-sm text-[var(--cf-muted)]">Nenhum pedido confirmado.</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {customerOrders.map((order) => {
              const p = orderLoadingProgress(order);
              const active = orderId === order.id;
              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setOrderId(active ? '' : order.id)}
                  className={`text-left p-4 rounded-xl border transition-colors ${
                    active ? 'border-[var(--cf-forest)] bg-[var(--cf-forest-soft)]' : 'border-[var(--cf-line)] hover:bg-[var(--cf-cream)]'
                  }`}
                >
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-mono text-sm font-bold">{order.reference}</span>
                    <span className="text-xs font-semibold text-[var(--cf-muted)]">{p.trips} caminhões</span>
                  </div>
                  <p className="text-sm text-[var(--cf-muted)] mt-0.5">{order.items?.[0]?.productName}</p>
                  <div className="mt-2 h-2 bg-[var(--cf-line)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--cf-forest)]" style={{ width: `${p.percent}%` }} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-sm font-semibold tabular-nums">
                    <span>Carregado {formatTons(p.loaded)} de {formatTons(p.contracted)} t</span>
                    <span className={p.remaining > 0 ? 'text-[var(--cf-sand)]' : 'text-[var(--cf-forest)]'}>
                      Saldo {formatTons(p.remaining)} t
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {orderId && (
            <p className="text-xs text-[var(--cf-muted)]">Mostrando só o pedido selecionado. Clique de novo pra ver todos do cliente.</p>
          )}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => `${r.orderId}-${r.id}`}
        empty={
          <span className="inline-flex flex-col items-center gap-2">
            <Truck size={24} />
            {allRows.length === 0 ? 'Nenhum carregamento lançado ainda.' : 'Nenhum carregamento com esses filtros.'}
          </span>
        }
      />

      <p className="text-xs text-[var(--cf-muted)]">
        O saldo do pedido abate a quantidade da nota. O peso líquido fica registrado pra conferência.
      </p>
    </div>
  );
};

export default Loadings;
