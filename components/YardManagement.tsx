import React, { useState } from 'react';
import { Machine, StoreItem, MaintenanceRecord, SaleOrder, OrderWithdrawal, Customer, Company } from '../types';
import { 
  Boxes, Plus, Wrench, Search, Package, AlertTriangle, 
  X, Edit, Scale, Truck, Printer, Send, Calendar, 
  CheckCircle2, FileText, UserCheck, ArrowDownRight, ArrowUpRight
} from 'lucide-react';
import { OrderWithdrawalModal } from './OrderWithdrawalModal';

interface YardManagementProps {
  machines: Machine[];
  storeItems: StoreItem[];
  maintenances: MaintenanceRecord[];
  orders?: SaleOrder[];
  customers?: Customer[];
  company?: Company;
  onAddMaintenance: (record: Omit<MaintenanceRecord, 'id' | 'companyId'>) => void;
  onAddStoreItem: (item: Omit<StoreItem, 'id' | 'companyId'>) => void;
  onUpdateStoreItem: (item: StoreItem) => void;
  onUpdateOrder?: (order: SaleOrder) => void;
}

const YardManagement: React.FC<YardManagementProps> = ({ 
  machines, 
  storeItems, 
  maintenances, 
  orders = [],
  customers = [],
  company,
  onAddMaintenance, 
  onAddStoreItem, 
  onUpdateStoreItem,
  onUpdateOrder
}) => {
  const [activeTab, setActiveTab] = useState<'weighbridge' | 'store' | 'maintenance'>('weighbridge');
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [isMaintModalOpen, setIsMaintModalOpen] = useState(false);
  const [editingStoreItem, setEditingStoreItem] = useState<StoreItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Balança / Expedição Modal
  const [selectedOrderForWeigh, setSelectedOrderForWeigh] = useState<SaleOrder | null>(null);
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
    date: new Date().toISOString().split('T')[0],
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
  const ordersWithAvailableBalance = orders.filter(order => {
    const totalOrdered = order.items.reduce((acc, it) => acc + (it.quantity || 0), 0);
    const totalWithdrawn = (order.withdrawals || []).reduce((acc, w) => acc + (w.quantityWithdrawn || 0), 0);
    return (totalOrdered - totalWithdrawn) > 0.01;
  });

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
    setMaintForm({ machineId: '', date: new Date().toISOString().split('T')[0], description: '', cost: 0, type: 'Preventiva', horimeter: 0 });
  };

  const handleSaveWithdrawal = (withdrawal: OrderWithdrawal) => {
    if (!selectedOrderForWeigh || !onUpdateOrder) return;
    const updatedWithdrawals = [...(selectedOrderForWeigh.withdrawals || []), withdrawal];
    const updatedOrder: SaleOrder = {
      ...selectedOrderForWeigh,
      withdrawals: updatedWithdrawals
    };
    onUpdateOrder(updatedOrder);
  };

  const handleSendWhatsAppTicket = (w: OrderWithdrawal, custName?: string) => {
    const text = `*COMPROVANTE DE PESAGEM / EXPEDIÇÃO DE CALCÁRIO*\nUsina: ${defaultCompany.name}\nTicket Nº: ${w.weighTicketNumber}\nData: ${w.date}\n\n👤 Cliente: ${custName || 'Cliente'}\n🚛 Placa / Veículo: ${w.plateNumber} ${w.truckModel ? `(${w.truckModel})` : ''}\n👨‍✈️ Motorista: ${w.driverName || 'N/I'}\n📦 Produto: ${w.productName || 'Calcário Agrícola'}\n⚖️ Peso Líquido Carregado: *${w.quantityWithdrawn.toLocaleString('pt-BR')} Toneladas*\n\nSaldo Restante do Pedido: ${w.remainingBalanceQuantity !== undefined ? `${w.remainingBalanceQuantity.toLocaleString('pt-BR')} Ton` : '-'}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header com Abas */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Pátio, Balança & Suprimentos</h2>
            <span className="bg-slate-900 text-white text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full">
              Operacional
            </span>
          </div>
          <p className="text-slate-500 text-sm font-medium">
            Pesagem na balança, romaneios de expedição, almoxarifado de peças e manutenções
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-slate-200/80 p-1 rounded-xl border border-slate-200 w-full sm:w-auto overflow-x-auto">
          <button 
            onClick={() => setActiveTab('weighbridge')} 
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'weighbridge' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Scale size={14} /> Balança & Expedição
          </button>
          <button 
            onClick={() => setActiveTab('store')} 
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
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
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pesagens Realizadas</span>
                <p className="text-xl font-black text-slate-800">{allWithdrawals.length} Cargas</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5">
              <div className="p-2.5 bg-purple-50 text-purple-700 rounded-xl">
                <Scale size={20} />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Volume Total Expedido</span>
                <p className="text-xl font-black text-slate-800">
                  {allWithdrawals.reduce((sum, item) => sum + (item.withdrawal.quantityWithdrawn || 0), 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} Ton
                </p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5">
              <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl">
                <FileText size={20} />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pedidos com Saldo</span>
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
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs font-medium">
                Nenhum pedido de venda com saldo pendente de retirada no momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {ordersWithAvailableBalance.map(order => {
                  const customer = customers.find(c => c.id === order.customerId);
                  const totalQty = order.items.reduce((acc, it) => acc + (it.quantity || 0), 0);
                  const withdrawn = (order.withdrawals || []).reduce((acc, w) => acc + (w.quantityWithdrawn || 0), 0);
                  const balance = Math.max(0, totalQty - withdrawn);

                  return (
                    <div key={order.id} className="p-4 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 transition-all flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-[10px] font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                            {order.reference}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Saldo: {balance.toFixed(1)} Ton
                          </span>
                        </div>
                        <p className="font-bold text-slate-900 text-sm mt-2 leading-tight">{customer?.name || 'Cliente'}</p>
                        <p className="text-xs text-slate-500">{order.items[0]?.productName || 'Calcário Agrícola'}</p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-xs">
                        <span className="text-slate-400 text-[11px]">Total: {totalQty} Ton</span>
                        <button
                          onClick={() => setSelectedOrderForWeigh(order)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-all flex items-center gap-1 text-xs active:scale-95"
                        >
                          <Scale size={13} /> Pesar Carga
                        </button>
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

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                    <th className="px-4 py-3">Ticket / Data</th>
                    <th className="px-4 py-3">Cliente / Fazenda</th>
                    <th className="px-4 py-3">Veículo / Placa</th>
                    <th className="px-4 py-3">Motorista</th>
                    <th className="px-4 py-3 text-right">Peso Líquido</th>
                    <th className="px-4 py-3 text-center">Comprovante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWithdrawals.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 text-xs font-medium">
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
                          <span className="text-[10px] text-slate-400">{item.withdrawal.date}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-xs text-slate-900">{item.customer?.name || 'Cliente'}</p>
                          <span className="text-[10px] text-purple-600 font-mono">Ref: {item.order.reference}</span>
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-slate-800 uppercase">
                          {item.withdrawal.plateNumber}
                          {item.withdrawal.truckModel && (
                            <span className="block text-[10px] font-normal text-slate-400 lowercase">{item.withdrawal.truckModel}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {item.withdrawal.driverName || 'Não Informado'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-black text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {item.withdrawal.quantityWithdrawn.toLocaleString('pt-BR')} Ton
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleSendWhatsAppTicket(item.withdrawal, item.customer?.name)}
                              title="Enviar Romaneio no WhatsApp"
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 border border-emerald-200 rounded-lg transition-all"
                            >
                              <Send size={13} />
                            </button>
                            <button
                              onClick={() => setViewingWithdrawal({ withdrawal: item.withdrawal, order: item.order })}
                              title="Visualizar Ticket Completo"
                              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 rounded-lg transition-all"
                            >
                              <Printer size={13} />
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
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
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
                      <td colSpan={6} className="py-16 text-center text-slate-400 text-xs font-medium">Nenhum item em estoque no almoxarifado.</td>
                    </tr>
                  ) : (
                    filteredStoreItems.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold text-slate-900">{item.name}</p>
                          <span className="text-[10px] text-slate-400">Mínimo sugerido: {item.minStock} {item.unit}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                            {item.category}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-black text-sm text-slate-800">
                          {item.quantity.toLocaleString('pt-BR')}
                        </td>
                        <td className="px-4 py-4 text-xs font-bold text-slate-500">{item.unit}</td>
                        <td className="px-4 py-4 text-center">
                          {item.quantity <= item.minStock ? (
                            <span className="bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border border-rose-200 inline-flex items-center gap-1">
                              <AlertTriangle size={11}/> Repor
                            </span>
                          ) : (
                            <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border border-emerald-200">
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
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${mnt.type === 'Preventiva' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
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
                    <span className="text-[10px] font-bold text-emerald-700 uppercase">Lançado em Custos</span>
                  </div>
                </div>
              );
            })}
            {maintenances.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs font-medium">
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
                <button onClick={() => setIsStoreModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"><X size={18}/></button>
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
                <button onClick={() => setIsMaintModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"><X size={18}/></button>
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
          onSaveWithdrawal={handleSaveWithdrawal}
          onClose={() => setSelectedOrderForWeigh(null)}
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
              <button onClick={() => setViewingWithdrawal(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"><X size={18}/></button>
            </div>

            <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Data</span>
                  <p className="font-bold text-slate-800">{viewingWithdrawal.withdrawal.date}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Ref. Pedido</span>
                  <p className="font-bold text-purple-700">{viewingWithdrawal.order.reference}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Veículo / Placa</span>
                  <p className="font-black text-slate-800">{viewingWithdrawal.withdrawal.plateNumber}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Motorista</span>
                  <p className="font-bold text-slate-800">{viewingWithdrawal.withdrawal.driverName || 'N/I'}</p>
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase">Volume Pesado / Expedido</span>
                <p className="text-lg font-black text-emerald-700">{viewingWithdrawal.withdrawal.quantityWithdrawn.toLocaleString('pt-BR')} Toneladas</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleSendWhatsAppTicket(viewingWithdrawal.withdrawal, customers.find(c => c.id === viewingWithdrawal.order.customerId)?.name)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Send size={14} /> Compartilhar no WhatsApp
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2.5 border border-slate-300 rounded-xl font-bold text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
              >
                <Printer size={14} /> Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default YardManagement;
