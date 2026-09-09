import React, { useState } from 'react';
import { FileUp, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { parseNfeFileContent, ParsedNfDocument, ParsedNfItem } from '../services/nfeDocumentParser';
import { TransferItem } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApply: (items: TransferItem[], meta: { nfNumber?: string; supplier?: string; accessKey?: string; notes?: string }) => void;
}

export const NfImportModal: React.FC<Props> = ({ isOpen, onClose, onApply }) => {
  const [parsed, setParsed] = useState<ParsedNfDocument | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');

  if (!isOpen) return null;

  const handleFile = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    setError('');
    setFileName(file.name);
    try {
      const doc = await parseNfeFileContent(file);
      setParsed(doc);
      if (!doc.items.length) {
        setError('Arquivo lido, mas os itens não vieram claros. Prefira o XML da NF-e (mais confiável que o PDF).');
      }
    } catch {
      setError('Não foi possível ler esse arquivo.');
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!parsed?.items.length) return;
    const items: TransferItem[] = parsed.items.map((it: ParsedNfItem, idx) => ({
      id: `nf-${Date.now()}-${idx}`,
      productName: it.productName,
      category: it.category,
      quantitySent: it.quantitySent,
      quantityReceived: 0,
      unit: it.unit || 'UN',
      unitCost: it.unitCost || undefined,
      totalCost: it.totalCost || undefined,
      nfCompraNumber: parsed.nfNumber,
      supplier: parsed.supplier,
      conferido: false
    }));
    onApply(items, {
      nfNumber: parsed.nfNumber,
      supplier: parsed.supplier,
      accessKey: parsed.accessKey,
      notes: [
        parsed.nfNumber ? `NF ${parsed.nfNumber}` : '',
        parsed.supplier ? `Fornecedor: ${parsed.supplier}` : '',
        parsed.accessKey ? `Chave: ${parsed.accessKey}` : '',
        fileName ? `Arquivo: ${fileName}` : ''
      ].filter(Boolean).join(' · ')
    });
    setParsed(null);
    setFileName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[220] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden">
        <header className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Importar NF-e da compra</h3>
            <p className="text-xs text-slate-500">XML da SEFAZ preenche a remessa. PDF do DANFE também é aceito.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </header>
        <div className="p-6 space-y-4">
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-8 cursor-pointer hover:border-blue-400">
            {loading ? <Loader2 className="animate-spin text-blue-600" /> : <FileUp className="text-blue-600" />}
            <span className="text-sm font-semibold text-slate-700">Enviar XML ou PDF da nota</span>
            <span className="text-[11px] text-slate-400">{fileName || 'nfe.xml · danfe.pdf'}</span>
            <input type="file" accept=".xml,.pdf,application/xml,application/pdf,text/xml" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>
          {error && (
            <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}
          {parsed && (
            <div className="border border-slate-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-600">NF {parsed.nfNumber || '—'} · {parsed.supplier || 'Fornecedor não lido'} · {parsed.items.length} item(ns)</p>
              <div className="max-h-48 overflow-auto text-xs">
                {parsed.items.map((it, i) => (
                  <div key={i} className="flex justify-between py-1 border-b border-slate-100 gap-3">
                    <span className="font-medium text-slate-700 truncate">{it.productName}</span>
                    <span className="font-mono text-slate-500 shrink-0">{it.quantitySent} {it.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <footer className="px-6 py-4 border-t flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500">Cancelar</button>
          <button type="button" disabled={!parsed?.items.length} onClick={apply} className="px-4 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-semibold disabled:opacity-40">
            <CheckCircle2 size={14} className="inline mr-1" /> Preencher remessa
          </button>
        </footer>
      </div>
    </div>
  );
};

export default NfImportModal;
