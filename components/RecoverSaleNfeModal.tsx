import React, { useMemo, useState } from 'react';
import { FileUp, Link2, Loader2, X } from 'lucide-react';
import { Customer, SaleOrder } from '../types';
import { ParsedNfDocument, parseNfeFileContent } from '../services/nfeDocumentParser';
import { attachParsedNfeToOrder, findBestOrderForNfe } from '../services/nfeRecover';
import { FlowSheet, FlowSection } from './ui/FlowSheet';

interface Props {
  orders: SaleOrder[];
  customers: Customer[];
  onClose: () => void;
  onRecovered: (order: SaleOrder) => Promise<void> | void;
}

export const RecoverSaleNfeModal: React.FC<Props> = ({ orders, customers, onClose, onRecovered }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [orderId, setOrderId] = useState('');
  const [parsed, setParsed] = useState<ParsedNfDocument | null>(null);
  const [chave, setChave] = useState('');
  const [numero, setNumero] = useState('');

  const selected = useMemo(() => orders.find((order) => order.id === orderId) || null, [orders, orderId]);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setFileName(file.name);
    try {
      const doc = await parseNfeFileContent(file);
      const matched = findBestOrderForNfe(orders, doc, customers);
      setParsed(doc);
      setChave(doc.accessKey || '');
      setNumero(doc.nfNumber || '');
      if (matched) setOrderId(matched.id);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível ler o XML/DANFE.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selected) {
      setError('Escolha o pedido da CBA para vincular esta nota.');
      return;
    }
    if (!parsed && !chave) {
      setError('Envie o XML da NF-e ou informe a chave de 44 dígitos.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const document = parsed || {
        source: 'text' as const,
        accessKey: chave.replace(/\D/g, ''),
        nfNumber: numero,
        items: []
      };
      const updated = attachParsedNfeToOrder(selected, document);
      await onRecovered(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível gravar o vínculo da NF-e.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FlowSheet title="Recuperar NF-e no pedido" subtitle="Vincule uma nota já autorizada pela SEFAZ ao pedido da CBA. Não reemita." onClose={onClose}>
      <FlowSection>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">XML ou DANFE</label>
        <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-slate-300 text-sm cursor-pointer hover:bg-slate-50">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
          {fileName || 'Enviar XML da nota da Cassia'}
          <input type="file" accept=".xml,.pdf,text/xml" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        </label>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <input
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            placeholder="Chave de 44 dígitos"
            className="px-3 py-2 rounded-xl border text-sm"
          />
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="Número da NF-e"
            className="px-3 py-2 rounded-xl border text-sm"
          />
        </div>
        <label className="block text-xs font-bold text-slate-500 uppercase mt-4 mb-2">Pedido</label>
        <select
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border text-sm"
        >
          <option value="">Selecione o pedido</option>
          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.reference} · {order.nfeNumero ? `NF ${order.nfeNumero}` : order.nfeStatus || 'sem NF'}
            </option>
          ))}
        </select>
        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded-xl border">
            <X size={14} className="inline mr-1" /> Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-xl bg-emerald-700 text-white font-bold disabled:opacity-50"
          >
            {saving ? 'Gravando…' : <><Link2 size={14} className="inline mr-1" /> Vincular no pedido</>}
          </button>
        </div>
      </FlowSection>
    </FlowSheet>
  );
};
