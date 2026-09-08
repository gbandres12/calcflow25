import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  ArrowRightLeft, 
  Truck, 
  Plus, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Printer, 
  FileText, 
  Trash2, 
  Edit3, 
  MapPin, 
  UserCheck, 
  Package, 
  X, 
  PenTool, 
  RotateCcw, 
  Layers,
  ChevronRight,
  ShieldCheck,
  Building2,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { TransferShipment, TransferItem, TransferStatus, StoreItem, Company, User } from '../types';

interface TransferManagementProps {
  transfers: TransferShipment[];
  storeItems: StoreItem[];
  company?: Company;
  currentUser?: User;
  onAddTransfer: (transfer: Omit<TransferShipment, 'id'>) => void;
  onUpdateTransfer: (transfer: TransferShipment) => void;
  onDeleteTransfer: (transferId: string) => void;
  onIntegrateWithStoreItems?: (items: { name: string; category: any; quantity: number; unit: string }[]) => void;
}

export const TransferManagement: React.FC<TransferManagementProps> = ({
  transfers,
  storeItems,
  company,
  currentUser,
  onAddTransfer,
  onUpdateTransfer,
  onDeleteTransfer,
  onIntegrateWithStoreItems
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TransferStatus>('ALL');

  // Modais
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<TransferShipment | null>(null);
  const [conferringTransfer, setConferringTransfer] = useState<TransferShipment | null>(null);
  const [printingTransfer, setPrintingTransfer] = useState<TransferShipment | null>(null);

  // Form de Criação / Edição de Relação
  const [formData, setFormData] = useState({
    code: '',
    originLocation: 'Polo de Compras Santarém (Av. Mendonça Furtado)',
    destinationLocation: 'Fazenda Usina Matriz (Zona Rural / Rodovia)',
    dateSent: new Date().toISOString().split('T')[0],
    sentBy: currentUser?.name || 'Compras / Expedição Santarém',
    carrierOrDriver: '',
    vehiclePlate: '',
    notes: ''
  });

  const [formItems, setFormItems] = useState<TransferItem[]>([]);

  // Item sendo adicionado no formulário
  const [newItem, setNewItem] = useState({
    productId: '',
    productName: '',
    category: 'Peças' as const,
    quantitySent: 1,
    unit: 'UN',
    unitCost: 0,
    nfCompraNumber: '',
    supplier: ''
  });

  const safeTransfers = useMemo(() => {
    return Array.isArray(transfers) ? transfers.filter(t => t && typeof t === 'object' && t.id) : [];
  }, [transfers]);

  // Reset / Preenchimento ao abrir modal de criação
  const handleOpenCreateModal = () => {
    const nextNum = (safeTransfers.length + 1).toString().padStart(3, '0');
    const year = new Date().getFullYear();
    setFormData({
      code: `TRF-${year}-${nextNum}`,
      originLocation: 'Polo de Compras Santarém (Av. Mendonça Furtado)',
      destinationLocation: 'Fazenda Usina Matriz (Zona Rural / Rodovia)',
      dateSent: new Date().toISOString().split('T')[0],
      sentBy: currentUser?.name ? `${currentUser.name} (Compras Santarém)` : 'Compras / Expedição Santarém',
      carrierOrDriver: '',
      vehiclePlate: '',
      notes: ''
    });
    setFormItems([]);
    setNewItem({
      productId: '',
      productName: '',
      category: 'Peças',
      quantitySent: 1,
      unit: 'UN',
      unitCost: 0,
      nfCompraNumber: '',
      supplier: ''
    });
    setEditingTransfer(null);
    setIsCreateModalOpen(true);
  };

  const handleOpenEditModal = (t: TransferShipment) => {
    setEditingTransfer(t);
    setFormData({
      code: t.code,
      originLocation: t.originLocation,
      destinationLocation: t.destinationLocation,
      dateSent: t.dateSent,
      sentBy: t.sentBy,
      carrierOrDriver: t.carrierOrDriver || '',
      vehiclePlate: t.vehiclePlate || '',
      notes: t.notes || ''
    });
    setFormItems(t.items || []);
    setIsCreateModalOpen(true);
  };

  const handleAddItemToForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.productName.trim() || newItem.quantitySent <= 0) return;

    const item: TransferItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      productId: newItem.productId || undefined,
      productName: newItem.productName.trim(),
      category: newItem.category,
      quantitySent: Number(newItem.quantitySent),
      quantityReceived: 0,
      unit: newItem.unit.toUpperCase().trim(),
      unitCost: Number(newItem.unitCost) || undefined,
      totalCost: (Number(newItem.unitCost) || 0) * Number(newItem.quantitySent),
      nfCompraNumber: newItem.nfCompraNumber.trim() || undefined,
      supplier: newItem.supplier.trim() || undefined,
      conferido: false
    };

    setFormItems(prev => [...prev, item]);
    setNewItem({
      productId: '',
      productName: '',
      category: 'Peças',
      quantitySent: 1,
      unit: 'UN',
      unitCost: 0,
      nfCompraNumber: '',
      supplier: ''
    });
  };

  const handleRemoveFormItem = (itemId: string) => {
    setFormItems(prev => prev.filter(i => i.id !== itemId));
  };

  const handleSelectExistingStoreItem = (storeId: string) => {
    const found = storeItems.find(s => s.id === storeId);
    if (found) {
      setNewItem(prev => ({
        ...prev,
        productId: found.id,
        productName: found.name,
        category: found.category as any,
        unit: found.unit
      }));
    }
  };

  const handleSaveTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim() || formItems.length === 0) {
      alert('Por favor, adicione pelo menos um produto ou suprimento à relação de envio.');
      return;
    }

    if (editingTransfer) {
      const updated: TransferShipment = {
        ...editingTransfer,
        ...formData,
        items: formItems,
        updatedAt: new Date().toISOString()
      };
      onUpdateTransfer(updated);
    } else {
      const created: Omit<TransferShipment, 'id'> = {
        ...formData,
        status: 'EM_TRANSITO',
        items: formItems,
        stockIntegrated: false,
        createdAt: new Date().toISOString()
      };
      onAddTransfer(created);
    }

    setIsCreateModalOpen(false);
  };

  // Filtragem
  const filteredTransfers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return safeTransfers.filter(t => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (!q) return true;

      const matchCode = (t.code || '').toLowerCase().includes(q);
      const matchSentBy = (t.sentBy || '').toLowerCase().includes(q);
      const matchReceivedBy = (t.receivedBy || '').toLowerCase().includes(q);
      const matchDriver = (t.carrierOrDriver || '').toLowerCase().includes(q);
      const matchPlate = (t.vehiclePlate || '').toLowerCase().includes(q);
      const matchItem = (t.items || []).some(it => 
        (it.productName || '').toLowerCase().includes(q) ||
        (it.supplier || '').toLowerCase().includes(q) ||
        (it.nfCompraNumber || '').toLowerCase().includes(q)
      );

      return matchCode || matchSentBy || matchReceivedBy || matchDriver || matchPlate || matchItem;
    });
  }, [safeTransfers, searchTerm, statusFilter]);

  // Estatísticas
  const stats = useMemo(() => {
    const total = safeTransfers.length;
    const inTransit = safeTransfers.filter(t => t.status === 'EM_TRANSITO').length;
    const received = safeTransfers.filter(t => t.status === 'CONFERIDO_E_RECEBIDO').length;
    const withDivergence = safeTransfers.filter(t => t.status === 'RECEBIDO_COM_DIVERGENCIA').length;
    const totalItemsTransferred = safeTransfers.reduce((s, t) => {
      return s + (t.items || []).reduce((acc, it) => acc + (Number(it.quantitySent) || 0), 0);
    }, 0);
    const totalCost = safeTransfers.reduce((s, t) => {
      return s + (t.items || []).reduce((acc, it) => acc + (Number(it.totalCost) || 0), 0);
    }, 0);

    return { total, inTransit, received, withDivergence, totalItemsTransferred, totalCost };
  }, [safeTransfers]);

  const formatBRL = (val?: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-300">
      
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-3xl text-white shadow-xl border border-indigo-500/20">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-400/30">
              <ArrowRightLeft size={24} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Transferências & Remessas
                <span className="text-xs bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Santarém ➔ Matriz
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-300">
                Cadastro de compras e peças em Santarém, emissão de romaneio de remessa, conferência física na Fazenda e assinatura digital.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-5 py-2.5 rounded-2xl font-bold text-sm shadow-lg shadow-indigo-500/25 transition-all transform active:scale-95"
          >
            <Plus size={18} />
            <span>Nova Relação de Remessa</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas da Logística */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Total de Remessas</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-800">{stats.total}</span>
            <span className="text-xs text-slate-500 font-bold">{stats.totalItemsTransferred} itens</span>
          </div>
        </div>

        <div className="bg-amber-50/70 p-5 rounded-2xl border border-amber-200/80 shadow-sm space-y-1">
          <span className="text-[11px] font-black uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
            <Truck size={14} className="animate-pulse" /> Em Trânsito (A Caminho)
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-800">{stats.inTransit}</span>
            <span className="text-xs text-amber-700 font-bold">Aguardando conferência</span>
          </div>
        </div>

        <div className="bg-emerald-50/70 p-5 rounded-2xl border border-emerald-200/80 shadow-sm space-y-1">
          <span className="text-[11px] font-black uppercase tracking-wider text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 size={14} /> Recebidos & Conferidos
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-800">{stats.received}</span>
            <span className="text-xs text-emerald-700 font-bold">Assinados na Matriz</span>
          </div>
        </div>

        <div className="bg-purple-50/70 p-5 rounded-2xl border border-purple-200/80 shadow-sm space-y-1">
          <span className="text-[11px] font-black uppercase tracking-wider text-purple-600">Valor Total Transportado</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-black text-purple-900">{formatBRL(stats.totalCost)}</span>
            <span className="text-xs text-purple-700 font-bold">Em Peças/Suprimentos</span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-96">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por código (TRF-...), produto, NF ou responsável..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              statusFilter === 'ALL' 
                ? 'bg-slate-900 text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Todos ({transfers.length})
          </button>
          <button
            onClick={() => setStatusFilter('EM_TRANSITO')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              statusFilter === 'EM_TRANSITO' 
                ? 'bg-amber-500 text-white shadow-sm' 
                : 'text-amber-700 bg-amber-50 hover:bg-amber-100/70'
            }`}
          >
            <Truck size={13} /> Em Trânsito ({stats.inTransit})
          </button>
          <button
            onClick={() => setStatusFilter('CONFERIDO_E_RECEBIDO')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              statusFilter === 'CONFERIDO_E_RECEBIDO' 
                ? 'bg-emerald-600 text-white shadow-sm' 
                : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100/70'
            }`}
          >
            <CheckCircle2 size={13} /> Conferidos ({stats.received})
          </button>
        </div>
      </div>

      {/* Lista de Romaneios / Guias de Transferência */}
      <div className="space-y-4">
        {filteredTransfers.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center space-y-3">
            <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-3xl flex items-center justify-center mx-auto">
              <Truck size={32} />
            </div>
            <h3 className="text-base font-bold text-slate-700">Nenhuma relação de transferência encontrada</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Cadastre uma nova relação de remessa para enviar peças, insumos e equipamentos de Santarém para a Fazenda Matriz.
            </p>
            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md mt-2"
            >
              <Plus size={16} />
              Criar Primeira Remessa
            </button>
          </div>
        ) : (
          filteredTransfers.map(transfer => {
            const itemCount = (transfer.items || []).length;
            const totalQty = (transfer.items || []).reduce((s, it) => s + (Number(it.quantitySent) || 0), 0);
            const totalTransferCost = (transfer.items || []).reduce((s, it) => s + (Number(it.totalCost) || 0), 0);
            const isDelivered = transfer.status === 'CONFERIDO_E_RECEBIDO';
            const isDivergent = transfer.status === 'RECEBIDO_COM_DIVERGENCIA';

            return (
              <div 
                key={transfer.id}
                className="bg-white rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all overflow-hidden"
              >
                {/* Cabeçalho do Card */}
                <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/40">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono font-black text-slate-900 text-base sm:text-lg tracking-tight">
                        {transfer.code}
                      </span>
                      
                      {transfer.status === 'EM_TRANSITO' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1 rounded-full animate-pulse">
                          <Truck size={13} /> Em Trânsito para Fazenda
                        </span>
                      )}
                      {isDelivered && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full">
                          <CheckCircle2 size={13} /> Conferido & Recebido
                        </span>
                      )}
                      {isDivergent && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider bg-orange-100 text-orange-800 border border-orange-200 px-3 py-1 rounded-full">
                          <AlertTriangle size={13} /> Recebido com Divergência
                        </span>
                      )}

                      {transfer.stockIntegrated && (
                        <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md">
                          Estoque Matriz Atualizado
                        </span>
                      )}
                    </div>

                    {/* Rota */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 pt-1">
                      <span className="flex items-center gap-1 font-semibold text-slate-700">
                        <MapPin size={14} className="text-indigo-600" />
                        {transfer.originLocation}
                      </span>
                      <ChevronRight size={14} className="text-slate-400" />
                      <span className="flex items-center gap-1 font-black text-emerald-700">
                        <Building2 size={14} className="text-emerald-600" />
                        {transfer.destinationLocation}
                      </span>
                    </div>
                  </div>

                  {/* Ações Rápidas */}
                  <div className="flex flex-wrap items-center gap-2">
                    {transfer.status === 'EM_TRANSITO' && (
                      <button
                        onClick={() => setConferringTransfer(transfer)}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-extrabold shadow-md shadow-emerald-600/20 transition-all active:scale-95"
                      >
                        <UserCheck size={16} />
                        Conferir & Assinar na Fazenda
                      </button>
                    )}

                    <button
                      onClick={() => setPrintingTransfer(transfer)}
                      className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold transition-colors"
                      title="Imprimir Guia de Transferência / Romaneio"
                    >
                      <Printer size={15} />
                      <span className="hidden sm:inline">Romaneio / Guia</span>
                    </button>

                    <button
                      onClick={() => handleOpenEditModal(transfer)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors"
                      title="Editar Relação"
                    >
                      <Edit3 size={16} />
                    </button>

                    <button
                      onClick={() => {
                        if (confirm(`Deseja realmente excluir a relação de transferência ${transfer.code}?`)) {
                          onDeleteTransfer(transfer.id);
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-xl transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Conteúdo: Itens e Dados de Transporte */}
                <div className="p-5 sm:p-6 space-y-4">
                  {/* Detalhes de Transporte e Expedição */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Data de Envio</span>
                      <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                        <Calendar size={13} className="text-slate-500" />
                        {new Date(transfer.dateSent).toLocaleDateString('pt-BR')}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Expedido em Santarém por</span>
                      <span className="font-bold text-slate-800 block mt-0.5 truncate">
                        {transfer.sentBy || 'Equipe de Compras'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Motorista / Transportador</span>
                      <span className="font-bold text-slate-800 block mt-0.5 truncate">
                        {transfer.carrierOrDriver || 'Próprio / Retirada'}
                        {transfer.vehiclePlate ? ` (${transfer.vehiclePlate})` : ''}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Valor dos Suprimentos</span>
                      <span className="font-bold text-slate-800 block mt-0.5">
                        {formatBRL(totalTransferCost)} ({itemCount} produtos)
                      </span>
                    </div>
                  </div>

                  {/* Relação de Itens da Remessa */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block">
                      Relação de Produtos & Peças Enviados ({itemCount} itens / {totalQty} unidades):
                    </span>

                    <div className="overflow-x-auto border border-slate-200/80 rounded-2xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200/80">
                          <tr>
                            <th className="px-4 py-2.5">Produto / Peça</th>
                            <th className="px-3 py-2.5">Categoria</th>
                            <th className="px-3 py-2.5 text-center">Qtde Enviada</th>
                            <th className="px-3 py-2.5 text-center">Qtde Recebida</th>
                            <th className="px-3 py-2.5">Fornecedor Santarém / NF</th>
                            <th className="px-3 py-2.5 text-right">Custo Unitário</th>
                            <th className="px-4 py-2.5 text-center">Conferência</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(transfer.items || []).map(item => (
                            <tr key={item.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-2.5 font-bold text-slate-800">
                                {item.productName}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                                  {item.category || 'Peças'}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center font-extrabold text-slate-900">
                                {item.quantitySent} {item.unit}
                              </td>
                              <td className="px-3 py-2.5 text-center font-bold">
                                {isDelivered || isDivergent ? (
                                  <span className={item.quantityReceived === item.quantitySent ? 'text-emerald-700 font-extrabold' : 'text-amber-700 font-extrabold'}>
                                    {item.quantityReceived ?? item.quantitySent} {item.unit}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic">Em trânsito</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-slate-600">
                                {item.supplier || item.nfCompraNumber ? (
                                  <div>
                                    <span className="font-semibold text-slate-800">{item.supplier || 'Fornecedor Local'}</span>
                                    {item.nfCompraNumber && (
                                      <span className="text-slate-400 block text-[10px]">{item.nfCompraNumber}</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                                {item.unitCost ? formatBRL(item.unitCost) : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {item.conferido ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                    <CheckCircle2 size={12} /> OK
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                                    Pendente
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Informações da Conferência e Assinatura se já recebido */}
                  {(isDelivered || isDivergent) && (
                    <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-black tracking-wider text-emerald-700 flex items-center gap-1">
                          <ShieldCheck size={14} /> Recebido e Conferido na Fazenda Matriz
                        </span>
                        <p className="font-bold text-slate-800">
                          Por: <span className="text-emerald-950 font-black">{transfer.receivedBy || 'Encarregado'}</span>
                          {transfer.receiverRole ? ` (${transfer.receiverRole})` : ''}
                          {transfer.receivedDate ? ` em ${transfer.receivedDate}` : ''}
                        </p>
                        {transfer.conferenceNotes && (
                          <p className="text-slate-600 italic">
                            "{transfer.conferenceNotes}"
                          </p>
                        )}
                      </div>

                      {/* Visualizador de Assinatura */}
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Assinatura do Recebedor</span>
                        {transfer.receiverSignature?.startsWith('data:image') ? (
                          <div className="bg-white p-1 rounded-xl border border-emerald-300 shadow-sm inline-block">
                            <img 
                              src={transfer.receiverSignature} 
                              alt="Assinatura" 
                              className="h-10 max-w-[140px] object-contain"
                            />
                          </div>
                        ) : (
                          <div className="bg-white px-3 py-1.5 rounded-xl border border-emerald-300 font-mono text-[11px] font-bold text-emerald-800 shadow-sm inline-flex items-center gap-1.5">
                            <CheckCircle2 size={13} /> Assinado Digitalmente
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {transfer.notes && (
                    <p className="text-xs text-slate-500 italic bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <span className="font-bold text-slate-700 not-italic">Observações:</span> {transfer.notes}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL DE CRIAÇÃO / EDIÇÃO DE RELAÇÃO DE TRANSFERÊNCIA     */}
      {/* ======================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-auto animate-in zoom-in-95">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-400/30">
                  <ArrowRightLeft size={22} />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">
                    {editingTransfer ? 'Editar Relação de Remessa' : 'Nova Relação de Remessa (Santarém ➔ Matriz)'}
                  </h3>
                  <p className="text-xs text-indigo-200/80">
                    Cadastre os produtos e peças comprados em Santarém que serão transportados para a Fazenda Matriz
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* Dados Gerais da Remessa */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Código do Romaneio *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                    placeholder="TRF-2026-001"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Data de Expedição / Saída *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.dateSent}
                    onChange={e => setFormData({ ...formData, dateSent: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Responsável pelo Envio em Santarém *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.sentBy}
                    onChange={e => setFormData({ ...formData, sentBy: e.target.value })}
                    placeholder="Ex: Gabriel (Compras Santarém)"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Origem do Envio
                  </label>
                  <input
                    type="text"
                    value={formData.originLocation}
                    onChange={e => setFormData({ ...formData, originLocation: e.target.value })}
                    placeholder="Ex: Polo de Compras Santarém"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Destino
                  </label>
                  <input
                    type="text"
                    value={formData.destinationLocation}
                    onChange={e => setFormData({ ...formData, destinationLocation: e.target.value })}
                    placeholder="Ex: Fazenda Usina Matriz"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Motorista / Transportador
                  </label>
                  <input
                    type="text"
                    value={formData.carrierOrDriver}
                    onChange={e => setFormData({ ...formData, carrierOrDriver: e.target.value })}
                    placeholder="Ex: Antônio Ferreira"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Placa / Veículo
                  </label>
                  <input
                    type="text"
                    value={formData.vehiclePlate}
                    onChange={e => setFormData({ ...formData, vehiclePlate: e.target.value })}
                    placeholder="Ex: OBX-8819 (Picape / Caminhão)"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Observações de Transporte
                  </label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Ex: Levar com cuidado, peças frágeis"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* SEÇÃO: CADASTRO / ADIÇÃO DE PRODUTOS NA RELAÇÃO */}
              <div className="border-t border-slate-200 pt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                      <Package size={17} className="text-indigo-600" />
                      Cadastrar Produtos e Peças na Relação
                    </h4>
                    <p className="text-xs text-slate-500">
                      Você pode selecionar itens existentes do estoque ou digitar novos produtos comprados em Santarém.
                    </p>
                  </div>
                </div>

                {/* Sub-form de adição de item */}
                <div className="bg-indigo-50/40 p-4 rounded-2xl border border-indigo-100 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Puxar do Almoxarifado Existente (Opcional)
                      </label>
                      <select
                        value={newItem.productId}
                        onChange={e => handleSelectExistingStoreItem(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">-- Ou digite um novo produto abaixo --</option>
                        {storeItems.map(si => (
                          <option key={si.id} value={si.id}>
                            {si.name} ({si.category} - {si.quantity} {si.unit} em estoque)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Nome / Descrição do Produto ou Peça *
                      </label>
                      <input
                        type="text"
                        value={newItem.productName}
                        onChange={e => setNewItem({ ...newItem, productName: e.target.value })}
                        placeholder="Ex: Correia B-120, Rolamento 6312, Óleo 68..."
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Categoria
                      </label>
                      <select
                        value={newItem.category}
                        onChange={e => setNewItem({ ...newItem, category: e.target.value as any })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="Peças">Peças</option>
                        <option value="Lubrificantes">Lubrificantes</option>
                        <option value="EPI">EPI</option>
                        <option value="Ferramentas">Ferramentas</option>
                        <option value="Insumos">Insumos</option>
                        <option value="Outros">Outros</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Quantidade *
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={newItem.quantitySent}
                          onChange={e => setNewItem({ ...newItem, quantitySent: parseFloat(e.target.value) || 1 })}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <input
                          type="text"
                          value={newItem.unit}
                          onChange={e => setNewItem({ ...newItem, unit: e.target.value })}
                          placeholder="UN"
                          className="w-16 px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold uppercase text-center outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Custo Unit. (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newItem.unitCost || ''}
                        onChange={e => setNewItem({ ...newItem, unitCost: parseFloat(e.target.value) || 0 })}
                        placeholder="0,00"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        NF de Compra Santarém
                      </label>
                      <input
                        type="text"
                        value={newItem.nfCompraNumber}
                        onChange={e => setNewItem({ ...newItem, nfCompraNumber: e.target.value })}
                        placeholder="Ex: NF 1420"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Fornecedor Local em Santarém
                      </label>
                      <input
                        type="text"
                        value={newItem.supplier}
                        onChange={e => setNewItem({ ...newItem, supplier: e.target.value })}
                        placeholder="Ex: Casa dos Rolamentos, Tapajós Borrachas, Posto..."
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleAddItemToForm}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95"
                      >
                        <Plus size={16} />
                        Incluir na Relação
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tabela de Itens Adicionados */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700">
                    Itens Inclusos na Relação ({formItems.length}):
                  </span>

                  {formItems.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs font-medium">
                      Nenhum item adicionado ainda. Preencha os dados acima e clique em "Incluir na Relação".
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                          <tr>
                            <th className="px-4 py-2">Produto</th>
                            <th className="px-3 py-2">Categoria</th>
                            <th className="px-3 py-2 text-center">Quantidade</th>
                            <th className="px-3 py-2">Fornecedor / NF</th>
                            <th className="px-3 py-2 text-right">Valor Est.</th>
                            <th className="px-3 py-2 text-center">Remover</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {formItems.map((item, idx) => (
                            <tr key={item.id} className="hover:bg-slate-50/70">
                              <td className="px-4 py-2 font-bold text-slate-800">
                                {idx + 1}. {item.productName}
                              </td>
                              <td className="px-3 py-2 text-slate-600">{item.category}</td>
                              <td className="px-3 py-2 text-center font-extrabold text-slate-900">
                                {item.quantitySent} {item.unit}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                {item.supplier || item.nfCompraNumber || '—'}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {item.totalCost ? formatBRL(item.totalCost) : '—'}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFormItem(item.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Botões do Rodapé */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold shadow-lg shadow-indigo-600/25 transition-all"
                >
                  {editingTransfer ? 'Salvar Alterações' : 'Emitir Relação e Iniciar Envio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL DE CONFERÊNCIA E ASSINATURA NA FAZENDA MATRIZ       */}
      {/* ======================================================== */}
      {conferringTransfer && (
        <ConferenceAndSignatureModal
          transfer={conferringTransfer}
          currentUser={currentUser}
          onClose={() => setConferringTransfer(null)}
          onConfirm={(updatedTransfer, shouldIntegrateStock) => {
            onUpdateTransfer(updatedTransfer);
            if (shouldIntegrateStock && onIntegrateWithStoreItems) {
              // Converter itens conferidos para adicionar ao almoxarifado
              const itemsToIntegrate = updatedTransfer.items.map(it => ({
                name: it.productName,
                category: it.category || 'Peças',
                quantity: it.quantityReceived ?? it.quantitySent,
                unit: it.unit
              }));
              onIntegrateWithStoreItems(itemsToIntegrate);
            }
            setConferringTransfer(null);
          }}
        />
      )}

      {/* ======================================================== */}
      {/* MODAL DE VISUALIZAÇÃO / IMPRESSÃO DO ROMANEIO             */}
      {/* ======================================================== */}
      {printingTransfer && (
        <PrintRomaneioModal
          transfer={printingTransfer}
          company={company}
          onClose={() => setPrintingTransfer(null)}
        />
      )}

    </div>
  );
};

// =========================================================================
// SUB-COMPONENTE: MODAL DE CONFERÊNCIA E ASSINATURA DIGITAL NA FAZENDA
// =========================================================================
interface ConferenceAndSignatureModalProps {
  transfer: TransferShipment;
  currentUser?: User;
  onClose: () => void;
  onConfirm: (transfer: TransferShipment, shouldIntegrateStock: boolean) => void;
}

const ConferenceAndSignatureModal: React.FC<ConferenceAndSignatureModalProps> = ({
  transfer,
  currentUser,
  onClose,
  onConfirm
}) => {
  const [receiverName, setReceiverName] = useState(currentUser?.name || 'Encarregado Fazenda Matriz');
  const [receiverRole, setReceiverRole] = useState('Almoxarife / Encarregado de Fazenda');
  const [conferenceNotes, setConferenceNotes] = useState('Todos os produtos foram conferidos fisicamente e recebidos.');
  const [integrateStock, setIntegrateStock] = useState(true);

  // Lista dos itens com conferência individual
  const [itemsConference, setItemsConference] = useState<TransferItem[]>(
    transfer.items.map(it => ({
      ...it,
      quantityReceived: it.quantitySent,
      conferido: true,
      divergenceNotes: ''
    }))
  );

  // Canvas de Assinatura Digital
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#0f172a'; // slate-900
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleUpdateItem = (itemId: string, field: keyof TransferItem, value: any) => {
    setItemsConference(prev => prev.map(it => {
      if (it.id === itemId) {
        return { ...it, [field]: value };
      }
      return it;
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiverName.trim()) {
      alert('Por favor, informe o nome de quem fez a conferência na Fazenda.');
      return;
    }

    // Captura assinatura como data URL do canvas ou gera carimbo
    let signatureUrl = '';
    if (hasDrawn && canvasRef.current) {
      signatureUrl = canvasRef.current.toDataURL('image/png');
    } else {
      signatureUrl = `assinatura_digital_${Date.now()}`;
    }

    // Detectar se há divergência
    const hasAnyDivergence = itemsConference.some(it => 
      (it.quantityReceived ?? it.quantitySent) !== it.quantitySent || (it.divergenceNotes && it.divergenceNotes.trim().length > 0)
    );

    const nowStr = new Date().toLocaleString('pt-BR');

    const updated: TransferShipment = {
      ...transfer,
      status: hasAnyDivergence ? 'RECEBIDO_COM_DIVERGENCIA' : 'CONFERIDO_E_RECEBIDO',
      receivedDate: nowStr,
      receivedBy: receiverName.trim(),
      receiverRole: receiverRole.trim(),
      conferenceNotes: conferenceNotes.trim(),
      receiverSignature: signatureUrl,
      items: itemsConference,
      stockIntegrated: integrateStock,
      updatedAt: new Date().toISOString()
    };

    onConfirm(updated, integrateStock);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-auto animate-in zoom-in-95">
        
        {/* Cabeçalho */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-300 rounded-xl border border-emerald-400/30">
              <UserCheck size={22} />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight flex items-center gap-2">
                Conferência e Recebimento na Fazenda Matriz
                <span className="text-[10px] bg-emerald-500/30 text-emerald-200 px-2 py-0.5 rounded-full font-bold uppercase">
                  {transfer.code}
                </span>
              </h3>
              <p className="text-xs text-emerald-200/80">
                Confira os produtos enviados de Santarém, aponte divergências e assine o recebimento
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {/* Dados da Remessa */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Origem</span>
              <span className="font-bold text-slate-800">{transfer.originLocation}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Destino</span>
              <span className="font-bold text-emerald-800">{transfer.destinationLocation}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Data Envio</span>
              <span className="font-bold text-slate-800">{new Date(transfer.dateSent).toLocaleDateString('pt-BR')}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Motorista / Placa</span>
              <span className="font-bold text-slate-800">{transfer.carrierOrDriver || '—'} {transfer.vehiclePlate ? `(${transfer.vehiclePlate})` : ''}</span>
            </div>
          </div>

          {/* CHECKLIST DE CONFERÊNCIA ITEM A ITEM */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                Conferência Física dos Itens Recebidos
              </h4>
              <button
                type="button"
                onClick={() => {
                  setItemsConference(prev => prev.map(it => ({
                    ...it,
                    quantityReceived: it.quantitySent,
                    conferido: true,
                    divergenceNotes: ''
                  })));
                }}
                className="text-[11px] text-emerald-700 hover:text-emerald-800 font-bold bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-xl transition-all"
              >
                ✓ Marcar 100% Conferido e Sem Faltas
              </button>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5">Item Enviado</th>
                    <th className="px-3 py-2.5 text-center">Qtde Enviada</th>
                    <th className="px-3 py-2.5 text-center">Qtde Recebida *</th>
                    <th className="px-3 py-2.5 text-center">Status</th>
                    <th className="px-4 py-2.5">Anotações / Avarias</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itemsConference.map((item) => {
                    const isMismatch = Number(item.quantityReceived) !== Number(item.quantitySent);

                    return (
                      <tr key={item.id} className={isMismatch ? 'bg-amber-50/60' : 'hover:bg-slate-50/50'}>
                        <td className="px-4 py-3">
                          <span className="font-bold text-slate-800 block">{item.productName}</span>
                          <span className="text-[10px] text-slate-500">{item.category} {item.supplier ? `· ${item.supplier}` : ''}</span>
                        </td>
                        <td className="px-3 py-3 text-center font-bold text-slate-700">
                          {item.quantitySent} {item.unit}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.quantityReceived ?? item.quantitySent}
                              onChange={e => handleUpdateItem(item.id, 'quantityReceived', parseFloat(e.target.value) || 0)}
                              className={`w-20 px-2 py-1 border rounded-lg text-center font-black text-xs outline-none focus:ring-2 ${
                                isMismatch 
                                  ? 'border-amber-400 bg-white text-amber-900 focus:ring-amber-500' 
                                  : 'border-slate-200 bg-slate-50 text-slate-800 focus:ring-emerald-500'
                              }`}
                            />
                            <span className="text-[10px] font-bold text-slate-500">{item.unit}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] font-bold">
                            <input
                              type="checkbox"
                              checked={item.conferido ?? true}
                              onChange={e => handleUpdateItem(item.id, 'conferido', e.target.checked)}
                              className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                            />
                            <span className={item.conferido ? 'text-emerald-700' : 'text-slate-400'}>
                              {item.conferido ? 'Conferido' : 'Pendente'}
                            </span>
                          </label>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={item.divergenceNotes || ''}
                            onChange={e => handleUpdateItem(item.id, 'divergenceNotes', e.target.value)}
                            placeholder={isMismatch ? 'Motivo da divergência...' : 'Observações (opcional)'}
                            className="w-full px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* DADOS DO RECEBEDOR NA FAZENDA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-200 pt-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                Nome de Quem Fez a Conferência na Fazenda *
              </label>
              <input
                type="text"
                required
                value={receiverName}
                onChange={e => setReceiverName(e.target.value)}
                placeholder="Ex: Carlos Eduardo"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                Função / Cargo na Fazenda
              </label>
              <input
                type="text"
                value={receiverRole}
                onChange={e => setReceiverRole(e.target.value)}
                placeholder="Ex: Almoxarife / Gerente de Produção"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                Parecer Geral da Conferência
              </label>
              <input
                type="text"
                value={conferenceNotes}
                onChange={e => setConferenceNotes(e.target.value)}
                placeholder="Ex: Produtos conferidos fisicamente e armazenados na prateleira de peças."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* ÁREA DE ASSINATURA DIGITAL */}
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <PenTool size={15} className="text-indigo-600" />
                  Assinatura do Recebedor na Tela (Celular, Tablet ou Mouse)
                </label>
                <p className="text-[11px] text-slate-500">
                  Assine com o dedo ou mouse para validar legalmente a conferência dos materiais.
                </p>
              </div>
              <button
                type="button"
                onClick={clearSignature}
                className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-xl transition-colors"
              >
                <RotateCcw size={13} /> Limpar
              </button>
            </div>

            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-2 bg-slate-50/50 flex justify-center">
              <canvas
                ref={canvasRef}
                width={500}
                height={120}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="bg-white rounded-xl border border-slate-200 touch-none cursor-crosshair w-full max-w-[500px] h-[120px]"
              />
            </div>
            {!hasDrawn && (
              <p className="text-[10px] text-slate-400 italic text-center">
                * Se preferir não desenhar, uma assinatura eletrônica com carimbo de data e hora do usuário logado será gerada automaticamente.
              </p>
            )}
          </div>

          {/* INTEGRAÇÃO COM ESTOQUE DA MATRIZ */}
          <div className="bg-indigo-50/70 border border-indigo-200 p-4 rounded-2xl flex items-start gap-3">
            <input
              type="checkbox"
              id="integrateStockCheck"
              checked={integrateStock}
              onChange={e => setIntegrateStock(e.target.checked)}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 mt-0.5"
            />
            <label htmlFor="integrateStockCheck" className="text-xs cursor-pointer">
              <span className="font-black text-indigo-950 block">
                Dar entrada automática no Almoxarifado / Estoque da Fazenda Matriz
              </span>
              <span className="text-indigo-800/80 block mt-0.5">
                Atualiza os saldos das peças existentes ou cadastra automaticamente os novos itens recebidos no estoque de suprimentos da Fazenda Matriz.
              </span>
            </label>
          </div>

          {/* Botões do Rodapé */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-lg shadow-emerald-600/25 transition-all flex items-center gap-1.5"
            >
              <CheckCircle2 size={16} />
              Confirmar Recebimento e Salvar Assinatura
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =========================================================================
// SUB-COMPONENTE: MODAL DE VISUALIZAÇÃO E IMPRESSÃO DO ROMANEIO FÍSICO
// =========================================================================
interface PrintRomaneioModalProps {
  transfer: TransferShipment;
  company?: Company;
  onClose: () => void;
}

const PrintRomaneioModal: React.FC<PrintRomaneioModalProps> = ({
  transfer,
  company,
  onClose
}) => {
  const handlePrint = () => {
    window.print();
  };

  const formatBRL = (val?: number) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const totalQty = (transfer.items || []).reduce((s, it) => s + (Number(it.quantitySent) || 0), 0);
  const totalCost = (transfer.items || []).reduce((s, it) => s + (Number(it.totalCost) || 0), 0);

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:fixed print:inset-0">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-auto animate-in zoom-in-95 print:border-none print:shadow-none print:rounded-none">
        
        {/* Barra de Ações (oculta na impressão) */}
        <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center print:hidden">
          <div className="flex items-center gap-2">
            <Printer size={18} className="text-indigo-400" />
            <span className="font-bold text-sm">Guia de Remessa e Transferência de Materiais</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition-all"
            >
              <Printer size={15} /> Imprimir Guia / Romaneio
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-full text-slate-300 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* DOCUMENTO DO ROMANEIO IMPRESSO */}
        <div className="p-8 sm:p-12 space-y-6 text-slate-800 print:p-6 print:space-y-4">
          
          {/* Cabeçalho da Empresa */}
          <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950 uppercase">
                {company?.tradeName || company?.corporateName || 'CALCÁRIOFLOW MINERAÇÃO E INDÚSTRIA LTDA'}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5 font-medium">
                {company?.corporateName ? `${company.corporateName} · ` : ''}CNPJ: {company?.cnpj || '10.375.218/0001-50'} · IE: {company?.ie || '15.489.201-9'}
              </p>
              <p className="text-xs text-slate-500">
                Logística Integrada: Santarém (PA) ➔ Fazenda Usina Matriz (Zona Rural / Rodovia)
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Nº DA GUIA</span>
              <span className="text-xl font-mono font-black text-slate-900 block">{transfer.code}</span>
              <span className="text-xs text-slate-500">Data: {new Date(transfer.dateSent).toLocaleDateString('pt-BR')}</span>
            </div>
          </div>

          {/* Título do Documento */}
          <div className="bg-slate-100 p-2.5 rounded-lg text-center font-black uppercase text-xs tracking-wider text-slate-800">
            GUIA DE REMESSA DE MATERIAIS, PEÇAS E SUPRIMENTOS (TRANSFERÊNCIA INTERNA)
          </div>

          {/* Dados da Rota e Transporte */}
          <div className="grid grid-cols-2 gap-4 text-xs border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">LOCAL DE EXPEDIÇÃO (ORIGEM)</span>
              <span className="font-bold text-slate-900 block mt-0.5">{transfer.originLocation}</span>
              <span className="text-slate-600 block mt-1">Expedido por: <strong>{transfer.sentBy}</strong></span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">LOCAL DE DESTINO</span>
              <span className="font-bold text-slate-900 block mt-0.5">{transfer.destinationLocation}</span>
              <span className="text-slate-600 block mt-1">
                Motorista: <strong>{transfer.carrierOrDriver || 'Próprio'}</strong> {transfer.vehiclePlate ? `(Placa: ${transfer.vehiclePlate})` : ''}
              </span>
            </div>
          </div>

          {/* Tabela de Produtos */}
          <div className="space-y-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 block">
              RELAÇÃO DE PRODUTOS E SUPRIMENTOS:
            </span>

            <table className="w-full text-left text-xs border-collapse border border-slate-300">
              <thead className="bg-slate-200 text-slate-800 font-bold uppercase text-[10px]">
                <tr>
                  <th className="border border-slate-300 px-3 py-2 text-center w-8">#</th>
                  <th className="border border-slate-300 px-3 py-2">Descrição do Material / Peça</th>
                  <th className="border border-slate-300 px-3 py-2">Categoria</th>
                  <th className="border border-slate-300 px-3 py-2 text-center">Unid.</th>
                  <th className="border border-slate-300 px-3 py-2 text-center">Qtde Env.</th>
                  <th className="border border-slate-300 px-3 py-2 text-center">Qtde Rec.</th>
                  <th className="border border-slate-300 px-3 py-2">Fornecedor Santarém / NF</th>
                  <th className="border border-slate-300 px-3 py-2 text-center w-16">Visto</th>
                </tr>
              </thead>
              <tbody>
                {(transfer.items || []).map((item, idx) => (
                  <tr key={item.id} className="border-b border-slate-200">
                    <td className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-500">{idx + 1}</td>
                    <td className="border border-slate-300 px-3 py-2 font-bold text-slate-900">{item.productName}</td>
                    <td className="border border-slate-300 px-3 py-2 text-slate-600">{item.category}</td>
                    <td className="border border-slate-300 px-3 py-2 text-center font-mono">{item.unit}</td>
                    <td className="border border-slate-300 px-3 py-2 text-center font-black">{item.quantitySent}</td>
                    <td className="border border-slate-300 px-3 py-2 text-center font-black">
                      {transfer.status === 'CONFERIDO_E_RECEBIDO' || transfer.status === 'RECEBIDO_COM_DIVERGENCIA'
                        ? (item.quantityReceived ?? item.quantitySent)
                        : ''}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-slate-600">
                      {item.supplier || ''} {item.nfCompraNumber ? `(${item.nfCompraNumber})` : ''}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-center">
                      {item.conferido ? '✓' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 font-bold">
                <tr>
                  <td colSpan={4} className="border border-slate-300 px-3 py-2 text-right">TOTAIS:</td>
                  <td className="border border-slate-300 px-3 py-2 text-center font-black">{totalQty}</td>
                  <td colSpan={3} className="border border-slate-300 px-3 py-2 text-right font-mono">
                    {totalCost > 0 ? `Valor Estimado: ${formatBRL(totalCost)}` : ''}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {transfer.notes && (
            <div className="text-xs text-slate-600">
              <strong>Observações da Expedição:</strong> {transfer.notes}
            </div>
          )}

          {/* BLOCO DE ASSINATURAS E CONFERÊNCIA */}
          <div className="pt-8 border-t border-slate-300 grid grid-cols-2 gap-8 text-xs">
            {/* Assinatura Expedição Santarém */}
            <div className="space-y-4 text-center">
              <div className="border-b border-slate-400 pb-1 h-14 flex items-end justify-center">
                <span className="font-serif italic text-slate-800 text-sm">{transfer.sentBy}</span>
              </div>
              <div>
                <span className="font-bold text-slate-900 block">Expedido em Santarém</span>
                <span className="text-[10px] text-slate-500 block">Responsável pelas Compras / Despacho</span>
                <span className="text-[10px] text-slate-500">Data: {new Date(transfer.dateSent).toLocaleDateString('pt-BR')}</span>
              </div>
            </div>

            {/* Assinatura Recebimento Fazenda Matriz */}
            <div className="space-y-4 text-center">
              <div className="border-b border-slate-400 pb-1 h-14 flex items-end justify-center">
                {transfer.receiverSignature?.startsWith('data:image') ? (
                  <img 
                    src={transfer.receiverSignature} 
                    alt="Assinatura Digital" 
                    className="h-12 object-contain"
                  />
                ) : transfer.receivedBy ? (
                  <span className="font-serif italic text-emerald-900 text-sm font-bold">
                    ✓ Assinado por: {transfer.receivedBy}
                  </span>
                ) : (
                  <span className="text-slate-300 italic text-[11px]">Assinatura e carimbo do recebedor</span>
                )}
              </div>
              <div>
                <span className="font-bold text-slate-900 block">
                  {transfer.receivedBy ? `Recebido por: ${transfer.receivedBy}` : 'Recebido e Conferido na Fazenda Matriz'}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {transfer.receiverRole || 'Encarregado de Almoxarifado / Conferente'}
                </span>
                <span className="text-[10px] text-slate-500">
                  Data de Recebimento: {transfer.receivedDate || '_____/_____/2026'}
                </span>
              </div>
            </div>
          </div>

          {/* Rodapé Fiscal / Informativo */}
          <div className="pt-4 text-center text-[10px] text-slate-400 border-t border-slate-200">
            Documento emitido internamente para controle de logística e conferência de suprimentos entre as filiais da empresa.
          </div>
        </div>

      </div>
    </div>
  );
};
export default TransferManagement;
