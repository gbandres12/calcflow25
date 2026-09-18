import React, { useState, useMemo } from 'react';
import { Customer, SaleOrder, Transaction, OrderStatus, PaymentReceipt, OrderWithdrawal } from '../types';
import { 
  ShoppingCart, 
  CheckCircle2, Clock, AlertTriangle, Truck, 
  Receipt, Printer,
  ChevronRight, ShieldAlert, BadgePercent, Scale, Edit3
} from 'lucide-react';
import { calculateOrderPayment } from './SalesOrders';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { COMPANY_INFO } from '../constants';
import { FlowSheet } from './ui/FlowSheet';

interface CustomerDetailsModalProps {
  customer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  orders: SaleOrder[];
  transactions?: Transaction[];
  onEditCustomer?: (customer: Customer) => void;
}

export const CustomerDetailsModal: React.FC<CustomerDetailsModalProps> = ({
  customer,
  isOpen,
  onClose,
  orders,
  transactions = [],
  onEditCustomer
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'ORDERS' | 'DEBTS' | 'RECEIPTS' | 'WITHDRAWALS'>('OVERVIEW');
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentReceipt | null>(null);

  const formatBRL = (val?: number) => (Number.isFinite(val) ? val!.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00');

  // Cálculos Consolidados do Cliente
  const customerData = useMemo(() => {
    if (!customer) return null;

    const safeOrders = Array.isArray(orders) ? orders.filter(Boolean) : [];
    const customerOrders = safeOrders.filter(o => o && String(o.customerId) === String(customer.id));
    const finalizedOrders = customerOrders.filter(o => o && o.status === OrderStatus.FINALIZED);
    const budgetOrders = customerOrders.filter(o => o && o.status === OrderStatus.BUDGET);

    let totalPurchased = 0;
    let totalPaid = 0;
    let totalDebt = 0;
    let totalTonPurchased = 0;
    let totalTonWithdrawn = 0;

    finalizedOrders.forEach(order => {
      totalPurchased += Number(order.total) || 0;
      const paymentInfo = calculateOrderPayment(order);
      totalPaid += Number(paymentInfo.totalPaid) || 0;
      totalDebt += Number(paymentInfo.remainingDebt) || 0;

      const orderTons = (order.items || []).reduce((s, it) => s + (Number(it?.quantity) || 0), 0);
      totalTonPurchased += orderTons;

      const orderWithdrawnTons = (order.withdrawals || []).reduce((s, w) => s + (Number(w?.quantityWithdrawn) || 0), 0);
      totalTonWithdrawn += orderWithdrawnTons;
    });

    const pendingTonBalance = Math.max(0, totalTonPurchased - totalTonWithdrawn);
    const paymentPercentage = totalPurchased > 0 ? Math.min(100, (totalPaid / totalPurchased) * 100) : 0;
    const withdrawalPercentage = totalTonPurchased > 0 ? Math.min(100, (totalTonWithdrawn / totalTonPurchased) * 100) : 0;

    // Todos os Recibos do Cliente
    const receipts: (PaymentReceipt & { orderReference?: string })[] = [];
    customerOrders.forEach(o => {
      (o.receipts || []).forEach(r => {
        if (!r) return;
        receipts.push({
          ...r,
          orderReference: o.reference
        });
      });
    });
    // Ordena recibos por data decrescente
    receipts.sort((a, b) => (b?.date || '').localeCompare(a?.date || ''));

    // Todas as Retiradas / Romaneios do Cliente
    const withdrawals: (OrderWithdrawal & { orderReference?: string })[] = [];
    customerOrders.forEach(o => {
      (o.withdrawals || []).forEach(w => {
        if (!w) return;
        withdrawals.push({
          ...w,
          orderReference: o.reference
        });
      });
    });
    // Ordena retiradas por data decrescente
    withdrawals.sort((a, b) => (b?.date || '').localeCompare(a?.date || ''));

    // Pedidos com débitos pendentes
    const ordersWithDebt = finalizedOrders.filter(o => calculateOrderPayment(o).remainingDebt > 0.01);

    // Status Financeiro Geral
    let financialStatus: 'ADIMPLENTE' | 'PENDENTE' | 'SEM_COMPRAS' = 'SEM_COMPRAS';
    if (finalizedOrders.length > 0) {
      financialStatus = totalDebt > 0.01 ? 'PENDENTE' : 'ADIMPLENTE';
    }

    return {
      customerOrders,
      finalizedOrders,
      budgetOrders,
      ordersWithDebt,
      totalPurchased,
      totalPaid,
      totalDebt,
      totalTonPurchased,
      totalTonWithdrawn,
      pendingTonBalance,
      paymentPercentage,
      withdrawalPercentage,
      receipts,
      withdrawals,
      financialStatus
    };
  }, [customer, orders]);

  if (!isOpen || !customer || !customerData) return null;

  return (
    <FlowSheet
      title={customer.name}
      wide
      zIndexClass="z-[120]"
      onClose={onClose}
      subtitle={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono">{customer.document || 'Doc. não informado'}</span>
          {customerData.financialStatus === 'ADIMPLENTE' ? (
            <span className="text-emerald-700">Quitado</span>
          ) : customerData.financialStatus === 'PENDENTE' ? (
            <span className="text-rose-600">Débito {formatBRL(customerData.totalDebt)}</span>
          ) : (
            <span>Sem vendas</span>
          )}
          <span>Comprado {formatBRL(customerData.totalPurchased)}</span>
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          {onEditCustomer ? (
            <button
              type="button"
              onClick={() => onEditCustomer(customer)}
              className="min-h-11 px-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 border border-slate-200 rounded-xl"
            >
              <Edit3 size={14} /> Editar
            </button>
          ) : <span />}
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-5 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase"
          >
            Fechar
          </button>
        </div>
      }
    >
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`shrink-0 px-3 py-2.5 min-h-11 rounded-xl text-[11px] font-bold transition-all inline-flex items-center gap-1.5 ${
              activeTab === 'OVERVIEW'
                ? 'bg-slate-900 text-white'
                : 'text-slate-500 hover:text-slate-900 bg-slate-100'
            }`}
          >
            <BadgePercent size={15} />
            Geral
          </button>

          <button
            onClick={() => setActiveTab('ORDERS')}
            className={`shrink-0 px-3 py-2.5 min-h-11 rounded-xl text-[11px] font-bold transition-all inline-flex items-center gap-1.5 ${
              activeTab === 'ORDERS'
                ? 'bg-slate-900 text-white'
                : 'text-slate-500 hover:text-slate-900 bg-slate-100'
            }`}
          >
            <ShoppingCart size={15} />
            Pedidos ({customerData.customerOrders.length})
          </button>

          <button
            onClick={() => setActiveTab('DEBTS')}
            className={`shrink-0 px-3 py-2.5 min-h-11 rounded-xl text-[11px] font-bold transition-all inline-flex items-center gap-1.5 ${
              activeTab === 'DEBTS'
                ? 'bg-rose-600 text-white'
                : 'text-slate-500 hover:text-rose-700 bg-slate-100'
            }`}
          >
            <AlertTriangle size={15} />
            Débitos ({customerData.ordersWithDebt.length})
          </button>

          <button
            onClick={() => setActiveTab('RECEIPTS')}
            className={`shrink-0 px-3 py-2.5 min-h-11 rounded-xl text-[11px] font-bold transition-all inline-flex items-center gap-1.5 ${
              activeTab === 'RECEIPTS'
                ? 'bg-emerald-700 text-white'
                : 'text-slate-500 hover:text-emerald-700 bg-slate-100'
            }`}
          >
            <Receipt size={15} />
            Recibos ({customerData.receipts.length})
          </button>

          <button
            onClick={() => setActiveTab('WITHDRAWALS')}
            className={`shrink-0 px-3 py-2.5 min-h-11 rounded-xl text-[11px] font-bold transition-all inline-flex items-center gap-1.5 ${
              activeTab === 'WITHDRAWALS'
                ? 'bg-blue-700 text-white'
                : 'text-slate-500 hover:text-blue-700 bg-slate-100'
            }`}
          >
            <Truck size={15} />
            Cargas ({customerData.withdrawals.length})
          </button>
        </div>

        <div className="pt-4 space-y-6">
          
          {/* ABA 1: VISÃO GERAL */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6">

              {(customer.street || customer.zipCode || customer.ibgeCode) && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Logradouro</span>
                    <p className="font-bold text-slate-800">{customer.street || '—'}{customer.number ? `, ${customer.number}` : ''}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">CEP</span>
                    <p className="font-mono font-bold text-slate-800">{customer.zipCode || '—'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Cidade / UF</span>
                    <p className="font-bold text-slate-800">{customer.city || '—'} - {customer.state || '—'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Código IBGE</span>
                    <p className="font-mono font-black text-slate-800">{customer.ibgeCode || 'não informado'}</p>
                  </div>
                </div>
              )}
              
              {/* 4 Cards de Indicadores Consolidados */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <ShoppingCart size={13} className="text-purple-600" /> Total Faturado
                  </span>
                  <p className="text-xl font-black text-slate-900">{formatBRL(customerData.totalPurchased)}</p>
                  <p className="text-[10px] font-bold text-slate-500">{customerData.finalizedOrders.length} pedido(s) confirmados</p>
                </div>

                <div className="bg-emerald-50/60 p-5 rounded-2xl border border-emerald-100 space-y-1">
                  <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1">
                    <CheckCircle2 size={13} className="text-emerald-600" /> Total Pago / Quitado
                  </span>
                  <p className="text-xl font-black text-emerald-700">{formatBRL(customerData.totalPaid)}</p>
                  <div className="w-full bg-emerald-200/60 h-1.5 rounded-full overflow-hidden mt-1">
                    <div className="bg-emerald-600 h-full rounded-full transition-all" style={{ width: `${customerData.paymentPercentage}%` }}></div>
                  </div>
                  <p className="text-[10px] font-bold text-emerald-800">{customerData.paymentPercentage.toFixed(1)}% do valor liquidado</p>
                </div>

                <div className={`p-5 rounded-2xl border space-y-1 ${
                  customerData.totalDebt > 0 
                    ? 'bg-rose-50/60 border-rose-200 text-rose-900' 
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                    <AlertTriangle size={13} className={customerData.totalDebt > 0 ? 'text-rose-600' : 'text-slate-400'} /> 
                    Débito em Aberto
                  </span>
                  <p className={`text-xl font-black ${customerData.totalDebt > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                    {formatBRL(customerData.totalDebt)}
                  </p>
                  <p className="text-[10px] font-bold">
                    {customerData.ordersWithDebt.length > 0 
                      ? `${customerData.ordersWithDebt.length} pedido(s) com pendência` 
                      : 'Nenhuma pendência financeira'}
                  </p>
                </div>

                <div className="bg-blue-50/60 p-5 rounded-2xl border border-blue-100 space-y-1">
                  <span className="text-[10px] font-black text-blue-800 uppercase tracking-widest flex items-center gap-1">
                    <Scale size={13} className="text-blue-600" /> Saldo em Toneladas (TON)
                  </span>
                  <p className="text-xl font-black text-blue-900">{customerData.pendingTonBalance.toFixed(2)} TON</p>
                  <div className="w-full bg-blue-200/60 h-1.5 rounded-full overflow-hidden mt-1">
                    <div className="bg-blue-600 h-full rounded-full transition-all" style={{ width: `${customerData.withdrawalPercentage}%` }}></div>
                  </div>
                  <p className="text-[10px] font-bold text-blue-800">
                    {customerData.totalTonWithdrawn.toFixed(1)} / {customerData.totalTonPurchased.toFixed(1)} TON retiradas
                  </p>
                </div>
              </div>

              {/* Alerta Destacado se houver Débito */}
              {customerData.totalDebt > 0 && (
                <div className="p-5 bg-rose-50 border border-rose-200 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-rose-600 text-white rounded-2xl">
                      <ShieldAlert size={24} />
                    </div>
                    <div>
                      <h4 className="font-black text-rose-950 text-sm">Cliente com Débito Pendente</h4>
                      <p className="text-xs text-rose-700 font-medium">
                        Existe um saldo devedor consolidado de <strong className="font-black">{formatBRL(customerData.totalDebt)}</strong> distribuído em {customerData.ordersWithDebt.length} pedido(s).
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('DEBTS')}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase transition-all shadow-md shadow-rose-200 flex items-center gap-2"
                  >
                    Ver Pedidos Devedores <ChevronRight size={14} />
                  </button>
                </div>
              )}

              {/* Últimos Pedidos Recentes do Cliente */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Últimos Pedidos de Venda</h4>
                  <button 
                    onClick={() => setActiveTab('ORDERS')} 
                    className="text-xs font-black text-purple-600 hover:underline flex items-center gap-1"
                  >
                    Ver todos ({customerData.customerOrders.length}) <ChevronRight size={14} />
                  </button>
                </div>

                {customerData.customerOrders.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 text-xs font-bold">
                    Nenhum pedido de venda registrado para este cliente até o momento.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {customerData.customerOrders.slice(0, 3).map(order => {
                      const { totalPaid, remainingDebt, paymentStatus } = calculateOrderPayment(order);
                      return (
                        <div key={order.id} className="p-4 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200/70 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 transition-all">
                          <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl ${order.status === OrderStatus.FINALIZED ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                              <ShoppingCart size={18} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-black text-sm text-slate-900">{order.reference}</span>
                                <span className="text-[10px] font-bold text-slate-400">• Emissão: {order.date}</span>
                              </div>
                              <p className="text-xs text-slate-500 font-medium">
                                {(order.items || []).filter(Boolean).map(i => `${i?.productName || 'Item'} (${i?.quantity || 0}T)`).join(', ')}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-xs font-black text-slate-900">{formatBRL(order.total)}</p>
                              <p className="text-[10px] font-bold text-slate-400">Pago: {formatBRL(totalPaid)}</p>
                            </div>
                            {order.status === OrderStatus.BUDGET ? (
                              <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-300">
                                Orçamento
                              </span>
                            ) : paymentStatus === 'PAGO' ? (
                              <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1">
                                <CheckCircle2 size={11} /> Quitado
                              </span>
                            ) : paymentStatus === 'PARCIAL' ? (
                              <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                                <Clock size={11} /> Parcial (Débito: {formatBRL(remainingDebt)})
                              </span>
                            ) : (
                              <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-300 flex items-center gap-1">
                                <AlertTriangle size={11} /> Pendente ({formatBRL(remainingDebt)})
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ABA 2: HISTÓRICO COMPLETO DE PEDIDOS */}
          {activeTab === 'ORDERS' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Lista Completa de Pedidos ({customerData.customerOrders.length})
                </h4>
              </div>

              {customerData.customerOrders.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 rounded-3xl border border-slate-200 text-slate-400 text-sm font-bold">
                  Nenhum pedido encontrado para este cliente.
                </div>
              ) : (
                <div className="space-y-3">
                  {customerData.customerOrders.slice().reverse().map(order => {
                    const { totalPaid, remainingDebt, financialProgress, paymentStatus } = calculateOrderPayment(order);
                    const totalQty = (order.items || []).reduce((s, it) => s + (it.quantity || 0), 0);
                    const totalWithdrawn = (order.withdrawals || []).reduce((s, w) => s + (w.quantityWithdrawn || 0), 0);

                    return (
                      <div key={order.id} className="p-5 bg-white rounded-2xl border border-slate-200/90 shadow-sm space-y-4 hover:border-purple-300 transition-all">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pb-3 border-b border-slate-100">
                          <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl ${
                              order.status === OrderStatus.BUDGET
                                ? 'bg-amber-100 text-amber-700'
                                : paymentStatus === 'PAGO'
                                ? 'bg-emerald-100 text-emerald-700'
                                : paymentStatus === 'PARCIAL'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}>
                              <ShoppingCart size={18} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-black text-sm text-slate-900">{order.reference}</span>
                                <span className="text-[10px] font-bold text-slate-400">• Data: {order.date}</span>
                                {order.sellerName && (
                                  <span className="text-[10px] font-bold text-slate-400">• Vendedor: {order.sellerName}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {order.status === OrderStatus.BUDGET ? (
                              <span className="text-[10px] font-black uppercase px-3 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-300">
                                Orçamento
                              </span>
                            ) : paymentStatus === 'PAGO' ? (
                              <span className="text-[10px] font-black uppercase px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1">
                                <CheckCircle2 size={12} /> Quitado (100%)
                              </span>
                            ) : paymentStatus === 'PARCIAL' ? (
                              <span className="text-[10px] font-black uppercase px-3 py-1 rounded-xl bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                                <Clock size={12} /> Parcial (Débito: {formatBRL(remainingDebt)})
                              </span>
                            ) : (
                              <span className="text-[10px] font-black uppercase px-3 py-1 rounded-xl bg-rose-50 text-rose-700 border border-rose-300 flex items-center gap-1">
                                <AlertTriangle size={12} /> Débito: {formatBRL(remainingDebt)}
                              </span>
                            )}

                            {order.nfeStatus === 'autorizada' && (
                              <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                                NF-e {order.nfeNumero || 'Emitida'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Itens do Pedido */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl">
                          <div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Itens Adquiridos</span>
                            <ul className="space-y-1">
                              {(order.items || []).filter(Boolean).map((it, idx) => (
                                <li key={idx} className="font-bold text-slate-700 flex justify-between">
                                  <span>{it?.productName || 'Item'} ({it?.quantity || 0} {it?.unit || 'Ton'})</span>
                                  <span>{formatBRL(it?.total)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="space-y-1 border-t md:border-t-0 md:border-l border-slate-200 pt-2 md:pt-0 md:pl-3">
                            <div className="flex justify-between font-black text-slate-900">
                              <span>Valor Total:</span>
                              <span>{formatBRL(order.total)}</span>
                            </div>
                            <div className="flex justify-between text-emerald-700 font-bold text-[11px]">
                              <span>Total Liquidado:</span>
                              <span>{formatBRL(totalPaid)} ({financialProgress.toFixed(0)}%)</span>
                            </div>
                            {remainingDebt > 0 && (
                              <div className="flex justify-between text-rose-700 font-black text-[11px]">
                                <span>Saldo Devedor:</span>
                                <span>{formatBRL(remainingDebt)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-blue-700 font-bold text-[11px] pt-1">
                              <span>Expedição / Carga:</span>
                              <span>{totalWithdrawn.toFixed(1)} de {totalQty.toFixed(1)} TON</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ABA 3: DÉBITOS PENDENTES */}
          {activeTab === 'DEBTS' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    Pedidos com Débitos Pendentes ({customerData.ordersWithDebt.length})
                  </h4>
                  <p className="text-xs text-slate-500 font-medium">Controle de títulos e valores ainda não liquidados</p>
                </div>
                {customerData.totalDebt > 0 && (
                  <div className="px-4 py-2 bg-rose-50 border border-rose-200 rounded-xl text-right">
                    <span className="text-[10px] font-black text-rose-600 uppercase tracking-wider block">Dívida Consolidada</span>
                    <span className="text-base font-black text-rose-700">{formatBRL(customerData.totalDebt)}</span>
                  </div>
                )}
              </div>

              {customerData.ordersWithDebt.length === 0 ? (
                <div className="p-16 text-center bg-emerald-50/50 rounded-3xl border border-emerald-200 text-emerald-800 space-y-2">
                  <CheckCircle2 size={40} className="mx-auto text-emerald-600" />
                  <p className="text-base font-black">Cliente 100% Adimplente!</p>
                  <p className="text-xs text-emerald-700 font-medium">Não há débitos em aberto para este cliente.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {customerData.ordersWithDebt.map(order => {
                    const { totalPaid, remainingDebt, financialProgress } = calculateOrderPayment(order);
                    return (
                      <div key={order.id} className="p-5 bg-white rounded-2xl border-l-[6px] border-l-rose-500 border border-slate-200 shadow-sm space-y-3">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-base text-slate-900">{order.reference}</span>
                              <span className="text-xs text-slate-400 font-bold">• Data: {order.date}</span>
                            </div>
                            <p className="text-xs text-slate-600 font-medium mt-0.5">
                              {(order.items || []).filter(Boolean).map(i => `${i?.productName || 'Item'} (${i?.quantity || 0}T)`).join(', ')}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest block">Débito Restante</span>
                            <span className="text-lg font-black text-rose-700">{formatBRL(remainingDebt)}</span>
                          </div>
                        </div>

                        {/* Barra de Progresso de Quitação */}
                        <div className="space-y-1 bg-slate-50 p-3 rounded-xl">
                          <div className="flex justify-between text-[11px] font-black text-slate-700">
                            <span>Valor Total do Pedido: {formatBRL(order.total)}</span>
                            <span className="text-emerald-700">Total Abatido / Pago: {formatBRL(totalPaid)} ({financialProgress.toFixed(0)}%)</span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${financialProgress}%` }}></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ABA 4: HISTÓRICO DE RECIBOS */}
          {activeTab === 'RECEIPTS' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Comprovantes e Recibos Emitidos ({customerData.receipts.length})
                </h4>
              </div>

              {customerData.receipts.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 rounded-3xl border border-slate-200 text-slate-400 text-sm font-bold">
                  Nenhum recibo de pagamento emitido para este cliente.
                </div>
              ) : (
                <div className="space-y-2">
                  {customerData.receipts.map(receipt => (
                    <div key={receipt.id} className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 hover:border-emerald-300 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl">
                          <Receipt size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-slate-900">{receipt.id}</span>
                            {receipt.orderReference && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-purple-100 text-purple-700">
                                Pedido: {receipt.orderReference}
                              </span>
                            )}
                            <span className="text-xs text-slate-400 font-bold">• Data: {receipt.date}</span>
                          </div>
                          <p className="text-xs text-slate-600 font-medium">
                            {receipt.description || 'Recebimento de Venda'} • Forma: <strong className="font-bold text-slate-800">{receipt.paymentMethod || 'PIX / Dinheiro'}</strong>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-base font-black text-emerald-700">{formatBRL(receipt.amount)}</span>
                          {receipt.remainingDebt !== undefined && receipt.remainingDebt > 0 && (
                            <p className="text-[10px] font-bold text-slate-400">Saldo Restante: {formatBRL(receipt.remainingDebt)}</p>
                          )}
                        </div>
                        <button
                          onClick={() => setSelectedReceipt(receipt)}
                          className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl transition-all font-black text-xs flex items-center gap-1.5"
                          title="Visualizar / Imprimir Recibo Oficial"
                        >
                          <Printer size={15} /> Imprimir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ABA 5: ROMANEIOS DE CARGA & EXPEDIÇÃO */}
          {activeTab === 'WITHDRAWALS' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Romaneios e Viagens de Caminhão ({customerData.withdrawals.length})
                </h4>
                <div className="text-xs font-black text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200">
                  Total Carregado: {customerData.totalTonWithdrawn.toFixed(2)} TON
                </div>
              </div>

              {customerData.withdrawals.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 rounded-3xl border border-slate-200 text-slate-400 text-sm font-bold">
                  Nenhuma retirada de carga registrada para este cliente.
                </div>
              ) : (
                <div className="space-y-2">
                  {customerData.withdrawals.map(w => (
                    <div key={w.id} className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-50 text-blue-700 rounded-xl">
                          <Truck size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-slate-900 font-mono">Placa: {w.plateNumber}</span>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                              Ticket: {w.weighTicketNumber || 'S/N'}
                            </span>
                            {w.orderReference && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-purple-100 text-purple-700">
                                Pedido: {w.orderReference}
                              </span>
                            )}
                            <span className="text-xs text-slate-400 font-bold">• Data: {w.date}</span>
                          </div>
                          <p className="text-xs text-slate-600 font-medium">
                            Motorista: <strong className="font-bold text-slate-800">{w.driverName}</strong> (Doc: {w.driverCpf || 'N/I'}) • Tipo: {w.truckModel || 'Truck'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-base font-black text-blue-700">{w.quantityWithdrawn.toFixed(2)} TON</span>
                        {w.remainingBalanceQuantity !== undefined && (
                          <p className="text-[10px] font-bold text-slate-400">Saldo Pedido: {w.remainingBalanceQuantity.toFixed(2)} TON</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

      {selectedReceipt && (
        <PaymentReceiptModal
          receipt={selectedReceipt}
          company={COMPANY_INFO}
          onClose={() => setSelectedReceipt(null)}
        />
      )}
    </FlowSheet>
  );
};
