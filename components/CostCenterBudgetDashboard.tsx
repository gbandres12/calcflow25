import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Edit3,
  FileText,
  Layers,
  PieChart,
  Plus,
  Search,
  ShieldAlert,
  ShoppingCart,
  Sliders,
  Trash2,
  TrendingUp,
  UserCheck,
  Wallet,
  X
} from 'lucide-react';
import {
  CostCenter,
  PurchaseOrder,
  Transaction,
  View
} from '../types';
import {
  BudgetHealthStatus,
  CostCenterBudgetMetrics,
  computeCostCenterBudgetSummary,
  getEffectiveBudgetForMonth
} from '../services/domain/costCenterBudget';
import { newId } from '../services/ids';
import { dateISOBR } from '../utils/dateFilterUtils';

interface CostCenterBudgetDashboardProps {
  costCenters: CostCenter[];
  transactions: Transaction[];
  purchaseOrders: PurchaseOrder[];
  onSaveCostCenter: (costCenter: CostCenter) => void;
  onDeleteCostCenter?: (id: string) => void;
  onNavigate?: (view: View) => void;
}

const PRESET_COLORS = [
  '#0F5948',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#0EA5E9',
  '#1E293B',
  '#EC4899',
  '#64748B',
  '#D97706'
];

const formatBRL = (val?: number) =>
  (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatMonthLabel = (yearMonth: string): string => {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return yearMonth;
  const [y, m] = yearMonth.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

const shiftYearMonth = (yearMonth: string, deltaMonths: number): string => {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + deltaMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const statusBadgeConfig = (status: BudgetHealthStatus) => {
  switch (status) {
    case 'SAUDAVEL':
      return {
        label: 'Dentro da Verba',
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500'
      };
    case 'ATENCAO':
      return {
        label: 'Atenção (Próx. Limite)',
        bg: 'bg-amber-50 text-amber-700 border-amber-200',
        dot: 'bg-amber-500'
      };
    case 'ESTOURO':
      return {
        label: 'Verba Estourada',
        bg: 'bg-rose-50 text-rose-700 border-rose-200',
        dot: 'bg-rose-500'
      };
    case 'SEM_VERBA':
      return {
        label: 'Sem Teto Definido',
        bg: 'bg-slate-100 text-slate-600 border-slate-200',
        dot: 'bg-slate-400'
      };
  }
};

export const CostCenterBudgetDashboard: React.FC<CostCenterBudgetDashboardProps> = ({
  costCenters,
  transactions,
  purchaseOrders,
  onSaveCostCenter,
  onDeleteCostCenter,
  onNavigate
}) => {
  const currentYearMonth = dateISOBR().slice(0, 7);
  const [yearMonth, setYearMonth] = useState<string>(currentYearMonth);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | BudgetHealthStatus>('ALL');
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);

  // Modal de Criar / Editar Centro de Custo & Verba
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCenter, setEditingCenter] = useState<CostCenter | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState(PRESET_COLORS[0]);
  const [formResponsible, setFormResponsible] = useState('');
  const [formMonthlyBudget, setFormMonthlyBudget] = useState('');
  const [formSpecificMonthBudget, setFormSpecificMonthBudget] = useState('');
  const [formUseSpecificMonth, setFormUseSpecificMonth] = useState(false);
  const [formAlertThreshold, setFormAlertThreshold] = useState('80');

  const summary = useMemo(
    () =>
      computeCostCenterBudgetSummary({
        costCenters,
        transactions,
        purchaseOrders,
        yearMonth
      }),
    [costCenters, transactions, purchaseOrders, yearMonth]
  );

  const filteredMetrics = useMemo(() => {
    return summary.byCenter.filter((m) => {
      if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = m.costCenter.name.toLowerCase().includes(q);
        const matchCode = (m.costCenter.code || '').toLowerCase().includes(q);
        const matchResp = (m.costCenter.responsibleName || '').toLowerCase().includes(q);
        return matchName || matchCode || matchResp;
      }
      return true;
    });
  }, [summary.byCenter, statusFilter, searchQuery]);

  const selectedMetrics: CostCenterBudgetMetrics | null = useMemo(() => {
    if (!selectedCenterId) return null;
    return summary.byCenter.find((m) => m.costCenter.id === selectedCenterId) || null;
  }, [summary.byCenter, selectedCenterId]);

  const openCreateModal = () => {
    setEditingCenter(null);
    const nextNum = costCenters.length + 1;
    setFormCode(`CC-${String(nextNum).padStart(2, '0')}`);
    setFormName('');
    setFormColor(PRESET_COLORS[costCenters.length % PRESET_COLORS.length]);
    setFormResponsible('');
    setFormMonthlyBudget('30000');
    setFormSpecificMonthBudget('');
    setFormUseSpecificMonth(false);
    setFormAlertThreshold('80');
    setIsModalOpen(true);
  };

  const openEditModal = (cc: CostCenter) => {
    setEditingCenter(cc);
    setFormCode(cc.code || '');
    setFormName(cc.name);
    setFormColor(cc.color || PRESET_COLORS[0]);
    setFormResponsible(cc.responsibleName || '');
    setFormMonthlyBudget(String(cc.monthlyBudget ?? 0));
    const hasOverride =
      cc.monthlyOverrides &&
      Object.prototype.hasOwnProperty.call(cc.monthlyOverrides, yearMonth);
    setFormUseSpecificMonth(Boolean(hasOverride));
    setFormSpecificMonthBudget(
      hasOverride ? String(cc.monthlyOverrides![yearMonth]) : String(cc.monthlyBudget ?? 0)
    );
    setFormAlertThreshold(String(cc.alertThresholdPercent ?? 80));
    setIsModalOpen(true);
  };

  const handleSaveCenter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const baseBudget = Math.max(0, Number(formMonthlyBudget) || 0);
    const threshold = Math.min(100, Math.max(10, Number(formAlertThreshold) || 80));
    const overrides = { ...(editingCenter?.monthlyOverrides || {}) };

    if (formUseSpecificMonth) {
      overrides[yearMonth] = Math.max(0, Number(formSpecificMonthBudget) || 0);
    } else {
      delete overrides[yearMonth];
    }

    const payload: CostCenter = {
      id: editingCenter?.id || newId('cc'),
      code: formCode.trim() || undefined,
      name: formName.trim(),
      color: formColor,
      responsibleName: formResponsible.trim() || undefined,
      monthlyBudget: baseBudget,
      monthlyOverrides: overrides,
      alertThresholdPercent: threshold,
      isActive: true
    };

    onSaveCostCenter(payload);
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho e Seletor de Competência */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-lg bg-[#E5EEE5] text-[#0F5948] text-[11px] font-extrabold uppercase tracking-wider">
              Governança Orçamentária
            </span>
            {summary.centersInOverrunCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle size={12} /> {summary.centersInOverrunCount} C. Custo em Estouro
              </span>
            )}
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            Painel de Verbas & Centros de Custo
          </h2>
          <p className="text-slate-500 text-sm">
            Acompanhamento de teto orçamentário vs. consumo real (Pago + A Pagar + Ordens de Compra Aprovadas)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Navegador de Mês/Ano */}
          <div className="flex items-center bg-slate-100 rounded-2xl p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setYearMonth((ym) => shiftYearMonth(ym, -1))}
              className="p-2 rounded-xl hover:bg-white text-slate-600 hover:text-slate-900 transition-colors"
              title="Mês anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="px-3 flex items-center gap-2">
              <Calendar size={15} className="text-[#0F5948]" />
              <input
                type="month"
                value={yearMonth}
                onChange={(e) => e.target.value && setYearMonth(e.target.value)}
                className="bg-transparent text-xs font-black uppercase text-slate-800 outline-none cursor-pointer"
              />
            </div>
            <button
              type="button"
              onClick={() => setYearMonth((ym) => shiftYearMonth(ym, 1))}
              className="p-2 rounded-xl hover:bg-white text-slate-600 hover:text-slate-900 transition-colors"
              title="Próximo mês"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('purchases')}
              className="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold flex items-center gap-2 transition-colors"
            >
              <ShoppingCart size={15} /> Ordens de Compra
            </button>
          )}

          <button
            type="button"
            onClick={openCreateModal}
            className="px-5 py-2.5 rounded-2xl bg-[#0F5948] hover:bg-[#163C35] text-white text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-emerald-900/10 transition-all"
          >
            <Plus size={16} /> Novo Centro de Custo
          </button>
        </div>
      </div>

      {/* KPIs Executivos Globais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              Verba Total Designada ({formatMonthLabel(yearMonth)})
            </span>
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Wallet size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900">{formatBRL(summary.totalBudget)}</p>
          <p className="text-xs text-slate-500 mt-1">
            Soma de {summary.byCenter.length} centros de custo ativos
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              Total Consumido / Comprometido
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <BarChart3 size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-black text-slate-900">{formatBRL(summary.totalConsumed)}</p>
            <span
              className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${
                summary.globalUsagePercent > 100
                  ? 'bg-rose-100 text-rose-700'
                  : summary.globalUsagePercent >= 80
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {summary.globalUsagePercent.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500 font-semibold">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-600" /> Pago: {formatBRL(summary.totalPaid)}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> A Pagar: {formatBRL(summary.totalPendingPayable)}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              Comprometido em OCs Aprovadas
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ShoppingCart size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-indigo-950">{formatBRL(summary.totalCommittedPo)}</p>
          <p className="text-xs text-slate-500 mt-1">
            Pedidos de compra aprovados aguardando NF/entrega
          </p>
        </div>

        <div className="bg-[#163C35] text-white p-5 rounded-3xl shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-200">
              Saldo de Verba Disponível
            </span>
            <div className="w-9 h-9 rounded-xl bg-white/10 text-emerald-300 flex items-center justify-center">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-white">{formatBRL(summary.totalRemaining)}</p>
          <p className="text-xs text-emerald-200/90 mt-1">
            {summary.centersInOverrunCount > 0
              ? `${summary.centersInOverrunCount} centro(s) ultrapassaram a meta`
              : summary.centersInAlertCount > 0
                ? `${summary.centersInAlertCount} centro(s) na faixa de atenção`
                : 'Todos os centros dentro da meta mensal'}
          </p>
        </div>
      </div>

      {/* Legenda das 3 Camadas + Barra de Filtro */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-600">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            Camadas de Consumo:
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-600 inline-block" /> 1. Pago (Baixado)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-400 inline-block" /> 2. A Pagar (Títulos no mês)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-indigo-500 inline-block" /> 3. Comprometido (OC Aprovada)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar centro ou responsável..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#0F5948]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
          >
            <option value="ALL">Todos os Status</option>
            <option value="SAUDAVEL">Dentro da Verba</option>
            <option value="ATENCAO">Em Atenção (&ge;80%)</option>
            <option value="ESTOURO">Verba Estourada (&gt;100%)</option>
          </select>
        </div>
      </div>

      {/* Grid Principal: Cards de Centros de Custo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filteredMetrics.map((m) => {
          const badge = statusBadgeConfig(m.status);
          const isSelected = selectedCenterId === m.costCenter.id;
          const hasMonthOverride =
            m.costCenter.monthlyOverrides &&
            Object.prototype.hasOwnProperty.call(m.costCenter.monthlyOverrides, yearMonth);

          // Percentuais para a barra empilhada (limitados a 100% visualmente)
          const denom = Math.max(m.budget, m.totalConsumed, 1);
          const paidW = Math.min(100, (m.paidAmount / denom) * 100);
          const pendingW = Math.min(100 - paidW, (m.pendingPayableAmount / denom) * 100);
          const committedW = Math.min(
            100 - paidW - pendingW,
            (m.committedPoAmount / denom) * 100
          );

          return (
            <div
              key={m.costCenter.id}
              onClick={() =>
                setSelectedCenterId(isSelected ? null : m.costCenter.id)
              }
              className={`bg-white rounded-3xl p-6 border transition-all cursor-pointer ${
                isSelected
                  ? 'border-[#0F5948] ring-2 ring-[#0F5948]/15 shadow-md'
                  : m.status === 'ESTOURO'
                    ? 'border-rose-200 hover:border-rose-300 shadow-sm'
                    : 'border-slate-200/80 hover:border-slate-300 shadow-sm'
              }`}
            >
              {/* Topo do Card */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm"
                    style={{ backgroundColor: m.costCenter.color || '#0F5948' }}
                  >
                    {m.costCenter.code || m.costCenter.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-black text-slate-900 truncate">
                        {m.costCenter.name}
                      </h3>
                      {hasMonthOverride && (
                        <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-extrabold">
                          Meta Específica {yearMonth}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                      {m.costCenter.responsibleName ? (
                        <span>Resp.: {m.costCenter.responsibleName}</span>
                      ) : (
                        <span>Alerta em {m.alertThresholdPercent}%</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border flex items-center gap-1.5 ${badge.bg}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                    {badge.label}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(m.costCenter);
                    }}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    title="Ajustar Verba / Editar Centro de Custo"
                  >
                    <Sliders size={14} />
                  </button>
                </div>
              </div>

              {/* Valores Principais: Consumido vs Verba */}
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <span className="text-xs font-bold text-slate-500">Consumido: </span>
                  <span className="text-lg font-black text-slate-900">
                    {formatBRL(m.totalConsumed)}
                  </span>
                  <span className="text-xs font-semibold text-slate-400">
                    {' '}
                    de {formatBRL(m.budget)}
                  </span>
                </div>
                <div className="text-right">
                  <span
                    className={`text-sm font-black ${
                      m.status === 'ESTOURO'
                        ? 'text-rose-600'
                        : m.status === 'ATENCAO'
                          ? 'text-amber-600'
                          : 'text-emerald-700'
                    }`}
                  >
                    {m.usagePercent.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Barra Empilhada de 3 Camadas */}
              <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden flex p-0.5 border border-slate-200/60">
                {paidW > 0 && (
                  <div
                    style={{ width: `${paidW}%` }}
                    className="h-full bg-emerald-600 first:rounded-l-full last:rounded-r-full transition-all duration-500"
                    title={`Pago: ${formatBRL(m.paidAmount)}`}
                  />
                )}
                {pendingW > 0 && (
                  <div
                    style={{ width: `${pendingW}%` }}
                    className="h-full bg-amber-400 first:rounded-l-full last:rounded-r-full transition-all duration-500"
                    title={`A Pagar: ${formatBRL(m.pendingPayableAmount)}`}
                  />
                )}
                {committedW > 0 && (
                  <div
                    style={{ width: `${committedW}%` }}
                    className="h-full bg-indigo-500 first:rounded-l-full last:rounded-r-full transition-all duration-500"
                    title={`Comprometido em OC: ${formatBRL(m.committedPoAmount)}`}
                  />
                )}
              </div>

              {/* Detalhamento das 3 Camadas + Saldo */}
              <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    1. Pago
                  </span>
                  <span className="font-extrabold text-emerald-700">
                    {formatBRL(m.paidAmount)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    2. A Pagar
                  </span>
                  <span className="font-extrabold text-amber-600">
                    {formatBRL(m.pendingPayableAmount)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    3. Em OCs
                  </span>
                  <span className="font-extrabold text-indigo-600">
                    {formatBRL(m.committedPoAmount)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    {m.overrunAmount > 0 ? 'Excedente' : 'Saldo Livre'}
                  </span>
                  <span
                    className={`font-black ${
                      m.overrunAmount > 0 ? 'text-rose-600' : 'text-slate-900'
                    }`}
                  >
                    {m.overrunAmount > 0
                      ? `- ${formatBRL(m.overrunAmount)}`
                      : formatBRL(m.remainingBudget)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Drill-down do Centro de Custo Selecionado */}
      {selectedMetrics && (
        <div className="bg-white rounded-3xl p-6 border-2 border-[#0F5948]/30 shadow-lg space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div
                className="w-4 h-10 rounded-full"
                style={{ backgroundColor: selectedMetrics.costCenter.color }}
              />
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  Extrato de Consumo · {selectedMetrics.costCenter.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Competência {formatMonthLabel(yearMonth)} · {selectedMetrics.items.length} registro(s) consumindo a verba
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openEditModal(selectedMetrics.costCenter)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-extrabold text-slate-700 flex items-center gap-1.5"
              >
                <Edit3 size={14} /> Ajustar Verba
              </button>
              <button
                type="button"
                onClick={() => setSelectedCenterId(null)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Ranking de Categorias no Centro de Custo */}
            <div className="lg:col-span-1 bg-slate-50 rounded-2xl p-4 border border-slate-200/70 space-y-3 h-fit">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                Consumo por Categoria
              </h4>
              {selectedMetrics.categoryBreakdown.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4">
                  Nenhum consumo registrado neste mês.
                </p>
              ) : (
                selectedMetrics.categoryBreakdown.map((cat) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-700 truncate pr-2">
                        {cat.category}
                      </span>
                      <span className="font-black text-slate-900 shrink-0">
                        {formatBRL(cat.amount)} ({cat.percent.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#0F5948]"
                        style={{ width: `${Math.min(100, cat.percent)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Lista de Lançamentos e OCs Comprometidas */}
            <div className="lg:col-span-2 overflow-x-auto">
              {selectedMetrics.items.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm font-semibold">
                  Nenhuma despesa ou Ordem de Compra comprometida neste Centro de Custo em {formatMonthLabel(yearMonth)}.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-400">
                      <th className="py-2.5 px-3">Camada</th>
                      <th className="py-2.5 px-3">Data / Venc.</th>
                      <th className="py-2.5 px-3">Descrição / Fornecedor</th>
                      <th className="py-2.5 px-3">Categoria</th>
                      <th className="py-2.5 px-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {selectedMetrics.items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-3">
                          {item.source === 'PAID_TX' && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-extrabold text-[10px]">
                              Pago
                            </span>
                          )}
                          {item.source === 'PENDING_TX' && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-extrabold text-[10px]">
                              A Pagar
                            </span>
                          )}
                          {item.source === 'COMMITTED_PO' && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-extrabold text-[10px]">
                              OC Aprovada
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-600 whitespace-nowrap">
                          {item.date ? item.date.slice(0, 10).split('-').reverse().join('/') : '—'}
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-bold text-slate-800">{item.description}</p>
                          {item.contactName && (
                            <p className="text-[11px] text-slate-500">{item.contactName}</p>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 font-medium">{item.category}</td>
                        <td className="py-3 px-3 text-right font-black text-slate-900 whitespace-nowrap">
                          {formatBRL(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criação / Edição de Centro de Custo e Verba */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  {editingCenter ? 'Configurar Verba & Centro de Custo' : 'Novo Centro de Custo'}
                </h3>
                <p className="text-xs text-slate-500">
                  Defina o teto mensal padrão ou ajuste a verba de {formatMonthLabel(yearMonth)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCenter} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Código / Sigla
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="CC-08"
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-[#0F5948]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Nome do Centro de Custo *
                  </label>
                  <input
                    required
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ex: Britagem Secundária & Peneiramento"
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-[#0F5948]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Responsável / Gestor
                  </label>
                  <input
                    type="text"
                    value={formResponsible}
                    onChange={(e) => setFormResponsible(e.target.value)}
                    placeholder="Ex: Eng. Roberto"
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-[#0F5948]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                    Alerta de Consumo (%)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={formAlertThreshold}
                    onChange={(e) => setFormAlertThreshold(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:border-[#0F5948]"
                  />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/70 space-y-3">
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-[#0F5948] block mb-1">
                    Teto Mensal Padrão (Verba Recorrente R$) *
                  </label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={formMonthlyBudget}
                    onChange={(e) => setFormMonthlyBudget(e.target.value)}
                    className="w-full p-3 rounded-xl bg-white border border-emerald-300 text-sm font-black text-slate-900 outline-none focus:border-[#0F5948]"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={formUseSpecificMonth}
                    onChange={(e) => setFormUseSpecificMonth(e.target.checked)}
                    className="rounded border-slate-300 text-[#0F5948] focus:ring-[#0F5948]"
                  />
                  Definir verba diferenciada apenas para {formatMonthLabel(yearMonth)}
                </label>

                {formUseSpecificMonth && (
                  <div>
                    <label className="text-[11px] font-extrabold uppercase text-purple-700 block mb-1">
                      Verba Específica para {yearMonth} (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formSpecificMonthBudget}
                      onChange={(e) => setFormSpecificMonthBudget(e.target.value)}
                      className="w-full p-3 rounded-xl bg-white border border-purple-300 text-sm font-black text-purple-900 outline-none"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1.5">
                  Cor de Identificação
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={`w-7 h-7 rounded-xl transition-transform ${
                        formColor === c ? 'scale-110 ring-2 ring-offset-2 ring-slate-800' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                {editingCenter && onDeleteCostCenter && !editingCenter.id.startsWith('cc') ? (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteCostCenter(editingCenter.id);
                      setIsModalOpen(false);
                    }}
                    className="px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-extrabold flex items-center gap-1"
                  >
                    <Trash2 size={14} /> Excluir
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-extrabold text-slate-600"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-[#0F5948] hover:bg-[#163C35] text-white text-xs font-extrabold shadow-md"
                  >
                    Salvar Configuração
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CostCenterBudgetDashboard;
