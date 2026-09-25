import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Download, HandCoins, Search, X } from 'lucide-react';
import { Customer, FinancialAccount, LoadingBillingTerm, PaymentReceipt, SaleOrder, Transaction } from '../types';
import { Button } from './ui/Button';
import { DataTable, DataTableColumn } from './ui/DataTable';
import { FlowSheet } from './ui/FlowSheet';
import { orderReceiptsPaid } from '../services/saleNfe';
import { newId } from '../services/ids';
import { Aging, ReceivableRow, TERM_LABEL, agingOf, allocatePayment, allocationsByOrder, buildReceivableRows, financePaidByOrder } from '../services/domain/receivables';
import { formatTons, localIsoDate } from '../services/domain/loadings';

export interface ReceivedPayment {
  receipt: PaymentReceipt;
  updatedOrder: SaleOrder;
}

interface Props {
  orders: SaleOrder[];
  transactions: Transaction[];
  customers: Customer[];
  accounts: FinancialAccount[];
  onReceive: (payments: ReceivedPayment[]) => void;
}

const brDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const card = 'bg-[var(--cf-paper)] border border-[var(--cf-line)] rounded-xl';
const label = 'text-xs font-semibold text-[var(--cf-ink-soft)]';
const control = 'mt-1 w-full min-h-11 border border-[var(--cf-line)] rounded-lg px-3 text-sm bg-[var(--cf-paper)] text-[var(--cf-ink)]';
const statLabel = 'text-xs font-semibold uppercase tracking-wide text-[var(--cf-muted)]';
const statValue = 'text-2xl font-extrabold text-[var(--cf-ink)] tabular-nums';

const AGING_LABEL: Record<Aging, string> = { vencido: 'Vencido', hoje: 'Vence hoje', a_vencer: 'A vencer' };
const AGING_CLASS: Record<Aging, string> = {
  vencido: 'text-[var(--cf-danger,#b42318)]',
  hoje: 'text-[var(--cf-sand)]',
  a_vencer: 'text-[var(--cf-muted)]'
};

const FILTER_KEY = 'calcarioflow_receivables_filters';

const readSavedFilters = (): { customerId?: string; aging?: string; term?: string } => {
  try {
    return JSON.parse(localStorage.getItem(FILTER_KEY) || '{}') || {};
  } catch {
    return {};
  }
};

export const Receivables: React.FC<Props> = ({ orders, transactions, customers, accounts, onReceive }) => {
  const today = localIsoDate();
  const saved = useMemo(readSavedFilters, []);
  const [customerId, setCustomerId] = useState(saved.customerId || '');
  const [aging, setAging] = useState<'' | Aging>((saved.aging as Aging) || '');
  const [term, setTerm] = useState<'' | LoadingBillingTerm>((saved.term as LoadingBillingTerm) || '');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [receiving, setReceiving] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify({ customerId, aging, term }));
    } catch {
      /* sem armazenamento: só não lembra o filtro */
    }
  }, [customerId, aging, term]);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name || 'Cliente';
  const allRows = useMemo(() => buildReceivableRows(orders, transactions), [orders, transactions]);
  const financePaid = useMemo(() => financePaidByOrder(transactions), [transactions]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (customerId && r.customerId !== customerId) return false;
      if (aging && agingOf(r.dueDate, today) !== aging) return false;
      if (term && r.term !== term) return false;
      if (q && !`${r.reference} ${r.plate || ''} ${customerName(r.customerId)}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, customerId, aging, term, search, today, customers]);

  // Ao trocar de cliente, já deixa marcadas todas as vendas em aberto dele.
  useEffect(() => {
    setSelected(new Set(customerId ? allRows.filter((r) => r.customerId === customerId).map((r) => r.key) : []));
  }, [customerId, allRows]);

  const sum = (list: ReceivableRow[]) => list.reduce((s, r) => s + r.open, 0);
  const totals = {
    open: sum(rows),
    overdue: sum(rows.filter((r) => agingOf(r.dueDate, today) === 'vencido')),
    today: sum(rows.filter((r) => agingOf(r.dueDate, today) === 'hoje')),
    upcoming: sum(rows.filter((r) => agingOf(r.dueDate, today) === 'a_vencer'))
  };

  const byTerm = useMemo(() => {
    const map = new Map<LoadingBillingTerm, number>();
    for (const r of rows) map.set(r.term, (map.get(r.term) || 0) + r.open);
    return [...map].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const customersWithDebt = useMemo(() => {
    const ids = new Set(allRows.map((r) => r.customerId));
    return customers.filter((c) => ids.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [allRows, customers]);

  const selectedRows = rows.filter((r) => selected.has(r.key));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportCsv = () => {
    const header = 'Cliente;Pedido;Placa;Toneladas;Preço/t;Modalidade;Data;Vencimento;Situação;Total;Recebido;Em aberto';
    const num = (n: number) => n.toFixed(2).replace('.', ',');
    const lines = rows.map((r) =>
      [customerName(r.customerId), r.reference, r.plate || '', r.quantity != null ? num(r.quantity) : '', r.unitPrice != null ? num(r.unitPrice) : '', TERM_LABEL[r.term], brDate(r.date), brDate(r.dueDate), AGING_LABEL[agingOf(r.dueDate, today)], num(r.total), num(r.paid), num(r.open)].join(';')
    );
    const blob = new Blob(['﻿' + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contas-a-receber-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns: DataTableColumn<ReceivableRow>[] = [
    ...(customerId
      ? [{
          key: 'sel',
          header: '',
          render: (r: ReceivableRow) => (
            <input type="checkbox" className="w-5 h-5" checked={selected.has(r.key)} onChange={() => toggle(r.key)} aria-label={`Selecionar ${r.reference}`} />
          )
        }]
      : []),
    {
      key: 'customer',
      header: 'Cliente',
      render: (r) => (
        <button type="button" onClick={() => setCustomerId(r.customerId)} className="font-semibold text-left whitespace-nowrap hover:text-[var(--cf-forest)]">
          {customerName(r.customerId)}
        </button>
      ),
      sortValue: (r) => customerName(r.customerId)
    },
    { key: 'ref', header: 'Pedido', render: (r) => <span className="font-mono text-xs whitespace-nowrap">{r.reference}</span> },
    {
      key: 'load',
      header: 'Carga',
      render: (r) => r.withdrawalId
        ? <span className="whitespace-nowrap"><span className="font-mono font-bold">{r.plate}</span> · {formatTons(r.quantity)} t × {brl(r.unitPrice || 0)}</span>
        : <span className="text-[var(--cf-muted)]">Pedido inteiro</span>
    },
    { key: 'term', header: 'Modalidade', render: (r) => <span className="whitespace-nowrap">{TERM_LABEL[r.term]}</span>, sortValue: (r) => r.term },
    { key: 'date', header: 'Data', render: (r) => <span className="whitespace-nowrap">{brDate(r.date)}</span>, sortValue: (r) => r.date },
    {
      key: 'due',
      header: 'Vencimento',
      render: (r) => {
        const a = agingOf(r.dueDate, today);
        return (
          <span className="whitespace-nowrap">
            {brDate(r.dueDate)} <span className={`text-xs font-bold ${AGING_CLASS[a]}`}>· {AGING_LABEL[a]}</span>
          </span>
        );
      },
      sortValue: (r) => r.dueDate
    },
    { key: 'total', header: 'Total', align: 'right', render: (r) => <span className="tabular-nums whitespace-nowrap">{brl(r.total)}</span>, sortValue: (r) => r.total },
    { key: 'paid', header: 'Recebido', align: 'right', render: (r) => <span className="tabular-nums whitespace-nowrap">{brl(r.paid)}</span>, sortValue: (r) => r.paid },
    { key: 'open', header: 'Em aberto', align: 'right', render: (r) => <b className="tabular-nums whitespace-nowrap">{brl(r.open)}</b>, sortValue: (r) => r.open }
  ];

  return (
    <div className="space-y-5 text-[var(--cf-ink)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold flex items-center gap-2">
            <HandCoins size={20} className="text-[var(--cf-forest)]" /> Contas a Receber
          </h2>
          <p className="text-sm text-[var(--cf-muted)] mt-1">
            Vendas e cargas que o cliente ainda não pagou. Nada aqui entra no caixa até você receber e escolher o banco.
          </p>
        </div>
        <Button onClick={exportCsv} disabled={rows.length === 0}>
          <Download size={16} /> Exportar Excel
        </Button>
      </div>

      <div className={`${card} p-4 grid grid-cols-1 md:grid-cols-5 gap-3`}>
        <label className={`${label} md:col-span-2 min-w-0`}>
          Cliente
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={control}>
            <option value="">Todos os clientes</option>
            {customersWithDebt.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className={`${label} min-w-0`}>
          Situação
          <select value={aging} onChange={(e) => setAging(e.target.value as '' | Aging)} className={control}>
            <option value="">Todas</option>
            <option value="vencido">Vencido</option>
            <option value="hoje">Vence hoje</option>
            <option value="a_vencer">A vencer</option>
          </select>
        </label>
        <label className={`${label} min-w-0`}>
          Modalidade
          <select value={term} onChange={(e) => setTerm(e.target.value as '' | LoadingBillingTerm)} className={control}>
            <option value="">Todas</option>
            {(Object.keys(TERM_LABEL) as LoadingBillingTerm[]).map((t) => <option key={t} value={t}>{TERM_LABEL[t]}</option>)}
          </select>
        </label>
        <label className={`${label} min-w-0`}>
          Buscar
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 mt-0.5 text-[var(--cf-muted)]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pedido, placa ou cliente…" className={`${control} pl-9`} />
          </div>
        </label>
        {(customerId || aging || term || search) && (
          <div className="md:col-span-5">
            <Button variant="ghost" size="sm" onClick={() => { setCustomerId(''); setAging(''); setTerm(''); setSearch(''); }}>
              <X size={14} /> Limpar filtros
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[var(--cf-sand-soft)] border border-[var(--cf-sand)] rounded-xl p-4">
          <p className={statLabel}>Em aberto</p>
          <p className={statValue}>{brl(totals.open)}</p>
        </div>
        <div className={`${card} p-4`}>
          <p className={statLabel}>Vencido</p>
          <p className={statValue}>{brl(totals.overdue)}</p>
        </div>
        <div className={`${card} p-4`}>
          <p className={statLabel}>Vence hoje</p>
          <p className={statValue}>{brl(totals.today)}</p>
        </div>
        <div className={`${card} p-4`}>
          <p className={statLabel}>A vencer</p>
          <p className={statValue}>{brl(totals.upcoming)}</p>
        </div>
      </div>

      {byTerm.length > 1 && (
        <div className={`${card} p-4 flex flex-wrap gap-x-6 gap-y-2 text-sm`}>
          <span className={statLabel}>Em aberto por modalidade</span>
          {byTerm.map(([t, v]) => (
            <button key={t} type="button" onClick={() => setTerm(term === t ? '' : t)} className="tabular-nums hover:text-[var(--cf-forest)]">
              {TERM_LABEL[t]}: <b>{brl(v)}</b>
            </button>
          ))}
        </div>
      )}

      {customerId && (
        <div className={`${card} p-4 flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <p className="font-extrabold">{customerName(customerId)}</p>
            <p className="text-sm text-[var(--cf-muted)]">
              {selectedRows.length} de {rows.length} marcadas · {brl(sum(selectedRows))}
            </p>
          </div>
          <Button onClick={() => setReceiving(true)} disabled={selectedRows.length === 0}>
            <HandCoins size={16} /> Receber pagamento
          </Button>
        </div>
      )}
      {!customerId && rows.length > 0 && (
        <p className="text-sm text-[var(--cf-muted)]">Escolha um cliente para receber um pagamento que quita várias vendas de uma vez.</p>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.key}
        empty={<span>Nenhuma venda em aberto{customerId || aging || term || search ? ' com esses filtros' : ''}.</span>}
      />

      {receiving && (
        <ReceiveBatchSheet
          rows={selectedRows}
          orders={orders}
          financePaid={financePaid}
          customer={customers.find((c) => c.id === customerId)}
          accounts={accounts}
          onClose={() => setReceiving(false)}
          onConfirm={(payments) => {
            setReceiving(false);
            onReceive(payments);
          }}
        />
      )}
    </div>
  );
};

interface SheetProps {
  rows: ReceivableRow[];
  orders: SaleOrder[];
  financePaid: Map<string, number>;
  customer?: Customer;
  accounts: FinancialAccount[];
  onClose: () => void;
  onConfirm: (payments: ReceivedPayment[]) => void;
}

const ReceiveBatchSheet: React.FC<SheetProps> = ({ rows, orders, financePaid, customer, accounts, onClose, onConfirm }) => {
  const totalOpen = rows.reduce((s, r) => s + r.open, 0);
  const [amountStr, setAmountStr] = useState(totalOpen.toFixed(2));
  const [date, setDate] = useState(localIsoDate());
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0].id : '');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const amount = Number(amountStr.replace(',', '.')) || 0;
  const { allocations, leftover } = allocatePayment(rows, amount);
  const account = accounts.find((a) => a.id === accountId);
  const error =
    amount <= 0 ? 'Informe o valor recebido.'
    : leftover > 0.009 ? `O valor passa ${brl(leftover)} do que está em aberto nas vendas marcadas. Marque mais vendas ou corrija o valor.`
    : !account ? 'Escolha em qual banco/caixa o dinheiro entrou.'
    : '';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Trava de clique duplo: um pagamento, um lançamento.
    if (error || submitted || !account) return;
    setSubmitted(true);
    const perOrder = allocationsByOrder(allocations);
    const batchId = perOrder.length > 1 ? newId('lote') : undefined;
    const year = date.slice(0, 4);
    const payments: ReceivedPayment[] = [];
    for (const alloc of perOrder) {
      const order = orders.find((o) => o.id === alloc.orderId);
      if (!order) continue;
      const paidBefore = Math.max(orderReceiptsPaid(order), financePaid.get(order.id) || 0);
      const receipt: PaymentReceipt = {
        id: newId(`REC-${year}`),
        orderId: order.id,
        orderReference: order.reference,
        customerId: order.customerId,
        customerName: customer?.name || 'Cliente',
        customerDocument: customer?.document,
        amount: alloc.amount,
        date,
        paymentMethod,
        accountId: account.id,
        accountName: account.name,
        description: batchId
          ? `Pagamento de ${perOrder.length} vendas · Pedido #${order.reference}`
          : `Abatimento Pedido #${order.reference}`,
        type: 'ABATIMENTO',
        totalOrderAmount: order.total,
        totalPaidSoFar: paidBefore + alloc.amount,
        remainingDebt: Math.max(0, Number(order.total || 0) - paidBefore - alloc.amount),
        notes: notes.trim(),
        batchId
      };
      payments.push({ receipt, updatedOrder: { ...order, receipts: [...(order.receipts || []), receipt] } });
    }
    onConfirm(payments);
  };

  return (
    <FlowSheet
      title="Receber pagamento"
      subtitle={`${customer?.name || 'Cliente'} · ${rows.length} marcadas · ${brl(totalOpen)} em aberto`}
      zIndexClass="z-[200]"
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="receive-batch-form"
          disabled={Boolean(error) || submitted}
          className="w-full min-h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <CheckCircle size={16} /> Confirmar recebimento de {brl(amount)}
        </button>
      }
    >
      <form id="receive-batch-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className={label}>
            Valor recebido (R$)
            <input inputMode="decimal" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} className={control} required />
          </label>
          <label className={label}>
            Data do pagamento
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={control} required />
          </label>
          <label className={label}>
            Forma de pagamento
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={control}>
              <option value="PIX">PIX</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Transferência / TED">Transferência / TED</option>
              <option value="Boleto">Boleto</option>
              <option value="Cheque">Cheque</option>
              <option value="Cartão de Débito">Cartão de Débito</option>
              <option value="Cartão de Crédito">Cartão de Crédito</option>
            </select>
          </label>
          <label className={label}>
            Banco / caixa onde entrou
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={control} required>
              <option value="" disabled>Selecione…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.bankName ? ` (${a.bankName})` : ''}</option>
              ))}
            </select>
          </label>
        </div>
        <label className={`${label} block`}>
          Observação
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={control} placeholder="Ex.: fechamento da semana 21 a 26/09" />
        </label>

        <div className="border border-[var(--cf-line)] rounded-xl divide-y divide-[var(--cf-line)]">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--cf-muted)]">Como o valor será baixado (mais antiga primeiro)</p>
          {rows.map((r) => {
            const applied = allocations.find((a) => a.key === r.key)?.amount || 0;
            const left = r.open - applied;
            return (
              <div key={r.key} className="px-3 py-2 flex flex-wrap justify-between gap-2 text-sm tabular-nums">
                <span className="font-mono">{r.reference} <span className="font-sans text-[var(--cf-muted)]">· {r.plate ? `${r.plate} · ` : ''}{brDate(r.date)}</span></span>
                <span>
                  <b>{brl(applied)}</b>
                  <span className={`ml-2 text-xs ${left > 0.009 ? 'text-[var(--cf-sand)]' : 'text-[var(--cf-forest)]'}`}>
                    {left > 0.009 ? `fica ${brl(left)}` : 'quitada'}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        {error && amount > 0 && <p className="text-sm font-semibold text-[var(--cf-danger,#b42318)]">{error}</p>}
      </form>
    </FlowSheet>
  );
};

export default Receivables;
