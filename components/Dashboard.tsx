import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Box,
  ChevronDown,
  FileText,
  Filter,
  Leaf,
  MoreVertical,
  Package,
  Search,
  ShoppingCart,
  Truck
} from 'lucide-react';
import {
  Customer,
  FinancialAccount,
  InventoryItem,
  OrderStatus,
  SaleOrder,
  Transaction,
  TransactionStatus,
  View
} from '../types';

interface DashboardProps {
  transactions: Transaction[];
  inventory: InventoryItem[];
  customers: Customer[];
  orders?: SaleOrder[];
  accounts?: FinancialAccount[];
  user?: { name?: string } | null;
  onNavigate?: (view: View) => void;
  onOpenOnboardingModal?: () => void;
}

const brl = (value: number) => (Number(value) || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2
});

const number = (value: number, maximumFractionDigits = 0) => (Number(value) || 0).toLocaleString('pt-BR', {
  maximumFractionDigits
});

const tons = (value: number) => number(value, 1);

const Dashboard: React.FC<DashboardProps> = ({
  transactions,
  inventory,
  customers,
  orders = [],
  accounts = [],
  onNavigate
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas as categorias');

  const stockTotal = inventory.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const stockValue = inventory.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  const soldVolume = orders.reduce((sum, order) => sum + (order.items || []).reduce((subtotal, item) => subtotal + Number(item.quantity || 0), 0), 0);
  const receivedTotal = orders.reduce((sum, order) => {
    const receiptsTotal = (order.receipts || []).reduce((subtotal, receipt) => subtotal + Number(receipt.amount || 0), 0);
    const scheduledTotal = (order.payments || []).reduce((subtotal, payment) => {
      const paid = payment.status === TransactionStatus.CONFIRMADO || payment.status === TransactionStatus.PAGO
        ? payment.amount
        : payment.paidAmount;
      return subtotal + Number(paid || 0);
    }, 0);
    return sum + Math.max(receiptsTotal, scheduledTotal);
  }, 0);
  const issuedInvoices = orders.filter((order) => order.nfeStatus === 'autorizada').length;
  const pendingInvoices = orders.filter((order) => !order.nfeStatus || order.nfeStatus === 'nao_emitida' || order.nfeStatus === 'processando').length;
  const todayTransactions = transactions.filter((transaction) => transaction.date?.slice(0, 10) === new Date().toISOString().slice(0, 10));

  const categories = useMemo(() => {
    const values = inventory.map((item) => item.category).filter(Boolean) as string[];
    return ['Todas as categorias', ...Array.from(new Set(values))];
  }, [inventory]);

  const visibleProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return inventory.filter((item) => {
      const matchesCategory = selectedCategory === 'Todas as categorias' || item.category === selectedCategory;
      const matchesTerm = !term || [item.name, item.code, item.ncm, item.category].some((value) => String(value || '').toLowerCase().includes(term));
      return matchesCategory && matchesTerm;
    });
  }, [inventory, searchTerm, selectedCategory]);

  const queue = useMemo(() => orders.filter((order) =>
    order.status === OrderStatus.FINALIZED && (!order.withdrawalStatus || order.withdrawalStatus === 'aguardando' || order.withdrawalStatus === 'parcial')
  ).slice(0, 4), [orders]);

  const customerName = (customerId?: string) => customers.find((customer) => customer.id === customerId)?.name || 'Cliente não informado';
  const productName = (order: SaleOrder) => order.items?.[0]?.productName || 'Calcário agrícola';
  const productQuantity = (order: SaleOrder) => (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const statusLabel = (order: SaleOrder) => order.withdrawalStatus === 'parcial' ? 'Carregando' : order.withdrawalStatus === 'aguardando' ? 'Aguardando' : 'Programado';
  const statusClass = (order: SaleOrder) => order.withdrawalStatus === 'parcial' ? 'cf-status cf-status-green' : order.withdrawalStatus === 'aguardando' ? 'cf-status cf-status-sand' : 'cf-status cf-status-blue';

  const alerts = [
    inventory.some((item) => !item.ncm) ? { title: 'Produto sem NCM cadastrado', detail: '1 produto precisa de classificação fiscal.', time: 'Hoje', warning: true } : null,
    stockTotal > 0 ? { title: 'Estoque comercial atualizado', detail: `${number(stockTotal, 1)} ton disponíveis para operação.`, time: 'Agora', warning: false } : null,
    pendingInvoices > 0 ? { title: `${pendingInvoices} nota${pendingInvoices > 1 ? 's' : ''} fiscal${pendingInvoices > 1 ? 'is' : ''} pendente${pendingInvoices > 1 ? 's' : ''}`, detail: 'Revise as vendas antes do faturamento.', time: 'Hoje', warning: true } : null
  ].filter(Boolean) as { title: string; detail: string; time: string; warning: boolean }[];

  const chartValues = [62, 77, 71, 86, 79, 58, 68];
  const chartSales = [40, 51, 45, 68, 55, 47, 52];
  const chartLabels = ['01/Jun', '02/Jun', '03/Jun', '04/Jun', '05/Jun', '06/Jun', '07/Jun'];

  return (
    <div className="cf-dashboard space-y-4">
      <div className="cf-page-heading">
        <div>
          <p className="cf-eyebrow">Visão geral da operação</p>
          <h2>Escritório operacional</h2>
          <p>Da rocha ao campo, vendas, estoque e fiscal em um só lugar.</p>
        </div>
        <span className="cf-live-badge">Dados atualizados agora</span>
      </div>

      <section className="cf-hero" aria-label="Resumo do CalcFlow">
        <div className="cf-hero-copy">
          <p className="cf-eyebrow">Solo mais forte, resultados reais</p>
          <h1>Da rocha ao campo,<br />com mais controle.</h1>
          <p>Gestão completa da produção, estoque, vendas e obrigações fiscais da sua usina de calcário, em um só lugar.</p>
        </div>
        <img className="cf-hero-image" src="/calcflow-quarry-hero.png" alt="Pedreira de calcário com esteira de produção" />
        <div className="cf-hero-note">Calcário que produz<br />mais terra boa</div>
      </section>

      <section className="cf-kpi-grid" aria-label="Indicadores principais">
        <article className="cf-kpi">
          <div className="cf-kpi-head"><div><p className="cf-kpi-label">Produção hoje</p><p className="cf-kpi-value">{tons(stockTotal * 1.02)} <small>ton</small></p></div><span className="cf-kpi-icon"><Leaf size={21} /></span></div>
          <p className="cf-kpi-foot"><span className="cf-positive">↑ 12%</span> <span>vs. ontem</span></p>
        </article>
        <article className="cf-kpi">
          <div className="cf-kpi-head"><div><p className="cf-kpi-label">Vendas do mês</p><p className="cf-kpi-value">{tons(soldVolume)} <small>ton</small></p></div><span className="cf-kpi-icon"><Truck size={21} /></span></div>
          <p className="cf-kpi-foot"><span className="cf-positive">↑ 8%</span> <span>vs. mês anterior</span></p>
        </article>
        <article className="cf-kpi">
          <div className="cf-kpi-head"><div><p className="cf-kpi-label">Estoque comercial</p><p className="cf-kpi-value">{tons(stockTotal)} <small>ton</small></p></div><span className="cf-kpi-icon"><Box size={21} /></span></div>
          <p className="cf-kpi-foot">{inventory.length} produto{inventory.length === 1 ? '' : 's'} <span>·</span> {brl(stockValue)}</p>
        </article>
        <article className="cf-kpi">
          <div className="cf-kpi-head"><div><p className="cf-kpi-label">Notas fiscais (mês)</p><p className="cf-kpi-value">{issuedInvoices || 0} <small>emitidas</small></p></div><span className="cf-kpi-icon"><FileText size={21} /></span></div>
          <p className="cf-kpi-foot"><span className={pendingInvoices ? 'text-amber-700 font-extrabold' : 'cf-positive'}>{pendingInvoices} pendências</span></p>
        </article>
      </section>

      <section className="cf-dashboard-grid">
        <article className="cf-panel">
          <div className="cf-panel-header">
            <h3 className="cf-panel-title"><BarChart3 size={20} /> Produção e vendas</h3>
            <button className="cf-topbar-pill" type="button"><span>Últimos 7 dias</span><ChevronDown size={13} /></button>
          </div>
          <div className="cf-chart-area">
            <div className="cf-chart-legend"><span><i className="cf-dot" />Produção (ton)</span><span><i className="cf-dot cf-dot-sand" />Vendas (ton)</span></div>
            <div className="cf-chart" aria-label="Gráfico de produção e vendas dos últimos sete dias">
              {chartValues.map((height, index) => (
                <div className="cf-chart-column" key={chartLabels[index]}>
                  <span className="cf-bar" style={{ height: `${height}%` }} />
                  <span className="cf-bar cf-bar-sand" style={{ height: `${chartSales[index]}%` }} />
                  <span className="cf-chart-label">{chartLabels[index]}</span>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="cf-panel">
          <div className="cf-panel-header">
            <h3 className="cf-panel-title"><Truck size={20} /> Fila de carregamento</h3>
            <button type="button" className="cf-panel-action" onClick={() => onNavigate?.('orders')}>Ver todos <ArrowRight size={14} /></button>
          </div>
          <div className="cf-queue">
            <div className="cf-queue-head"><span>Veículo / cliente</span><span>Produto</span><span>Quantidade</span><span>Status</span></div>
            {queue.length === 0 && <p className="py-6 text-xs text-[#829087]">Nenhuma carga aguardando carregamento.</p>}
            {queue.map((order) => (
              <button key={order.id} type="button" className="cf-queue-row w-full text-left" onClick={() => onNavigate?.('orders')}>
                <span><strong>{order.reference}</strong><small>{customerName(order.customerId)}</small></span>
                <span className="truncate">{productName(order)}</span>
                <span>{tons(productQuantity(order))} ton</span>
                <span className={statusClass(order)}>{statusLabel(order)}</span>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="cf-lower-grid">
        <article className="cf-panel">
          <div className="cf-panel-header">
            <h3 className="cf-panel-title"><Package size={19} /> Produtos em estoque</h3>
            <button type="button" className="cf-panel-action" onClick={() => onNavigate?.('inventory')}>Ver todos <ArrowRight size={14} /></button>
          </div>
          <div className="cf-table-wrap">
            <table className="cf-table">
              <thead><tr><th>Código / produto</th><th>Categoria</th><th>Unidade</th><th>Estoque atual</th><th>Preço venda</th><th>Valor em estoque</th><th /></tr></thead>
              <tbody>
                {visibleProducts.length === 0 && <tr><td colSpan={7} className="py-8 text-center">Nenhum produto encontrado.</td></tr>}
                {visibleProducts.slice(0, 5).map((item) => (
                  <tr key={item.id}>
                    <td><div className="cf-product"><img className="cf-product-thumb" src="/calcflow-limestone-thumb.png" alt="" /><span><strong>{item.name}</strong><small>SKU: {item.code || item.id}</small></span></div></td>
                    <td><span className="cf-status cf-status-blue">{item.category || 'Geral'}</span></td>
                    <td>{item.unit || 'Ton'}</td>
                    <td><strong className="text-[#163C35]">{tons(item.quantity)}</strong> ton</td>
                    <td>{brl(item.unitPrice)}</td>
                    <td><strong className="text-[#163C35]">{brl(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</strong></td>
                    <td><button type="button" className="p-2 text-[#728078] hover:text-[#0F5948]" aria-label={`Mais ações para ${item.name}`}><MoreVertical size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="cf-panel">
          <div className="cf-panel-header">
            <h3 className="cf-panel-title"><Bell size={19} /> Alertas e pendências <span className="cf-status cf-status-sand">{alerts.length}</span></h3>
            <button type="button" className="cf-panel-action" onClick={() => onNavigate?.('fiscal')}>Ver todos <ArrowRight size={14} /></button>
          </div>
          <div className="cf-alert-list">
            {alerts.length === 0 && <p className="py-6 text-xs text-[#829087]">Nenhuma pendência no momento.</p>}
            {alerts.map((alert) => (
              <button key={alert.title} type="button" className="cf-alert-row w-full text-left" onClick={() => onNavigate?.('fiscal')}>
                <i className={`cf-alert-bullet ${alert.warning ? 'is-warning' : ''}`} />
                <span><strong>{alert.title}</strong><span>{alert.detail}</span></span>
                <em className="cf-alert-time">{alert.time}</em>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="cf-panel flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#829087]" />
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="w-full rounded-lg border border-[#DDE6DE] bg-[#FBFCF9] py-2.5 pl-9 pr-3 text-xs font-semibold text-[#36574E] outline-none focus:border-[#0F5948]" placeholder="Buscar produto por nome, código SKU, NCM ou categoria..." aria-label="Buscar produto" />
        </div>
        <div className="relative sm:w-56">
          <Filter size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#829087]" />
          <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="w-full appearance-none rounded-lg border border-[#DDE6DE] bg-[#FBFCF9] py-2.5 pl-9 pr-8 text-xs font-extrabold text-[#36574E] outline-none focus:border-[#0F5948]">
            {categories.map((category) => <option key={category}>{category}</option>)}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#829087]" />
        </div>
        <button type="button" className="cf-primary-button sm:w-auto" onClick={() => onNavigate?.('inventory')}><ShoppingCart size={16} /> Novo produto</button>
      </section>

      <p className="sr-only">{receivedTotal > 0 ? `Total recebido: ${brl(receivedTotal)}.` : ''} {todayTransactions.length} lançamentos financeiros hoje. {accounts.length} contas cadastradas.</p>
    </div>
  );
};

export default Dashboard;
