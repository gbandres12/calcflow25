import React, { useState } from 'react';
import { Machine, StoreItem, MaintenanceRecord, SaleOrder, OrderWithdrawal, Customer, Company, Transportador, StockYard, BargeDischargeRecord, Transaction } from '../types';
import { 
  Boxes, Plus, Wrench, Search, Package, AlertTriangle, 
  X, Edit, Scale, Truck, Printer, Send, Calendar, 
  CheckCircle2, FileText, UserCheck, ArrowDownRight, ArrowUpRight, Trash2,
  Ship, Layers, Anchor
} from 'lucide-react';
import { OrderWithdrawalModal } from './OrderWithdrawalModal';
import { CloseWithdrawalsModal } from './CloseWithdrawalsModal';
import { BargeDischargeModal } from './BargeDischargeModal';
import { QuickStockYardModal } from './QuickStockYardModal';
import { QuickDriverModal } from './QuickDriverModal';
import { CloseWithdrawalsResult, adjustOrderForOverWithdrawal } from '../services/domain/orderWithdrawalClose';
import { formatTons, openOrdersForLoading, orderLoadingProgress, sumTons } from '../services/domain/loadings';
import { printThermalTicket } from '../services/domain/thermalTicket';
import { dateISOBR } from "../utils/dateFilterUtils";
import { useConfirm } from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';

interface YardManagementProps {
  machines: Machine[];
  storeItems: StoreItem[];
  maintenances: MaintenanceRecord[];
  orders?: SaleOrder[];
  transactions?: Transaction[];
  customers?: Customer[];
  company?: Company;
  transportadores?: Transportador[];
  stockYards?: StockYard[];
  bargeDischarges?: BargeDischargeRecord[];
  operatorName?: string;
  onAddMaintenance: (record: Omit<MaintenanceRecord, 'id' | 'companyId'>) => void;
  onAddStoreItem: (item: Omit<StoreItem, 'id' | 'companyId'>) => void;
  onUpdateStoreItem: (item: StoreItem) => void;
  onUpdateOrder?: (order: SaleOrder) => void;
  onCloseOrderWithdrawals?: (result: CloseWithdrawalsResult) => void;
  onAddStockYard?: (yard: Omit<StockYard, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>) => StockYard | Promise<StockYard>;
  onAddTransportador?: (data: Omit<Transportador, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>) => Transportador | Promise<Transportador>;
  onSaveBargeDischarge?: (record: BargeDischargeRecord) => void;
}

const YardManagement: React.FC<YardManagementProps> = ({ 
  machines, 
  storeItems, 
  maintenances, 
  orders = [],
  transactions = [],
  customers = [],
  company,
  transportadores = [],
  stockYards = [],
  bargeDischarges = [],
  operatorName,
  onAddMaintenance, 
  onAddStoreItem, 
  onUpdateStoreItem,
  onUpdateOrder,
  onCloseOrderWithdrawals,
  onAddStockYard,
  onAddTransportador,
  onSaveBargeDischarge
}) => {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [activeTab, setActiveTab] = useState<'weighbridge' | 'yards' | 'store' | 'maintenance'>('weighbridge');
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [isMaintModalOpen, setIsMaintModalOpen] = useState(false);
  const [editingStoreItem, setEditingStoreItem] = useState<StoreItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modais de Descarga de Balsa e Pátio Rápido
  const [isBargeModalOpen, setIsBargeModalOpen] = useState(false);
  const [isQuickYardModalOpen, setIsQuickYardModalOpen] = useState(false);
  
  // Balança / Expedição Modal
  const [selectedOrderForWeigh, setSelectedOrderForWeigh] = useState<SaleOrder | null>(null);
  const [orderForClosingWithdrawals, setOrderForClosingWithdrawals] = useState<SaleOrder | null>(null);
  const [viewingWithdrawal, setViewingWithdrawal] = useState<{ withdrawal: OrderWithdrawal; order: SaleOrder } | null>(null);

  // Formulário Almoxarifado
  const [storeForm, setStoreForm] = useState({
    name: '',
    category: 'Peças' as StoreItem['category'],
    quantity: 0,
    unit: 'UN',
    minStock: 1
  });

  // Formulário Manutenção
  const [maintForm, setMaintForm] = useState({
    machineId: '',
    date: dateISOBR(),
    description: '',
    cost: 0,
    type: 'Preventiva' as MaintenanceRecord['type'],
    horimeter: 0
  });

  const defaultCompany: Company = company || {
    id: 'matriz-demo',
    name: 'CalcárioFlow Usina e Mineração',
    code: 'MATRIZ',
    document: '00.000.000/0001-00',
    city: 'Itaituba',
    state: 'PA',
    address: 'Rodovia Transamazônica, KM 18',
    isActive: true
  };

  // Coleta de todas as retiradas/pesagens realizadas nos pedidos
  const allWithdrawals = orders.flatMap(order => 
    (order.withdrawals || []).map(w => ({
      withdrawal: w,
      order: order,
      customer: customers.find(c => c.id === order.customerId)
    }))
  ).sort((a, b) => new Date(b.withdrawal.date).getTime() - new Date(a.withdrawal.date).getTime());

  const filteredWithdrawals = allWithdrawals.filter(item => 
    item.withdrawal.plateNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.withdrawal.driverName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.withdrawal.weighTicketNumber && item.withdrawal.weighTicketNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (item.customer?.name && item.customer.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (item.order.reference && item.order.reference.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredStoreItems = storeItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pedidos com saldo disponível para carregamento na balança
  // Só venda confirmada com saldo: orçamento e pedido cancelado não carregam.
  const ordersWithAvailableBalance = openOrdersForLoading(orders);

  const handleOpenStoreModal = (item?: StoreItem) => {
    if (item) {
      setEditingStoreItem(item);
      setStoreForm({
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        minStock: item.minStock
      });
    } else {
      setEditingStoreItem(null);
      setStoreForm({ name: '', category: 'Peças', quantity: 0, unit: 'UN', minStock: 1 });
    }
    setIsStoreModalOpen(true);
  };

  const handleAddStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingStoreItem) {
      onUpdateStoreItem({ ...editingStoreItem, ...storeForm });
    } else {
      onAddStoreItem(storeForm);
    }
    setIsStoreModalOpen(false);
    setStoreForm({ name: '', category: 'Peças', quantity: 0, unit: 'UN', minStock: 1 });
    setEditingStoreItem(null);
  };

  const handleAddMaint = (e: React.FormEvent) => {
    e.preventDefault();
    onAddMaintenance(maintForm);
    setIsMaintModalOpen(false);
    setMaintForm({ machineId: '', date: dateISOBR(), description: '', cost: 0, type: 'Preventiva', horimeter: 0 });
  };

  const handleSaveWithdrawal = (withdrawal: OrderWithdrawal) => {
    if (!selectedOrderForWeigh || !onUpdateOrder) return;
    const existing = selectedOrderForWeigh.withdrawals || [];
    const exists = existing.some(w => w.id === withdrawal.id);
    const updatedWithdrawals = exists
      ? existing.map(w => w.id === withdrawal.id ? withdrawal : w)
      : [...existing, withdrawal];

    const totalContracted = (selectedOrderForWeigh.items || []).reduce((s, it) => s + (it.quantity || 0), 0);
    const alreadyWithdrawnBefore = existing.filter(w => w.id !== withdrawal.id).reduce((s, w) => s + (w.quantityWithdrawn || 0), 0);
    const excess = Math.max(0, (alreadyWithdrawnBefore + (withdrawal.quantityWithdrawn || 0)) - totalContracted);

    let baseOrder: SaleOrder = {
      ...selectedOrderForWeigh,
      withdrawals: updatedWithdrawals
    };

    if (excess > 0.01) {
      const adj = adjustOrderForOverWithdrawal(
        baseOrder,
        withdrawal.quantityWithdrawn,
        excess,
        `tx-excesso-${Date.now()}`,
        dateISOBR()
      );
      baseOrder = adj.updatedOrder;
    }

    setSelectedOrderForWeigh(baseOrder);
    onUpdateOrder(baseOrder);
  };

  const handleDeleteWithdrawal = async (w: OrderWithdrawal, order: SaleOrder) => {
    if (!onUpdateOrder) return;
    const confirmed = await confirmDialog({
      title: `Excluir Retirada / Ticket ${w.weighTicketNumber || w.plateNumber}?`,
      description: `Esta ação removerá o registro de pesagem de ${w.quantityWithdrawn} t (Motorista: ${w.driverName || 'N/I'}, Placa: ${w.plateNumber}) do Pedido #${order.reference}. O saldo restante voltará a ficar disponível para carregamento.`,
      confirmLabel: 'Excluir Retirada',
      danger: true
    });
    if (!confirmed) return;
    const updatedWithdrawals = (order.withdrawals || []).filter(item => item.id !== w.id);
    const updatedOrder: SaleOrder = {
      ...order,
      withdrawals: updatedWithdrawals
    };
    onUpdateOrder(updatedOrder);
    toast.push(`Retirada ${w.weighTicketNumber || w.plateNumber} excluída com sucesso.`, 'success');
  };

  const handleSendWhatsAppTicket = (w: OrderWithdrawal, custName?: string) => {
    const text = `*COMPROVANTE DE PESAGEM / EXPEDIÇÃO DE CALCÁRIO*\nUsina: ${defaultCompany.name}\nTicket Nº: ${w.weighTicketNumber}\nData: ${w.date}\n\n👤 Cliente: ${custName || 'Cliente'}\n🚛 Placa / Veículo: ${w.plateNumber} ${w.truckModel ? `(${w.truckModel})` : ''}\n👨‍✈️ Motorista: ${w.driverName || 'N/I'}\n📦 Produto: ${w.productName || 'Calcário Agrícola'}\n📄 Quantidade da nota: *${formatTons(w.quantityWithdrawn)} t*${w.netWeight != null ? `\n⚖️ Peso líquido: ${formatTons(w.netWeight)} t` : ''}\n\nSaldo Restante do Pedido: ${w.remainingBalanceQuantity !== undefined ? `${formatTons(w.remainingBalanceQuantity)} t` : '-'}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Reimpressão sai no mesmo ticket térmico de 80 mm do lançamento.
  const reprintTicket = (w: OrderWithdrawal, order: SaleOrder) => {
    const customer = customers.find((c) => c.id === order.customerId);
    printThermalTicket({
      companyName: defaultCompany.name,
      companyCity: [defaultCompany.city, defaultCompany.state].filter(Boolean).join('-'),
      ticketNumber: w.weighTicketNumber || w.id,
      date: w.date,
      customerName: customer?.name || 'Cliente',
      customerDocument: customer?.document,
      orderReference: order.reference,
      productName: w.productName || order.items?.[0]?.productName || '',
      transporterName: w.transporterName,
      driverName: w.driverName,
      driverCpf: w.driverCpf,
      plateNumber: w.plateNumber,
      quantity: w.quantityWithdrawn,
      netWeight: w.netWeight,
      nfeNumero: w.nfeNumero,
      totalOrder: w.totalOrderQuantity,
      remaining: w.remainingBalanceQuantity,
      operatorName: w.loadedBy
    });
  };

  return (
    <div className="space-y-6">
      {/* Header com Abas */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Pátio, Balança & Suprimentos</h2>
            <span className="bg-slate-900 text-white text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full">
              Operacional
            </span>
          </div>
          <p className="text-slate-500 text-sm font-medium">
            Pesagem na balança, romaneios de expedição, almoxarifado de peças e manutenções
          </p>
        </div>

        {/* Actions & Tab Selector */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setIsBargeModalOpen(true)}
            className="flex-1 sm:flex-initial min-h-11 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-extrabold text-xs transition-all shadow-md flex items-center justify-center gap-2"
          >
            <Ship size={16} /> Descarga Fluvial / Balsa
          </button>

          <div className="flex bg-slate-200/80 p-1 rounded-xl border border-slate-200 w-full sm:w-auto overflow-x-auto">
            <button 
              onClick={() => setActiveTab('weighbridge')} 
              className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                activeTab === 'weighbridge' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Scale size={14} /> Balança & Expedição
            </button>
            <button 
              onClick={() => setActiveTab('yards')} 
              className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                activeTab === 'yards' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers size={14} /> Pátios de Calcário ({stockYards.length})
            </button>
            <button 
              onClick={() => setActiveTab('store')} 
              className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                activeTab === 'store' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Boxes size={14} /> Almoxarifado
            </button>
          <button 
            onClick={() => setActiveTab('maintenance')} 
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'maintenance' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wrench size={14} /> Manutenções
          </button>
          </div>
        </div>
      </header>

      {/* ABA 1: BALANÇA & EXPEDIÇÃO */}
      {activeTab === 'weighbridge' && (
        <div className="space-y-6">
          {/* Card Informativo e Ação Rápida de Pesagem */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5">
              <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl">
                <Truck size={20} />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Pesagens Realizadas</span>
                <p className="text-xl font-black text-slate-800">{allWithdrawals.length} Cargas</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5">
              <div className="p-2.5 bg-purple-50 text-purple-700 rounded-xl">
                <Scale size={20} />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Volume Total Expedido</span>
                <p className="text-xl font-black text-slate-800">
                  {formatTons(sumTons(allWithdrawals.map((item) => item.withdrawal.quantityWithdrawn || 0)))} t
                </p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5">
              <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl">
                <FileText size={20} />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Pedidos com Saldo</span>
                <p className="text-xl font-black text-slate-800">{ordersWithAvailableBalance.length} Pedidos</p>
              </div>
            </div>
          </div>

          {/* Pedidos Prontos para Carregamento na Balança */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Scale size={16} className="text-emerald-600" /> Carregar Caminhão na Balança
                </h3>
                <p className="text-xs text-slate-500 font-medium">Selecione o pedido do cliente com saldo para registrar pesagem e emitir romaneio</p>
              </div>
            </div>

            {ordersWithAvailableBalance.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500 text-xs font-medium">
                Nenhum pedido de venda com saldo pendente de retirada no momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {ordersWithAvailableBalance.map(order => {
                  const customer = customers.find(c => c.id === order.customerId);
                  const { contracted: totalQty, remaining: balance } = orderLoadingProgress(order);

                  return (
                    <div key={order.id} className="p-4 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 transition-all flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-xs font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                            {order.reference}
                          </span>
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Saldo: {formatTons(balance)} t
                          </span>
                        </div>
                        <p className="font-bold text-slate-900 text-sm mt-2 leading-tight">{customer?.name || 'Cliente'}</p>
                        <p className="text-xs text-slate-500">{order.items[0]?.productName || 'Calcário Agrícola'}</p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-xs">
                        <span className="text-slate-500 text-xs">Total: {totalQty} Ton</span>
                        <div className="flex items-center gap-1.5">
                          {(order.withdrawals || []).length > 0 && (
                            <button
                              onClick={() => setOrderForClosingWithdrawals(order)}
                              title="Encerrar retiradas com a sobra atual de saldo"
                              className="min-h-12 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-lg transition-all flex items-center gap-1.5 text-xs whitespace-nowrap active:scale-95"
                            >
                              <CheckCircle2 size={14} className="text-amber-700" /> Encerrar
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedOrderForWeigh(order)}
                            className="min-h-12 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-all flex items-center gap-2 text-sm whitespace-nowrap shrink-0 active:scale-95"
                          >
                            <Scale size={16} /> Pesar carga
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Histórico Geral de Romaneios / Pesagens da Balança */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Histórico de Pesagens & Romaneios</h3>
                <p className="text-xs text-slate-500 font-medium">Registros de pesagens de caminhões e saídas de calcário</p>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar placa, motorista, cliente..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-slate-800"
                />
              </div>
            </div>

            {/* Celular: um card por caminhão, com os botões grandes */}
            <div className="md:hidden divide-y divide-slate-100 px-4">
              {filteredWithdrawals.length === 0 ? (
                <p className="py-10 text-center text-slate-500 text-sm">Nenhum registro de pesagem encontrado.</p>
              ) : (
                filteredWithdrawals.map((item) => (
                  <div key={item.withdrawal.id} className="py-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">{item.customer?.name || 'Cliente'}</p>
                        <p className="text-sm text-slate-500">
                          {item.withdrawal.date.split('-').reverse().join('/')} · <span className="font-mono font-bold text-slate-700">{item.withdrawal.plateNumber}</span>
                        </p>
                        <p className="text-sm text-slate-500 truncate">{item.withdrawal.driverName || 'Motorista não informado'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-black text-emerald-700 tabular-nums">{formatTons(item.withdrawal.quantityWithdrawn)} t</p>
                        {item.withdrawal.netWeight != null && (
                          <p className="text-sm text-slate-500 tabular-nums">{formatTons(item.withdrawal.netWeight)} t líq.</p>
                        )}
                        <p className="text-xs font-bold text-purple-700">{item.withdrawal.nfeNumero ? `NF-e ${item.withdrawal.nfeNumero}` : 'Sem NF-e'}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => reprintTicket(item.withdrawal, item.order)}
                        className="flex-1 min-h-12 inline-flex items-center justify-center gap-2 text-sm font-bold text-white bg-slate-900 rounded-lg"
                      >
                        <Printer size={16} /> Reimprimir ticket
                      </button>
                      <button
                        onClick={() => handleSendWhatsAppTicket(item.withdrawal, item.customer?.name)}
                        aria-label="Enviar no WhatsApp"
                        className="min-h-12 min-w-12 inline-flex items-center justify-center text-emerald-700 border border-emerald-200 rounded-lg"
                      >
                        <Send size={18} />
                      </button>
                      {!item.withdrawal.nfeNumero && (
                        <button
                          onClick={() => handleDeleteWithdrawal(item.withdrawal, item.order)}
                          aria-label="Excluir retirada"
                          title="Excluir este teste/registro de pesagem"
                          className="min-h-12 min-w-12 inline-flex items-center justify-center text-rose-600 border border-rose-200 bg-rose-50 rounded-lg"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                    <th className="px-4 py-3">Ticket / Data</th>
                    <th className="px-4 py-3">Cliente / Fazenda</th>
                    <th className="px-4 py-3">Veículo / Placa</th>
                    <th className="px-4 py-3">Motorista</th>
                    <th className="px-4 py-3 text-right">Nota / Peso líq.</th>
                    <th className="px-4 py-3 text-center">Comprovante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWithdrawals.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 text-xs font-medium">
                        Nenhum registro de pesagem encontrado.
                      </td>
                    </tr>
                  ) : (
                    filteredWithdrawals.map(item => (
                      <tr key={item.withdrawal.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-xs text-slate-900 block">
                            {item.withdrawal.weighTicketNumber || item.withdrawal.id}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-slate-500">{item.withdrawal.date.split('-').reverse().join('/')}</span>
                            {item.withdrawal.nfeNumero ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                NF-e {item.withdrawal.nfeNumero}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500 bg-slate-100 px-1 rounded">Sem NF-e</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-xs text-slate-900">{item.customer?.name || 'Cliente'}</p>
                          <span className="text-xs text-purple-600 font-mono">Ref: {item.order.reference}</span>
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-slate-800 uppercase">
                          {item.withdrawal.plateNumber}
                          {item.withdrawal.truckModel && (
                            <span className="block text-xs font-normal text-slate-500 lowercase">{item.withdrawal.truckModel}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {item.withdrawal.driverName || 'Não Informado'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-black text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {formatTons(item.withdrawal.quantityWithdrawn)} t
                          </span>
                          {item.withdrawal.netWeight != null && (
                            <span className="block text-xs text-slate-500 mt-1">{formatTons(item.withdrawal.netWeight)} t líq.</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {item.withdrawal.nfeDanfeUrl && (
                              <a
                                href={item.withdrawal.nfeDanfeUrl}
                                target="_blank"
                                rel="noreferrer"
                                title={`Abrir DANFE (NF-e ${item.withdrawal.nfeNumero})`}
                                className="min-h-11 min-w-11 inline-flex items-center justify-center text-purple-700 hover:bg-purple-50 border border-purple-200 rounded-lg transition-all"
                              >
                                <FileText size={16} />
                              </a>
                            )}
                            <button
                              onClick={() => handleSendWhatsAppTicket(item.withdrawal, item.customer?.name)}
                              title="Enviar Romaneio no WhatsApp"
                              aria-label="Enviar no WhatsApp"
                              className="min-h-11 min-w-11 inline-flex items-center justify-center text-emerald-600 hover:bg-emerald-50 border border-emerald-200 rounded-lg transition-all"
                            >
                              <Send size={16} />
                            </button>
                            <button
                              onClick={() => setViewingWithdrawal({ withdrawal: item.withdrawal, order: item.order })}
                              title="Ver detalhes do ticket"
                              aria-label="Ver detalhes"
                              className="min-h-11 min-w-11 inline-flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 rounded-lg transition-all"
                            >
                              <FileText size={16} />
                            </button>
                            <button
                              onClick={() => reprintTicket(item.withdrawal, item.order)}
                              title="Reimprimir ticket térmico"
                              className="min-h-11 px-3 inline-flex items-center justify-center gap-1.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-all"
                            >
                              <Printer size={16} /> Reimprimir
                            </button>
                            {!item.withdrawal.nfeNumero && (
                              <button
                                onClick={() => handleDeleteWithdrawal(item.withdrawal, item.order)}
                                title="Excluir este teste/registro de pesagem"
                                aria-label="Excluir retirada"
                                className="min-h-11 min-w-11 inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-lg transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA: PÁTIOS DE ESTOQUE & PILHAS */}
      {activeTab === 'yards' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Layers size={18} className="text-emerald-700" /> Pátios de Estoque de Calcário
                </h3>
                <span className="bg-emerald-100 text-emerald-800 text-xs font-black px-2.5 py-0.5 rounded-full">
                  {stockYards.length} Pátios
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Controle de baias, pilhas de calcário moído/dolomítico e capacidade volumétrica de estocagem.
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setIsBargeModalOpen(true)}
                className="flex-1 sm:flex-initial min-h-11 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-extrabold text-xs transition-all shadow-md flex items-center justify-center gap-1.5"
              >
                <Ship size={15} /> Descarga de Balsa
              </button>
              <button
                type="button"
                onClick={() => setIsQuickYardModalOpen(true)}
                className="flex-1 sm:flex-initial min-h-11 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-extrabold text-xs transition-all shadow-md flex items-center justify-center gap-1.5"
              >
                <Plus size={16} /> + Novo Pátio
              </button>
            </div>
          </div>

          {/* Cards dos Pátios */}
          {stockYards.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 text-slate-500 space-y-3">
              <Layers size={36} className="mx-auto text-slate-400" />
              <div>
                <p className="font-bold text-slate-700 text-sm">Nenhum pátio de estoque cadastrado ainda</p>
                <p className="text-xs text-slate-400">Cadastre o primeiro pátio para controlar o recebimento de balsas e estocagem.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickYardModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold text-xs"
              >
                <Plus size={14} /> Cadastrar Pátio
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stockYards.map((yard) => {
                const stock = yard.currentStockTons || 0;
                const cap = yard.capacityTons || 0;
                const perc = cap > 0 ? Math.min(100, Math.round((stock / cap) * 100)) : null;

                return (
                  <div key={yard.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          {yard.code && (
                            <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                              {yard.code}
                            </span>
                          )}
                          <h4 className="font-black text-slate-900 text-base mt-1.5">{yard.name}</h4>
                          <p className="text-xs text-slate-500 font-medium">{yard.materialType || 'Calcário'}</p>
                        </div>
                        <span className="bg-emerald-50 text-emerald-800 text-[11px] font-black px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                          Ativo
                        </span>
                      </div>

                      {yard.location && (
                        <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                          <span className="font-bold">Local:</span> {yard.location}
                        </p>
                      )}

                      <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-slate-500 font-bold uppercase">Estoque Atual</span>
                          <span className="text-xl font-black text-emerald-700">{formatTons(stock)} t</span>
                        </div>

                        {cap > 0 && (
                          <div>
                            <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold mb-1">
                              <span>Capacidade: {formatTons(cap)} t</span>
                              <span>{perc}%</span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  (perc || 0) > 90 ? 'bg-rose-500' : (perc || 0) > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${perc}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsBargeModalOpen(true)}
                        className="flex-1 min-h-11 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                      >
                        <Ship size={14} /> Descarregar Aqui
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Histórico Recente de Descargas Fluviais */}
          {bargeDischarges.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm space-y-3 p-4">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Ship size={16} className="text-emerald-700" /> Histórico Recente de Descargas de Balsa
              </h4>
              <div className="divide-y divide-slate-100">
                {bargeDischarges.slice(0, 10).map((disc) => (
                  <div key={disc.id} className="py-3 flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-xs">
                    <div>
                      <p className="font-bold text-slate-900">
                        {disc.originPortOrBarge} ➔ {disc.destinationType === 'YARD' ? `Pátio: ${disc.yardName}` : `Caminhão ${disc.plateNumber || ''} (${disc.customerName})`}
                      </p>
                      <p className="text-slate-500">
                        Ticket: <span className="font-mono font-bold">{disc.ticketNumber}</span> · Data: {disc.dischargeDate} · {disc.productName}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 justify-between sm:justify-end">
                      <span className="font-black text-emerald-700 text-sm tabular-nums">
                        {formatTons(disc.netWeightTons)} t
                      </span>
                      <button
                        type="button"
                        onClick={() => printThermalTicket({
                          companyName: defaultCompany.name,
                          companyCity: [defaultCompany.city, defaultCompany.state].filter(Boolean).join('-'),
                          ticketNumber: disc.ticketNumber,
                          date: disc.dischargeDate,
                          customerName: disc.customerName || (disc.yardName ? `Pátio: ${disc.yardName}` : 'Cliente'),
                          customerDocument: disc.driverCpf,
                          orderReference: disc.orderReference || `DESCARGA BALSA`,
                          productName: disc.productName,
                          transporterName: disc.transporterName,
                          driverName: disc.driverName || 'Operador',
                          driverCpf: disc.driverCpf,
                          plateNumber: disc.plateNumber || 'PÁTIO',
                          quantity: disc.netWeightTons,
                          netWeight: disc.netWeightTons,
                          operatorName: disc.operatorName
                        })}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg flex items-center gap-1"
                      >
                        <Printer size={13} /> Ticket
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA 2: ALMOXARIFADO & PEÇAS */}
      {activeTab === 'store' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Pesquisar peças, ferramentas, EPIs no almoxarifado..." 
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-slate-800 font-medium text-sm" 
              />
            </div>
            <button 
              onClick={() => handleOpenStoreModal()} 
              className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 text-xs shadow-sm transition-all active:scale-95"
            >
              <Plus size={16}/> Novo Item
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                    <th className="px-6 py-3.5">Item / Descrição</th>
                    <th className="px-4 py-3.5">Categoria</th>
                    <th className="px-4 py-3.5 text-right">Estoque Atual</th>
                    <th className="px-4 py-3.5">Unidade</th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                    <th className="px-6 py-3.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStoreItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-slate-500 text-xs font-medium">Nenhum item em estoque no almoxarifado.</td>
                    </tr>
                  ) : (
                    filteredStoreItems.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold text-slate-900">{item.name}</p>
                          <span className="text-xs text-slate-500">Mínimo sugerido: {item.minStock} {item.unit}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                            {item.category}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-black text-sm text-slate-800">
                          {item.quantity.toLocaleString('pt-BR')}
                        </td>
                        <td className="px-4 py-4 text-xs font-bold text-slate-500">{item.unit}</td>
                        <td className="px-4 py-4 text-center">
                          {item.quantity <= item.minStock ? (
                            <span className="bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase border border-rose-200 inline-flex items-center gap-1">
                              <AlertTriangle size={11}/> Repor
                            </span>
                          ) : (
                            <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase border border-emerald-200">
                              Normal
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button 
                            onClick={() => handleOpenStoreModal(item)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all border border-slate-200"
                            title="Editar Item"
                          >
                            <Edit size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: MANUTENÇÕES */}
      {activeTab === 'maintenance' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Ordens de Serviço & Manutenções</h3>
              <p className="text-xs text-slate-500 font-medium">Controle de reparos em britadores, moinhos e maquinários</p>
            </div>
            <button 
              onClick={() => setIsMaintModalOpen(true)} 
              className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 text-xs shadow-sm transition-all active:scale-95"
            >
              <Wrench size={15}/> Lançar Manutenção
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {maintenances.slice().reverse().map(mnt => {
              const machine = machines.find(m => m.id === mnt.machineId);
              return (
                <div key={mnt.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-slate-300 transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${mnt.type === 'Preventiva' ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'}`}>
                      <Wrench size={18}/>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-sm leading-tight">{mnt.description}</h4>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded uppercase ${mnt.type === 'Preventiva' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                          {mnt.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Equipamento: <strong>{machine?.name || 'Máquina'} ({machine?.plateOrId || 'S/ID'})</strong> • Data: {mnt.date} • Horímetro: {mnt.horimeter}h
                      </p>
                    </div>
                  </div>
                  <div className="text-right sm:self-auto self-end">
                    <p className="text-sm font-black text-slate-900">R$ {mnt.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <span className="text-[11px] font-bold text-emerald-700 uppercase">Lançado em Custos</span>
                  </div>
                </div>
              );
            })}
            {maintenances.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-500 text-xs font-medium">
                Nenhuma ordem de manutenção registrada no período.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Almoxarifado (Criar / Editar) */}
      {isStoreModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl p-6 md:p-8 shadow-xl border border-slate-200 animate-in zoom-in-95">
             <div className="flex justify-between items-center pb-4 border-b border-slate-200 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                    {editingStoreItem ? 'Editar Item do Almoxarifado' : 'Novo Item / Suprimento de Pátio'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Controle de peças de reposição, EPIs e ferramentas</p>
                </div>
                <button onClick={() => setIsStoreModalOpen(false)} className="p-1 text-slate-500 hover:text-slate-700 rounded-lg transition-colors"><X size={18}/></button>
             </div>

             <form onSubmit={handleAddStore} className="space-y-4">
                <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-700">Descrição do Item *</label>
                   <input 
                     required 
                     type="text" 
                     value={storeForm.name} 
                     onChange={e => setStoreForm({...storeForm, name: e.target.value})} 
                     className="w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-slate-800 font-medium text-sm" 
                     placeholder="Ex: Correia em V 45x10, Rolamento 6205..." 
                   />
                </div>

                <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Categoria</label>
                      <select 
                        value={storeForm.category} 
                        onChange={e => setStoreForm({...storeForm, category: e.target.value as StoreItem['category']})} 
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-medium text-xs outline-none"
                      >
                         <option value="Peças">Peças</option>
                         <option value="Lubrificantes">Lubrificantes</option>
                         <option value="EPI">EPI</option>
                         <option value="Ferramentas">Ferramentas</option>
                         <option value="Insumos">Insumos</option>
                         <option value="Outros">Outros</option>
                      </select>
                   </div>
                   <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Unidade de Medida</label>
                      <input 
                        required 
                        type="text" 
                        value={storeForm.unit} 
                        onChange={e => setStoreForm({...storeForm, unit: e.target.value})} 
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-medium text-xs outline-none uppercase" 
                        placeholder="UN, KG, LT, MT..." 
                      />
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Quantidade Atual</label>
                      <input 
                        required 
                        type="number" 
                        step="0.01" 
                        value={storeForm.quantity} 
                        onChange={e => setStoreForm({...storeForm, quantity: parseFloat(e.target.value) || 0})} 
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-bold text-sm outline-none" 
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Estoque Mínimo</label>
                      <input 
                        required 
                        type="number" 
                        step="0.01" 
                        value={storeForm.minStock} 
                        onChange={e => setStoreForm({...storeForm, minStock: parseFloat(e.target.value) || 0})} 
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-bold text-sm outline-none" 
                      />
                   </div>
                </div>

                <div className="flex gap-2 pt-2">
                   <button 
                     type="button" 
                     onClick={() => setIsStoreModalOpen(false)} 
                     className="w-1/3 py-2.5 border border-slate-300 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-50"
                   >
                     Cancelar
                   </button>
                   <button 
                     type="submit" 
                     className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-all shadow-sm"
                   >
                     {editingStoreItem ? 'Salvar Alterações' : 'Cadastrar no Estoque'}
                   </button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* Modal Manutenção (Adicionar Ordem) */}
      {isMaintModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-2xl p-6 md:p-8 shadow-xl border border-slate-200 animate-in zoom-in-95">
              <div className="flex justify-between items-center pb-4 border-b border-slate-200 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">Lançar Ordem de Manutenção</h3>
                  <p className="text-xs text-slate-500 font-medium">Registro de serviços e custos em maquinários</p>
                </div>
                <button onClick={() => setIsMaintModalOpen(false)} className="p-1 text-slate-500 hover:text-slate-700 rounded-lg transition-colors"><X size={18}/></button>
              </div>

              <form onSubmit={handleAddMaint} className="space-y-4">
                 <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                       <label className="text-xs font-bold text-slate-700">Máquina / Equipamento *</label>
                       <select 
                         required 
                         value={maintForm.machineId} 
                         onChange={e => setMaintForm({...maintForm, machineId: e.target.value})} 
                         className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-medium text-xs outline-none"
                       >
                          <option value="">Selecione...</option>
                          {machines.map(m => <option key={m.id} value={m.id}>{m.name} ({m.plateOrId})</option>)}
                       </select>
                    </div>
                    <div className="space-y-1">
                       <label className="text-xs font-bold text-slate-700">Data do Serviço *</label>
                       <input 
                         required 
                         type="date" 
                         value={maintForm.date} 
                         onChange={e => setMaintForm({...maintForm, date: e.target.value})} 
                         className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-medium text-xs outline-none" 
                       />
                    </div>
                 </div>

                 <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Descrição do Serviço / Reparo *</label>
                    <textarea 
                      required 
                      value={maintForm.description} 
                      onChange={e => setMaintForm({...maintForm, description: e.target.value})} 
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-medium text-xs min-h-[80px] outline-none resize-none" 
                      placeholder="Ex: Troca de martelos do moinho primário, lubrificação de mancais..." 
                    />
                 </div>

                 <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                       <label className="text-xs font-bold text-slate-700">Tipo</label>
                       <select 
                         value={maintForm.type} 
                         onChange={e => setMaintForm({...maintForm, type: e.target.value as MaintenanceRecord['type']})} 
                         className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-medium text-xs outline-none"
                       >
                          <option value="Preventiva">Preventiva</option>
                          <option value="Corretiva">Corretiva</option>
                       </select>
                    </div>
                    <div className="space-y-1">
                       <label className="text-xs font-bold text-slate-700">Horímetro</label>
                       <input 
                         required 
                         type="number" 
                         value={maintForm.horimeter} 
                         onChange={e => setMaintForm({...maintForm, horimeter: parseFloat(e.target.value) || 0})} 
                         className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-bold text-xs outline-none" 
                       />
                    </div>
                    <div className="space-y-1">
                       <label className="text-xs font-bold text-slate-700">Custo Total (R$)</label>
                       <input 
                         required 
                         type="number" 
                         step="0.01" 
                         value={maintForm.cost} 
                         onChange={e => setMaintForm({...maintForm, cost: parseFloat(e.target.value) || 0})} 
                         className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-bold text-xs outline-none" 
                       />
                    </div>
                 </div>

                 <div className="flex gap-2 pt-2">
                   <button 
                     type="button" 
                     onClick={() => setIsMaintModalOpen(false)} 
                     className="w-1/3 py-2.5 border border-slate-300 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-50"
                   >
                     Cancelar
                   </button>
                   <button 
                     type="submit" 
                     className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-all shadow-sm"
                   >
                     Lançar Ordem de Serviço
                   </button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* Modal de Pesagem / Retirada do Pedido na Balança */}
      {selectedOrderForWeigh && (
        <OrderWithdrawalModal
          order={selectedOrderForWeigh}
          customer={customers.find(c => c.id === selectedOrderForWeigh.customerId)}
          company={defaultCompany}
          transportadores={transportadores}
          operatorName={operatorName}
          onSaveWithdrawal={handleSaveWithdrawal}
          onClose={() => setSelectedOrderForWeigh(null)}
        />
      )}

      {/* Modal Encerrar Retiradas com Sobra de Saldo */}
      {orderForClosingWithdrawals && (
        <CloseWithdrawalsModal
          order={orderForClosingWithdrawals}
          transactions={transactions}
          operatorName={operatorName}
          onConfirm={(result) => {
            if (onCloseOrderWithdrawals) {
              onCloseOrderWithdrawals(result);
            } else if (onUpdateOrder) {
              onUpdateOrder(result.updatedOrder);
            }
            setOrderForClosingWithdrawals(null);
          }}
          onClose={() => setOrderForClosingWithdrawals(null)}
        />
      )}

      {/* Modal Visualizar Ticket de Pesagem */}
      {viewingWithdrawal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl p-6 md:p-8 shadow-xl border border-slate-200 animate-in zoom-in-95 space-y-6">
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">{defaultCompany.name}</h3>
                <p className="text-xs text-slate-500">Ticket de Pesagem: <strong className="font-mono text-slate-900">{viewingWithdrawal.withdrawal.weighTicketNumber}</strong></p>
              </div>
              <button onClick={() => setViewingWithdrawal(null)} className="p-1 text-slate-500 hover:text-slate-700 rounded-lg"><X size={18}/></button>
            </div>

            <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[11px] text-slate-500 font-bold uppercase">Data</span>
                  <p className="font-bold text-slate-800">{viewingWithdrawal.withdrawal.date}</p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 font-bold uppercase">Ref. Pedido</span>
                  <p className="font-bold text-purple-700">{viewingWithdrawal.order.reference}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[11px] text-slate-500 font-bold uppercase">Veículo / Placa</span>
                  <p className="font-black text-slate-800">{viewingWithdrawal.withdrawal.plateNumber}</p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 font-bold uppercase">Motorista</span>
                  <p className="font-bold text-slate-800">{viewingWithdrawal.withdrawal.driverName || 'N/I'}</p>
                </div>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-bold uppercase">Quantidade da nota</span>
                <p className="text-lg font-black text-emerald-700">{formatTons(viewingWithdrawal.withdrawal.quantityWithdrawn)} t</p>
                {viewingWithdrawal.withdrawal.netWeight != null && (
                  <p className="text-xs font-bold text-slate-500">Peso líquido: {formatTons(viewingWithdrawal.withdrawal.netWeight)} t</p>
                )}
              </div>

              {viewingWithdrawal.withdrawal.nfeNumero && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between gap-2 mt-2">
                  <div>
                    <span className="text-[11px] font-black text-purple-700 uppercase">NF-e da Carga</span>
                    <p className="font-black text-sm text-purple-950">Nº {viewingWithdrawal.withdrawal.nfeNumero}</p>
                    {viewingWithdrawal.withdrawal.nfeChave && (
                      <p className="text-xs font-mono text-purple-600 truncate max-w-xs">{viewingWithdrawal.withdrawal.nfeChave}</p>
                    )}
                  </div>
                  {viewingWithdrawal.withdrawal.nfeDanfeUrl && (
                    <a
                      href={viewingWithdrawal.withdrawal.nfeDanfeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shrink-0"
                    >
                      <FileText size={13} /> Abrir DANFE
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleSendWhatsAppTicket(viewingWithdrawal.withdrawal, customers.find(c => c.id === viewingWithdrawal.order.customerId)?.name)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Send size={14} /> Compartilhar no WhatsApp
              </button>
              <button
                onClick={() => reprintTicket(viewingWithdrawal.withdrawal, viewingWithdrawal.order)}
                className="min-h-11 px-4 border border-slate-300 rounded-xl font-bold text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
              >
                <Printer size={16} /> Imprimir ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Descarga Fluvial / Balsa */}
      <BargeDischargeModal
        isOpen={isBargeModalOpen}
        onClose={() => setIsBargeModalOpen(false)}
        orders={orders}
        stockYards={stockYards}
        transportadores={transportadores}
        company={defaultCompany}
        operatorName={operatorName}
        onAddStockYard={onAddStockYard}
        onAddTransportador={onAddTransportador}
        onSaveDischarge={(rec) => {
          if (onSaveBargeDischarge) {
            onSaveBargeDischarge(rec);
          }
          toast.push(`Descarga ${rec.ticketNumber} salva com sucesso!`, 'success');
        }}
        onUpdateOrder={onUpdateOrder}
      />

      {/* Modal Rápido de Pátio */}
      <QuickStockYardModal
        isOpen={isQuickYardModalOpen}
        onClose={() => setIsQuickYardModalOpen(false)}
        onSuccess={(yard) => {
          setIsQuickYardModalOpen(false);
          toast.push(`Pátio "${yard.name}" criado com sucesso!`, 'success');
        }}
        onAddStockYard={onAddStockYard}
      />
    </div>
  );
};

export default YardManagement;
