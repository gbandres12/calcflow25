import React, { useMemo, useState } from 'react';
import { Copy, Plus, Printer, Trash2, Truck, Zap } from 'lucide-react';
import { Company, StoreItem, TransferItem, TransferShipment, User } from '../types';
import { FlowSheet } from './ui/FlowSheet';
import {
  buildBlankQuickRomaneio,
  cloneTransferAsQuickRomaneio,
  frequentRomaneioItems,
  parseQuickRomaneioLines,
  recentRomaneioDrivers,
  recentRomaneioPlates,
  toTransferItem
} from '../services/quickRomaneio';

interface Props {
  transfers: TransferShipment[];
  storeItems: StoreItem[];
  currentUser?: User;
  company?: Company;
  source?: TransferShipment | null;
  onClose: () => void;
  onSave: (shipment: Omit<TransferShipment, 'id'>, print: boolean) => void;
}

export const QuickRomaneioModal: React.FC<Props> = ({
  transfers,
  storeItems,
  currentUser,
  source,
  onClose,
  onSave
}) => {
  const seed = source
    ? cloneTransferAsQuickRomaneio(source, transfers, currentUser)
    : buildBlankQuickRomaneio(transfers, currentUser);

  const [dateSent, setDateSent] = useState(seed.dateSent);
  const [driver, setDriver] = useState(seed.carrierOrDriver || '');
  const [plate, setPlate] = useState(seed.vehiclePlate || '');
  const [notes, setNotes] = useState(seed.notes || '');
  const [items, setItems] = useState<TransferItem[]>(seed.items || []);
  const [draftName, setDraftName] = useState('');
  const [draftQty, setDraftQty] = useState('1');
  const [draftUnit, setDraftUnit] = useState('UN');
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [cloneId, setCloneId] = useState(source?.id || '');
  const [error, setError] = useState('');

  const drivers = useMemo(() => recentRomaneioDrivers(transfers), [transfers]);
  const plates = useMemo(() => recentRomaneioPlates(transfers), [transfers]);
  const frequent = useMemo(() => frequentRomaneioItems(transfers), [transfers]);
  const recentTransfers = useMemo(
    () => transfers.filter((t) => t?.id && (t.items || []).length > 0).slice(0, 8),
    [transfers]
  );

  const addLine = (lineItems: TransferItem[]) => {
    setItems((prev) => [...prev, ...lineItems]);
  };

  const handleAddDraft = () => {
    const parsed = parseQuickRomaneioLines(
      `${draftQty} ${draftUnit} ${draftName}`.trim(),
      storeItems
    );
    if (!parsed.length || !draftName.trim()) return;
    addLine(parsed.map((line, idx) => toTransferItem(line, items.length + idx)));
    setDraftName('');
    setDraftQty('1');
    setDraftUnit('UN');
  };

  const handlePaste = () => {
    const parsed = parseQuickRomaneioLines(pasteText, storeItems);
    if (!parsed.length) {
      setError('Cole uma peça por linha, por exemplo: 10 Correia B-120');
      return;
    }
    addLine(parsed.map((line, idx) => toTransferItem(line, items.length + idx)));
    setPasteText('');
    setShowPaste(false);
    setError('');
  };

  const applyClone = (id: string) => {
    setCloneId(id);
    const found = transfers.find((t) => t.id === id);
    if (!found) return;
    const cloned = cloneTransferAsQuickRomaneio(found, transfers, currentUser);
    setDriver(cloned.carrierOrDriver || '');
    setPlate(cloned.vehiclePlate || '');
    setNotes(cloned.notes || '');
    setItems(cloned.items);
  };

  const handleSave = (print: boolean) => {
    if (items.length === 0) {
      setError('Inclua pelo menos uma peça ou insumo na carga.');
      return;
    }
    onSave({
      ...seed,
      dateSent,
      carrierOrDriver: driver.trim(),
      vehiclePlate: plate.trim().toUpperCase(),
      notes: notes.trim(),
      items
    }, print);
  };

  return (
    <FlowSheet
      wide
      zIndexClass="z-[160]"
      title="Romaneio rápido"
      subtitle="Santarém → Fazenda Matriz. Motorista, placa e peças — o resto já vem preenchido."
      onClose={onClose}
      footer={(
        <div className="flex flex-wrap items-center gap-2">
          {error && <p className="mr-auto text-xs font-medium text-rose-700">{error}</p>}
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => handleSave(false)}
            className="min-h-11 px-4 py-2.5 rounded-xl bg-white border border-[#0F5948] text-[#0F5948] text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Truck size={14} /> Só emitir
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            className="min-h-11 px-4 py-2.5 rounded-xl bg-[#0F5948] text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Printer size={14} /> Emitir e imprimir
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#D5E3DC] bg-[#F7F8F3] px-4 py-3 flex items-start gap-2.5">
          <Zap size={16} className="text-[#0F5948] mt-0.5 shrink-0" />
          <p className="text-xs text-[#36574E] font-medium leading-relaxed">
            Origem e destino ficam travados nesta rota. Use para a picape ou o caminhão que sai de Santarém hoje.
            {source?.code ? ` Cópia de ${source.code}.` : ''}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 block mb-1">Saída</label>
            <input
              type="date"
              value={dateSent}
              onChange={(e) => setDateSent(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#0F5948]"
            />
          </div>
          <div>
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 block mb-1">Motorista</label>
            <input
              list="quick-romaneio-drivers"
              value={driver}
              onChange={(e) => setDriver(e.target.value)}
              placeholder="Quem leva a carga"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#0F5948]"
            />
            <datalist id="quick-romaneio-drivers">
              {drivers.map((name) => <option key={name} value={name} />)}
            </datalist>
          </div>
          <div>
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 block mb-1">Placa</label>
            <input
              list="quick-romaneio-plates"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="OBX-8819"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-[#0F5948]"
            />
            <datalist id="quick-romaneio-plates">
              {plates.map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
        </div>

        {recentTransfers.length > 0 && (
          <div>
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 block mb-1">
              Copiar carga anterior
            </label>
            <div className="relative">
              <Copy size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={cloneId}
                onChange={(e) => applyClone(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#0F5948]"
              >
                <option value="">Selecionar uma remessa para repetir peças e veículo…</option>
                {recentTransfers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} · {(t.vehiclePlate || 'sem placa')} · {(t.items || []).length} item(ns)
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-black text-slate-800">Peças e insumos</p>
            <button
              type="button"
              onClick={() => setShowPaste((v) => !v)}
              className="text-xs font-bold text-[#0F5948]"
            >
              {showPaste ? 'Fechar cola rápida' : 'Colar lista'}
            </button>
          </div>

          {showPaste && (
            <div className="space-y-2">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={4}
                placeholder={'10 Correia B-120\n2 UN Óleo 68\nGraxa x 5 kg'}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-[#0F5948]"
              />
              <button
                type="button"
                onClick={handlePaste}
                className="px-3 py-2 rounded-xl bg-[#0F5948] text-white text-xs font-bold"
              >
                Incluir linhas
              </button>
            </div>
          )}

          {frequent.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {frequent.map((line) => (
                <button
                  key={line.productName}
                  type="button"
                  onClick={() => addLine([toTransferItem({ ...line, quantitySent: 1 }, items.length)])}
                  className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:border-[#0F5948] hover:text-[#0F5948]"
                >
                  + {line.productName}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-[1fr_4.5rem_4rem_auto] gap-2">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddDraft();
                }
              }}
              placeholder="Nome da peça"
              list="quick-romaneio-store"
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#0F5948]"
            />
            <datalist id="quick-romaneio-store">
              {storeItems.slice(0, 80).map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={draftQty}
              onChange={(e) => setDraftQty(e.target.value)}
              className="px-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#0F5948]"
            />
            <input
              value={draftUnit}
              onChange={(e) => setDraftUnit(e.target.value)}
              className="px-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase text-center outline-none focus:ring-2 focus:ring-[#0F5948]"
            />
            <button
              type="button"
              onClick={handleAddDraft}
              className="min-h-11 px-3 rounded-xl bg-[#0F5948] text-white text-xs font-bold inline-flex items-center justify-center gap-1"
            >
              <Plus size={14} />
            </button>
          </div>

          {items.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-2xl">
              Digite a peça e Enter, ou cole a lista da compra de Santarém.
            </p>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 font-bold">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-center w-24">Qtde</th>
                    <th className="px-3 py-2 text-center w-16">Un.</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <input
                          value={item.productName}
                          onChange={(e) => setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, productName: e.target.value } : it))}
                          className="w-full bg-transparent font-bold text-slate-800 outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.quantitySent}
                          onChange={(e) => setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, quantitySent: parseFloat(e.target.value) || 0 } : it))}
                          className="w-full text-center font-black bg-slate-50 border border-slate-200 rounded-lg py-1 outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 text-center font-mono">{item.unit}</td>
                      <td className="px-1 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((it) => it.id !== item.id))}
                          className="p-1 text-slate-500 hover:text-rose-600"
                          aria-label={`Remover ${item.productName}`}
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

        <div>
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 block mb-1">Observação (opcional)</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: levar com cuidado, deixar no almoxarifado da britagem"
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-[#0F5948]"
          />
        </div>
      </div>
    </FlowSheet>
  );
};

export default QuickRomaneioModal;
