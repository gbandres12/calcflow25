import React, { useEffect, useMemo, useState } from 'react';
import {
  Edit2,
  FileText,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
  X
} from 'lucide-react';
import {
  Company,
  FiscalConfig,
  InventoryItem,
  PurchaseAuthorization,
  PurchaseAuthorizationItem,
  StoreItem,
  User
} from '../types';
import { db } from '../services/dataService';
import { newId } from '../services/ids';
import { openPurchaseAuthorizationPdf } from '../services/domain/purchaseAuthorizationPdf';
import { openPurchaseAuthorizationThermalPrint } from '../services/domain/thermalTicket';

interface PurchaseAuthorizationTabProps {
  companyId: string;
  company?: Company | null;
  fiscalConfig?: Partial<FiscalConfig> | null;
  currentUser?: User | null;
  storeItems: StoreItem[];
  inventory: InventoryItem[];
  onRefreshStoreItems?: () => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const generateAuthNumber = (existing: PurchaseAuthorization[]) => {
  const prefix = `AC-${todayIso().replace(/-/g, '')}`;
  const count = existing.filter((a) => a.number?.startsWith(prefix)).length + 1;
  return `${prefix}-${String(count).padStart(3, '0')}`;
};

const formatDateBR = (iso?: string) => {
  if (!iso) return '-';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

export const PurchaseAuthorizationTab: React.FC<PurchaseAuthorizationTabProps> = ({
  companyId,
  company,
  fiscalConfig,
  currentUser,
  storeItems,
  inventory,
  onRefreshStoreItems
}) => {
  const [authorizations, setAuthorizations] = useState<PurchaseAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(todayIso());
  const [authorizedBuyer, setAuthorizedBuyer] = useState('');
  const [authorizedBy, setAuthorizedBy] = useState(currentUser?.name || '');
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseAuthorizationItem[]>([]);
  const [savedCatalogIds, setSavedCatalogIds] = useState<Record<string, boolean>>({});

  const loadAuthorizations = async () => {
    setLoading(true);
    try {
      const list = (await db.getTable('purchase_authorizations', companyId)) as PurchaseAuthorization[];
      setAuthorizations(
        (list || []).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))
      );
    } catch (err) {
      console.error('Erro ao carregar autorizações de compra:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuthorizations();
  }, [companyId]);

  const catalogOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; unit: string; source: 'store' | 'inventory' }>();
    storeItems.forEach((s) => {
      if (s.name) {
        map.set(s.name.toLowerCase(), {
          id: s.id,
          name: s.name,
          unit: s.unit || 'UN',
          source: 'store'
        });
      }
    });
    inventory.forEach((inv) => {
      const name = inv.name || inv.code;
      if (name && !map.has(name.toLowerCase())) {
        map.set(name.toLowerCase(), {
          id: inv.id,
          name,
          unit: inv.unit || 'UN',
          source: 'inventory'
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [storeItems, inventory]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return authorizations;
    return authorizations.filter(
      (a) =>
        a.number?.toLowerCase().includes(q) ||
        a.authorizedBuyer?.toLowerCase().includes(q) ||
        a.authorizedBy?.toLowerCase().includes(q) ||
        a.supplierName?.toLowerCase().includes(q) ||
        a.items?.some((i) => i.productName?.toLowerCase().includes(q))
    );
  }, [authorizations, search]);

  const openNewModal = () => {
    setEditingId(null);
    setNumber(generateAuthNumber(authorizations));
    setDate(todayIso());
    setAuthorizedBuyer('');
    setAuthorizedBy(currentUser?.name || '');
    setSupplierName('');
    setNotes('');
    setItems([
      {
        id: newId('pai'),
        productName: '',
        unit: 'UN',
        quantity: 1,
        productSource: 'custom'
      }
    ]);
    setSavedCatalogIds({});
    setIsModalOpen(true);
  };

  const openEditModal = (auth: PurchaseAuthorization) => {
    setEditingId(auth.id);
    setNumber(auth.number);
    setDate(auth.date || todayIso());
    setAuthorizedBuyer(auth.authorizedBuyer);
    setAuthorizedBy(auth.authorizedBy);
    setSupplierName(auth.supplierName || '');
    setNotes(auth.notes || '');
    setItems(
      (auth.items || []).map((i) => ({ ...i }))
    );
    setSavedCatalogIds({});
    setIsModalOpen(true);
  };

  const addItemRow = () => {
    setItems((prev) => [
      ...prev,
      {
        id: newId('pai'),
        productName: '',
        unit: 'UN',
        quantity: 1,
        productSource: 'custom'
      }
    ]);
  };

  const removeItemRow = (id: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));
  };

  const updateItem = (id: string, patch: Partial<PurchaseAuthorizationItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...patch };
        if (patch.productName !== undefined) {
          const match = catalogOptions.find(
            (c) => c.name.toLowerCase() === patch.productName!.trim().toLowerCase()
          );
          if (match) {
            updated.productId = match.id;
            updated.productSource = match.source;
            if (!patch.unit) updated.unit = match.unit;
          } else {
            updated.productId = undefined;
            updated.productSource = 'custom';
          }
        }
        return updated;
      })
    );
  };

  const handleSaveProductToCatalog = async (item: PurchaseAuthorizationItem) => {
    const name = item.productName.trim();
    if (!name) return;
    try {
      const newStoreItem: StoreItem = {
        id: newId('sti'),
        name,
        category: 'Outros',
        unit: (item.unit || 'UN').toUpperCase(),
        quantity: 0,
        minStock: 0,
        companyId
      };
      await db.upsert('store_items', companyId, newStoreItem);
      updateItem(item.id, { productId: newStoreItem.id, productSource: 'store' });
      setSavedCatalogIds((prev) => ({ ...prev, [item.id]: true }));
      onRefreshStoreItems?.();
    } catch (err) {
      console.error('Erro ao salvar produto no catálogo:', err);
      alert('Não foi possível salvar o produto no catálogo.');
    }
  };

  const buildRecord = (): PurchaseAuthorization | null => {
    if (!authorizedBuyer.trim()) {
      alert('Informe o nome do comprador autorizado.');
      return null;
    }
    if (!authorizedBy.trim()) {
      alert('Informe quem está autorizando a compra.');
      return null;
    }
    const validItems = items.filter((i) => i.productName.trim() && Number(i.quantity) > 0);
    if (validItems.length === 0) {
      alert('Adicione pelo menos um produto com quantidade maior que zero.');
      return null;
    }
    const now = new Date().toISOString();
    return {
      id: editingId || newId('pa'),
      number: number.trim() || generateAuthNumber(authorizations),
      date: date || todayIso(),
      authorizedBuyer: authorizedBuyer.trim(),
      authorizedBy: authorizedBy.trim(),
      supplierName: supplierName.trim() || undefined,
      notes: notes.trim() || undefined,
      items: validItems.map((i) => ({
        ...i,
        productName: i.productName.trim(),
        unit: (i.unit || 'UN').trim().toUpperCase(),
        quantity: Number(i.quantity)
      })),
      companyId,
      createdAt: editingId
        ? authorizations.find((a) => a.id === editingId)?.createdAt || now
        : now,
      updatedAt: now
    };
  };

  const handleSave = async (printMode?: 'a4' | 'thermal') => {
    const record = buildRecord();
    if (!record) return;
    const printWin = printMode === 'a4' ? window.open('', '_blank') : null;
    setSaving(true);
    try {
      await db.upsert('purchase_authorizations', companyId, record);
      await loadAuthorizations();
      setIsModalOpen(false);
      if (printMode === 'a4') {
        await handlePrintA4(record, printWin);
      } else if (printMode === 'thermal') {
        handlePrintThermal(record);
      }
    } catch (err: any) {
      if (printWin && !printWin.closed) printWin.close();
      console.error('Erro ao salvar autorização:', err);
      const msg = err?.message || err?.error_description || 'Erro desconhecido';
      alert(`Erro ao salvar autorização de compra: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (auth: PurchaseAuthorization) => {
    if (!window.confirm(`Excluir a autorização ${auth.number}?`)) return;
    try {
      await db.delete('purchase_authorizations', companyId, auth.id);
      setAuthorizations((prev) => prev.filter((a) => a.id !== auth.id));
    } catch (err) {
      console.error('Erro ao excluir autorização:', err);
    }
  };

  const handlePrintA4 = async (auth: PurchaseAuthorization, targetWindow?: Window | null) => {
    await openPurchaseAuthorizationPdf(
      {
        authorization: auth,
        brand: fiscalConfig,
        companyName: company?.name,
        companyDocument: company?.document,
        companyPhone: company?.phone,
        companyCity: company?.city
      },
      targetWindow
    );
  };

  const handlePrintThermal = (auth: PurchaseAuthorization) => {
    openPurchaseAuthorizationThermalPrint({
      companyName: fiscalConfig?.nomeFantasia || fiscalConfig?.razaoSocial || company?.name || 'CBA Mineração',
      companyCity: fiscalConfig?.cidadeEmitente || company?.city,
      number: auth.number,
      date: auth.date,
      authorizedBuyer: auth.authorizedBuyer,
      authorizedBy: auth.authorizedBy,
      supplierName: auth.supplierName,
      notes: auth.notes,
      items: auth.items
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nº, comprador, autorizador ou produto..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
          />
        </div>
        <button
          onClick={openNewModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Autorização de Compra
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-500 text-sm">Carregando autorizações...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 text-sm">
          Nenhuma autorização de compra encontrada.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Nº</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Comprador Autorizado</th>
                  <th className="px-4 py-3">Autorizado Por</th>
                  <th className="px-4 py-3">Itens</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((auth) => (
                  <tr key={auth.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">
                      {auth.number}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {formatDateBR(auth.date)}
                    </td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-100 font-medium">
                      {auth.authorizedBuyer}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {auth.authorizedBy}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {auth.items?.length || 0} {auth.items?.length === 1 ? 'item' : 'itens'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handlePrintA4(auth)}
                          title="Imprimir A4 (Timbrado CBA)"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs font-medium"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          A4
                        </button>
                        <button
                          onClick={() => handlePrintThermal(auth)}
                          title="Imprimir Cupom Térmico (80mm)"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs font-medium"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          80mm
                        </button>
                        <button
                          onClick={() => openEditModal(auth)}
                          title="Editar"
                          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(auth)}
                          title="Excluir"
                          className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-4xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {editingId ? 'Editar Autorização de Compra' : 'Nova Autorização de Compra'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Número
                  </label>
                  <input
                    type="text"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Data
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Fornecedor (Opcional)
                  </label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Nome do fornecedor"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Comprador Autorizado *
                  </label>
                  <input
                    type="text"
                    value={authorizedBuyer}
                    onChange={(e) => setAuthorizedBuyer(e.target.value)}
                    placeholder="Quem vai realizar a compra"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Autorizado Por *
                  </label>
                  <input
                    type="text"
                    value={authorizedBy}
                    onChange={(e) => setAuthorizedBy(e.target.value)}
                    placeholder="Responsável pela autorização"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Produtos Autorizados (Editáveis)
                  </label>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Item
                  </button>
                </div>

                <datalist id="pa-catalog-options">
                  {catalogOptions.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>

                <div className="space-y-2">
                  {items.map((item, idx) => {
                    const canSaveToCatalog =
                      !item.productId && item.productName.trim().length > 0 && !savedCatalogIds[item.id];
                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-12 gap-2 items-center bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700"
                      >
                        <div className="col-span-12 sm:col-span-5">
                          <input
                            type="text"
                            list="pa-catalog-options"
                            value={item.productName}
                            onChange={(e) => updateItem(item.id, { productName: e.target.value })}
                            placeholder={`Produto #${idx + 1}`}
                            className="w-full px-2.5 py-1.5 text-sm rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                          />
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                            placeholder="UN"
                            className="w-full px-2.5 py-1.5 text-sm rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 uppercase text-center"
                          />
                        </div>
                        <div className="col-span-5 sm:col-span-2">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })}
                            className="w-full px-2.5 py-1.5 text-sm rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-right"
                          />
                        </div>
                        <div className="col-span-3 sm:col-span-3 flex items-center justify-end gap-1">
                          {canSaveToCatalog && (
                            <button
                              type="button"
                              onClick={() => handleSaveProductToCatalog(item)}
                              title="Salvar produto no catálogo para mapear evolução de custo"
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs font-medium"
                            >
                              <Save className="w-3.5 h-3.5" />
                              Catálogo
                            </button>
                          )}
                          {savedCatalogIds[item.id] && (
                            <span className="text-[11px] text-emerald-600 font-medium px-1.5">Salvo</span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeItemRow(item.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-500"
                            title="Remover item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Observações (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Instruções adicionais para a compra..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Salvar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave('thermal')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                Salvar e Cupom 80mm
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave('a4')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                Salvar e Imprimir A4
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
