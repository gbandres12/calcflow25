import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  SaleOrder,
  StockYard,
  Transportador,
  Company,
  BargeDischargeRecord,
  OrderWithdrawal
} from '../types';
import { FlowSheet } from './ui/FlowSheet';
import { QuickStockYardModal } from './QuickStockYardModal';
import { QuickDriverModal } from './QuickDriverModal';
import { printThermalTicket } from '../services/domain/thermalTicket';
import { formatTons, roundTons, sumTons, localIsoDate } from '../services/domain/loadings';
import { openOrdersForLoading, orderLoadingProgress } from '../services/domain/loadings';
import {
  Anchor,
  Truck,
  Layers,
  Camera,
  RefreshCw,
  Printer,
  Plus,
  Scale,
  CheckCircle2,
  AlertCircle,
  Search,
  User,
  FileText,
  Trash2,
  Ship,
  Sparkles
} from 'lucide-react';

interface BargeDischargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: SaleOrder[];
  stockYards: StockYard[];
  transportadores: Transportador[];
  company: Company;
  operatorName?: string;
  onAddStockYard?: (yard: Omit<StockYard, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>) => StockYard | Promise<StockYard>;
  onAddTransportador?: (data: Omit<Transportador, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>) => Transportador | Promise<Transportador>;
  onSaveDischarge: (discharge: BargeDischargeRecord) => void;
  onUpdateOrder?: (order: SaleOrder) => void;
}

export const BargeDischargeModal: React.FC<BargeDischargeModalProps> = ({
  isOpen,
  onClose,
  orders,
  stockYards,
  transportadores,
  company,
  operatorName = 'Operador Portuário',
  onAddStockYard,
  onAddTransportador,
  onSaveDischarge,
  onUpdateOrder
}) => {
  // Estado Principal
  const [dischargeDate, setDischargeDate] = useState(localIsoDate());
  const [originBarge, setOriginBarge] = useState('');
  const [commonOrigin, setCommonOrigin] = useState('Balsa Tapajós 01');
  const [destinationType, setDestinationType] = useState<'YARD' | 'TRUCK'>('TRUCK');

  // Destino Pátio
  const [selectedYardId, setSelectedYardId] = useState<string>('');
  const [isNewYardModalOpen, setIsNewYardModalOpen] = useState(false);
  const [yardQuantityTons, setYardQuantityTons] = useState('');

  // Destino Caminhão (Cross-Docking)
  const [linkToOrder, setLinkToOrder] = useState<'ORDER' | 'AVULSA'>('ORDER');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [isNewDriverModalOpen, setIsNewDriverModalOpen] = useState(false);
  
  // Motorista & Veículo
  const [driverSearch, setDriverSearch] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<Transportador | null>(null);
  const [driverName, setDriverName] = useState('');
  const [driverCpf, setDriverCpf] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [truckModel, setTruckModel] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);

  // Câmera & Foto
  const [truckPhoto, setTruckPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pesagem
  const [tareWeight, setTareWeight] = useState(''); // Tara
  const [grossWeight, setGrossWeight] = useState(''); // Peso Bruto
  const [manualNetWeight, setManualNetWeight] = useState(''); // Peso Líquido direto caso sem balança em duas etapas

  // Ticket & Produto
  const [ticketNumber, setTicketNumber] = useState(`BALSA-${Math.floor(100000 + Math.random() * 900000)}`);
  const [productName, setProductName] = useState('Calcário Agrícola Moído');
  const [notes, setNotes] = useState('');

  const [formError, setFormError] = useState('');
  const [savedDischarge, setSavedDischarge] = useState<BargeDischargeRecord | null>(null);

  // Pedidos com saldo
  const availableOrders = useMemo(() => openOrdersForLoading(orders), [orders]);

  const selectedOrder = useMemo(() => {
    return orders.find(o => o.id === selectedOrderId) || null;
  }, [orders, selectedOrderId]);

  // Se houver pedidos e nenhum selecionado
  useEffect(() => {
    if (availableOrders.length > 0 && !selectedOrderId) {
      setSelectedOrderId(availableOrders[0].id);
    }
  }, [availableOrders, selectedOrderId]);

  // Se houver pátios e nenhum selecionado
  useEffect(() => {
    if (stockYards.length > 0 && !selectedYardId) {
      setSelectedYardId(stockYards[0].id);
    }
  }, [stockYards, selectedYardId]);

  // Autocomplete de Motoristas
  const filteredDrivers = useMemo(() => {
    const q = driverSearch.trim().toLowerCase();
    if (!q) return transportadores.slice(0, 5);
    return transportadores.filter(t =>
      (t.nome || '').toLowerCase().includes(q) ||
      (t.documento || '').includes(q) ||
      (t.placa || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [transportadores, driverSearch]);

  const handleSelectDriver = (driver: Transportador) => {
    setSelectedDriver(driver);
    setDriverName(driver.nome);
    setDriverCpf(driver.documento || '');
    setPlateNumber(driver.placa || '');
    setTruckModel(driver.modeloVeiculo || '');
    setTransporterName(driver.tipoServico === 'INTERNO' ? company.name : driver.nome);
    setDriverSearch(driver.nome);
    setShowDriverDropdown(false);
  };

  // Cálculo automático do peso líquido em toneladas
  const tareNum = parseFloat(tareWeight.replace(',', '.')) || 0;
  const grossNum = parseFloat(grossWeight.replace(',', '.')) || 0;
  
  const calculatedNetTons = useMemo(() => {
    if (grossNum > 0 && tareNum > 0 && grossNum >= tareNum) {
      return roundTons(grossNum - tareNum);
    }
    const manualNum = parseFloat(manualNetWeight.replace(',', '.')) || 0;
    return roundTons(manualNum);
  }, [grossNum, tareNum, manualNetWeight]);

  // Foto do caminhão via Câmera do Celular
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setTruckPhoto(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const clearPhoto = () => {
    setTruckPhoto(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Impressão do Ticket Térmico de 80mm
  const handlePrintTicket = (record: BargeDischargeRecord) => {
    printThermalTicket({
      companyName: company.name,
      companyCity: [company.city, company.state].filter(Boolean).join('-'),
      ticketNumber: record.ticketNumber,
      date: record.dischargeDate,
      customerName: record.destinationType === 'YARD' 
        ? `ESTOQUE: ${record.yardName || 'Pátio'}` 
        : (record.customerName || 'Venda Avulsa / Cross-Docking'),
      customerDocument: record.driverCpf,
      orderReference: record.destinationType === 'YARD' 
        ? `DESC. BALSA (${record.originPortOrBarge})` 
        : (record.orderReference || `CROSS-DOCKING BALSA`),
      productName: record.productName,
      transporterName: record.transporterName,
      driverName: record.driverName || 'Operador',
      driverCpf: record.driverCpf,
      plateNumber: record.plateNumber || 'PÁTIO',
      quantity: record.netWeightTons,
      netWeight: record.netWeightTons,
      operatorName: record.operatorName || operatorName,
      remaining: record.orderId && selectedOrder 
        ? Math.max(0, roundTons(orderLoadingProgress(selectedOrder).remaining - record.netWeightTons))
        : undefined
    });
  };

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const origin = (originBarge.trim() || commonOrigin).trim();
    if (!origin) {
      setFormError('Informe o nome da Balsa, Embarcação ou Berço Portuário de origem.');
      return;
    }

    if (destinationType === 'YARD') {
      const yardQty = parseFloat(yardQuantityTons.replace(',', '.')) || 0;
      if (yardQty <= 0) {
        setFormError('Informe a tonelagem descarregada no pátio.');
        return;
      }
      const targetYard = stockYards.find(y => y.id === selectedYardId);
      const record: BargeDischargeRecord = {
        id: `DISC-${Date.now()}`,
        companyId: company.id,
        dischargeDate,
        originPortOrBarge: origin,
        destinationType: 'YARD',
        yardId: selectedYardId,
        yardName: targetYard?.name || 'Pátio de Estoque',
        netWeightTons: roundTons(yardQty),
        ticketNumber,
        productName,
        operatorName,
        notes: notes.trim() || undefined,
        createdAt: new Date().toISOString()
      };

      onSaveDischarge(record);
      setSavedDischarge(record);
      return;
    }

    // Se destino for TRUCK (Cross-Docking)
    if (calculatedNetTons <= 0) {
      setFormError('Informe a pesagem do caminhão (Bruto - Tara ou Peso Líquido).');
      return;
    }

    if (!driverName.trim()) {
      setFormError('Informe o nome do motorista do caminhão.');
      return;
    }

    if (!plateNumber.trim()) {
      setFormError('Informe a placa do caminhão para emissão do ticket.');
      return;
    }

    const isAvulsa = linkToOrder === 'AVULSA' || !selectedOrder;
    const custName = isAvulsa ? 'Venda Direta / Cross-Docking Balança' : (selectedOrder?.customerName || 'Cliente Pedido');

    const record: BargeDischargeRecord = {
      id: `DISC-${Date.now()}`,
      companyId: company.id,
      dischargeDate,
      originPortOrBarge: origin,
      destinationType: 'TRUCK',
      orderId: isAvulsa ? undefined : selectedOrder?.id,
      orderReference: isAvulsa ? undefined : selectedOrder?.reference,
      customerId: isAvulsa ? undefined : selectedOrder?.customerId,
      customerName: custName,
      isAvulsa,
      driverName: driverName.trim(),
      driverCpf: driverCpf.trim() || undefined,
      plateNumber: plateNumber.trim().toUpperCase(),
      truckModel: truckModel.trim() || undefined,
      transporterName: transporterName.trim() || undefined,
      truckPhotoUrl: truckPhoto || undefined,
      tareWeightTons: tareNum > 0 ? tareNum : undefined,
      grossWeightTons: grossNum > 0 ? grossNum : undefined,
      netWeightTons: calculatedNetTons,
      ticketNumber,
      productName,
      operatorName,
      notes: [
        notes.trim(),
        `Descarga Cross-docking direto da balsa (${origin})`
      ].filter(Boolean).join(' | '),
      createdAt: new Date().toISOString()
    };

    // Se vinculado a um pedido, salvar também como retirada no pedido
    if (!isAvulsa && selectedOrder && onUpdateOrder) {
      const orderQty = sumTons(selectedOrder.items.map(it => it.quantity || 0));
      const alreadyWithdrawn = sumTons((selectedOrder.withdrawals || []).map(w => w.quantityWithdrawn || 0));
      const withdrawal: OrderWithdrawal = {
        id: `RET-CROSS-${Date.now()}`,
        orderId: selectedOrder.id,
        orderReference: selectedOrder.reference,
        date: dischargeDate,
        driverName: driverName.trim(),
        driverCpf: driverCpf.trim(),
        plateNumber: plateNumber.trim().toUpperCase(),
        truckModel: truckModel.trim(),
        quantityWithdrawn: calculatedNetTons,
        netWeight: calculatedNetTons,
        transporterName: transporterName.trim() || undefined,
        productName: productName || selectedOrder.items[0]?.productName || 'Calcário',
        weighTicketNumber: ticketNumber,
        totalOrderQuantity: orderQty,
        totalWithdrawnSoFar: roundTons(alreadyWithdrawn + calculatedNetTons),
        remainingBalanceQuantity: Math.max(0, roundTons(orderQty - alreadyWithdrawn - calculatedNetTons)),
        loadedBy: operatorName,
        notes: `Cross-docking direto da balsa ${origin}`
      };

      const updatedOrder: SaleOrder = {
        ...selectedOrder,
        withdrawals: [...(selectedOrder.withdrawals || []), withdrawal]
      };
      onUpdateOrder(updatedOrder);
    }

    onSaveDischarge(record);
    setSavedDischarge(record);
  };

  return (
    <>
      <FlowSheet
        title="Operação de Descarga Fluvial"
        subtitle="Descarregamento de balsa para pátio ou transbordo direto pro caminhão (cross-docking)"
        onClose={onClose}
        wide={true}
      >
        {savedDischarge ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 size={36} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Descarga Registrada com Sucesso!</h3>
              <p className="text-sm text-slate-600 mt-1">
                Ticket <span className="font-mono font-bold text-emerald-800">{savedDischarge.ticketNumber}</span> · {formatTons(savedDischarge.netWeightTons)} toneladas
              </p>
              {savedDischarge.destinationType === 'TRUCK' ? (
                <p className="text-xs text-slate-500 mt-0.5">
                  Caminhão <span className="font-mono font-bold">{savedDischarge.plateNumber}</span> ({savedDischarge.driverName})
                </p>
              ) : (
                <p className="text-xs text-slate-500 mt-0.5">
                  Estocado em: <span className="font-bold">{savedDischarge.yardName}</span>
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto pt-4">
              <button
                type="button"
                onClick={() => handlePrintTicket(savedDischarge)}
                className="min-h-12 flex-1 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-extrabold text-sm rounded-xl flex items-center justify-center gap-2 shadow-md transition-all"
              >
                <Printer size={18} /> Imprimir Ticket (80mm)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSavedDischarge(null);
                  setGrossWeight('');
                  setTareWeight('');
                  setManualNetWeight('');
                  setTruckPhoto(null);
                  setTicketNumber(`BALSA-${Math.floor(100000 + Math.random() * 900000)}`);
                }}
                className="min-h-12 flex-1 border border-slate-300 hover:bg-slate-50 active:scale-95 font-bold text-sm text-slate-700 rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <Plus size={18} /> Nova Descarga / Caminhão
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* SEÇÃO 1: ORIGEM DA DESCARGA */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <Ship size={15} /> 1. Origem: Balsa / Embarcação / Porto
                </span>
                <span className="text-xs font-bold text-slate-500 font-mono">{dischargeDate}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
                    Balsas Frequentes / Atalho
                  </label>
                  <select
                    value={commonOrigin}
                    onChange={(e) => {
                      setCommonOrigin(e.target.value);
                      setOriginBarge(e.target.value);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600 min-h-11"
                  >
                    <option value="Balsa Tapajós 01">Balsa Tapajós 01 (Capacidade 3.000 t)</option>
                    <option value="Balsa Amazonas 04">Balsa Amazonas 04 (Capacidade 2.500 t)</option>
                    <option value="Balsa Juruti Express">Balsa Juruti Express</option>
                    <option value="Porto de Miritituba - Berço 01">Porto de Miritituba - Berço 01</option>
                    <option value="Porto de Santarém - CDP">Porto de Santarém - CDP</option>
                    <option value="Outra Balsa">Outra Balsa / Porto (Digitar ao lado)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
                    Nome / Identificação da Balsa
                  </label>
                  <input
                    type="text"
                    value={originBarge || commonOrigin}
                    onChange={(e) => setOriginBarge(e.target.value)}
                    placeholder="Ex: Balsa Tapajós 01 / Comboio 12"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600 min-h-11"
                  />
                </div>
              </div>
            </div>

            {/* SEÇÃO 2: SELETOR DE DESTINO */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
                2. Destino do Material *
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDestinationType('TRUCK')}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between min-h-[90px] ${
                    destinationType === 'TRUCK'
                      ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Truck size={22} className={destinationType === 'TRUCK' ? 'text-emerald-700' : 'text-slate-400'} />
                    {destinationType === 'TRUCK' && <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />}
                  </div>
                  <div>
                    <p className="font-extrabold text-sm">Direto pro Caminhão</p>
                    <p className="text-[11px] text-slate-500 leading-tight">Cross-docking (pesagem & expedição)</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDestinationType('YARD')}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between min-h-[90px] ${
                    destinationType === 'YARD'
                      ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Layers size={22} className={destinationType === 'YARD' ? 'text-emerald-700' : 'text-slate-400'} />
                    {destinationType === 'YARD' && <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />}
                  </div>
                  <div>
                    <p className="font-extrabold text-sm">Pátio de Estoque</p>
                    <p className="text-[11px] text-slate-500 leading-tight">Armazenar no pátio / baia</p>
                  </div>
                </button>
              </div>
            </div>

            {/* SE DESTINO FOR PÁTIO DE ESTOQUE */}
            {destinationType === 'YARD' && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                    Selecione o Pátio / Pilha de Destino
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsNewYardModalOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-white border border-emerald-300 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 active:scale-95"
                  >
                    <Plus size={14} /> Novo Pátio
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {stockYards.length === 0 ? (
                    <div className="col-span-2 text-center py-4 bg-white rounded-xl border border-dashed border-slate-300 text-slate-500 text-xs">
                      Nenhum pátio cadastrado. Clique no botão acima para adicionar.
                    </div>
                  ) : (
                    stockYards.map(yard => (
                      <div
                        key={yard.id}
                        onClick={() => setSelectedYardId(yard.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          selectedYardId === yard.id
                            ? 'bg-emerald-100/60 border-emerald-600 text-emerald-950 font-bold shadow-sm'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm truncate">{yard.name}</p>
                          <p className="text-xs text-slate-500 font-normal">
                            {yard.location ? `${yard.location} · ` : ''}Estoque: {formatTons(yard.currentStockTons || 0)} t
                          </p>
                        </div>
                        {selectedYardId === yard.id && (
                          <CheckCircle2 size={18} className="text-emerald-700 shrink-0 ml-2" />
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
                      Toneladas Descarregadas no Pátio *
                    </label>
                    <div className="relative">
                      <Scale size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        inputMode="decimal"
                        required
                        value={yardQuantityTons}
                        onChange={(e) => setYardQuantityTons(e.target.value)}
                        placeholder="Ex: 150.00"
                        className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600 min-h-11"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
                      Produto Descarregado
                    </label>
                    <input
                      type="text"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600 min-h-11"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SE DESTINO FOR DIRETO PRO CAMINHÃO (CROSS-DOCKING) */}
            {destinationType === 'TRUCK' && (
              <div className="space-y-4">
                {/* 2.1 Vínculo com Pedido de Venda */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                      <FileText size={15} /> 2.1 Vínculo Comercial
                    </span>
                    <div className="flex bg-white rounded-lg p-0.5 border border-slate-200 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setLinkToOrder('ORDER')}
                        className={`px-3 py-1 rounded-md transition-all ${
                          linkToOrder === 'ORDER' ? 'bg-slate-900 text-white' : 'text-slate-600'
                        }`}
                      >
                        Pedido com Saldo
                      </button>
                      <button
                        type="button"
                        onClick={() => setLinkToOrder('AVULSA')}
                        className={`px-3 py-1 rounded-md transition-all ${
                          linkToOrder === 'AVULSA' ? 'bg-slate-900 text-white' : 'text-slate-600'
                        }`}
                      >
                        Venda Avulsa / Direta
                      </button>
                    </div>
                  </div>

                  {linkToOrder === 'ORDER' ? (
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
                        Selecione o Pedido do Cliente para dar Baixa de Saldo
                      </label>
                      {availableOrders.length === 0 ? (
                        <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                          Nenhum pedido com saldo pendente no momento. Selecione "Venda Avulsa".
                        </p>
                      ) : (
                        <select
                          value={selectedOrderId}
                          onChange={(e) => setSelectedOrderId(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600 min-h-12"
                        >
                          {availableOrders.map(order => {
                            const { contracted, remaining } = orderLoadingProgress(order);
                            return (
                              <option key={order.id} value={order.id}>
                                {order.reference} · {order.customerName || 'Cliente'} (Saldo: {formatTons(remaining)} t / Total: {contracted} t)
                              </option>
                            );
                          })}
                        </select>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 font-medium">
                      O caminhão será carregado como venda avulsa direta no porto. Não consome saldo de pedido prévio.
                    </div>
                  )}
                </div>

                {/* 2.2 Motorista e Veículo */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                      <Truck size={15} /> 2.2 Motorista e Caminhão
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsNewDriverModalOpen(true)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-white border border-emerald-300 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 active:scale-95"
                    >
                      <Plus size={14} /> Novo Motorista
                    </button>
                  </div>

                  {/* Campo de Busca com Autocomplete */}
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={driverSearch}
                      onFocus={() => setShowDriverDropdown(true)}
                      onChange={(e) => {
                        setDriverSearch(e.target.value);
                        setDriverName(e.target.value);
                        setShowDriverDropdown(true);
                      }}
                      placeholder="Buscar motorista cadastrado por nome, CPF ou placa..."
                      className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600 min-h-11"
                    />

                    {showDriverDropdown && filteredDrivers.length > 0 && (
                      <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {filteredDrivers.map(d => (
                          <div
                            key={d.id}
                            onClick={() => handleSelectDriver(d)}
                            className="p-2.5 hover:bg-emerald-50 cursor-pointer text-xs border-b border-slate-100 flex items-center justify-between"
                          >
                            <div>
                              <p className="font-bold text-slate-900">{d.nome}</p>
                              <p className="text-slate-500">{d.documento || 'Sem CPF'} · Placa: {d.placa || 'N/I'}</p>
                            </div>
                            <span className="text-[10px] font-bold uppercase bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                              {d.tipoServico}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
                        Nome do Motorista *
                      </label>
                      <input
                        type="text"
                        required
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        placeholder="Nome do motorista"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600 min-h-11"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
                        CPF do Motorista
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={driverCpf}
                        onChange={(e) => setDriverCpf(e.target.value)}
                        placeholder="000.000.000-00"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600 min-h-11"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
                        Placa do Veículo *
                      </label>
                      <input
                        type="text"
                        required
                        value={plateNumber}
                        onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                        placeholder="ABC1D23"
                        maxLength={8}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-bold text-slate-900 outline-none focus:border-emerald-600 min-h-11"
                      />
                    </div>
                  </div>
                </div>

                {/* 2.3 Captura de Foto do Caminhão pela Câmera Mobile */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <Camera size={15} /> 2.3 Foto do Caminhão (Câmera Mobile)
                  </span>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoCapture}
                    className="hidden"
                  />

                  {truckPhoto ? (
                    <div className="relative rounded-2xl overflow-hidden border border-slate-300 max-h-56 bg-black flex items-center justify-center">
                      <img src={truckPhoto} alt="Caminhão" className="max-h-56 w-auto object-contain" />
                      <div className="absolute bottom-2 right-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-1.5 bg-black/75 hover:bg-black text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-md"
                        >
                          <RefreshCw size={13} /> Refazer Foto
                        </button>
                        <button
                          type="button"
                          onClick={clearPhoto}
                          className="px-3 py-1.5 bg-rose-600/90 hover:bg-rose-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-md"
                        >
                          <Trash2 size={13} /> Remover
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full min-h-14 border-2 border-dashed border-emerald-400 bg-emerald-50/50 hover:bg-emerald-50 rounded-2xl flex items-center justify-center gap-2.5 text-emerald-900 font-extrabold text-sm transition-all active:scale-98"
                    >
                      <Camera size={20} className="text-emerald-700" />
                      <span>Tirar Foto do Caminhão / Placa</span>
                    </button>
                  )}
                </div>

                {/* 2.4 Pesagem (Tara, Bruto e Líquido) */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                      <Scale size={15} /> 2.4 Pesagem da Carga (Toneladas)
                    </span>
                    <span className="text-xs text-slate-500 font-medium">Balança Rodoviária</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
                        Tara do Caminhão (t)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={tareWeight}
                        onChange={(e) => setTareWeight(e.target.value)}
                        placeholder="Ex: 14.50"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600 min-h-11"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
                        Peso Bruto (t)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={grossWeight}
                        onChange={(e) => setGrossWeight(e.target.value)}
                        placeholder="Ex: 48.80"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600 min-h-11"
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-[11px] font-black uppercase tracking-wider text-emerald-800 mb-1">
                        Peso Líquido Calculado (t)
                      </label>
                      <div className="w-full rounded-xl border-2 border-emerald-500 bg-emerald-50 px-3 py-2 text-base font-black text-emerald-950 flex items-center justify-between min-h-11">
                        <span>{formatTons(calculatedNetTons)}</span>
                        <span className="text-xs font-bold text-emerald-700">t</span>
                      </div>
                    </div>
                  </div>

                  {grossNum === 0 && tareNum === 0 && (
                    <div className="pt-1">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Ou digite o Peso Líquido Direto (caso a balança calcule internamente)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={manualNetWeight}
                        onChange={(e) => setManualNetWeight(e.target.value)}
                        placeholder="Ex: 34.30"
                        className="w-full sm:w-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AÇÕES DE RODAPÉ */}
            <div className="pt-2 flex flex-col-reverse sm:flex-row gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-12 flex-1 border border-slate-200 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-12 flex-[2] bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-extrabold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={18} /> Salvar & Emitir Ticket
              </button>
            </div>
          </form>
        )}
      </FlowSheet>

      {/* Modal de Cadastro Rápido de Pátio */}
      <QuickStockYardModal
        isOpen={isNewYardModalOpen}
        onClose={() => setIsNewYardModalOpen(false)}
        onSuccess={(yard) => {
          setSelectedYardId(yard.id);
          setIsNewYardModalOpen(false);
        }}
        onAddStockYard={onAddStockYard}
      />

      {/* Modal de Cadastro Rápido de Motorista */}
      <QuickDriverModal
        isOpen={isNewDriverModalOpen}
        onClose={() => setIsNewDriverModalOpen(false)}
        onSuccess={(driver) => {
          handleSelectDriver(driver);
          setIsNewDriverModalOpen(false);
        }}
        onAddTransportador={onAddTransportador}
        initialDriverName={driverName || driverSearch}
        initialPlate={plateNumber}
      />
    </>
  );
};

export default BargeDischargeModal;
