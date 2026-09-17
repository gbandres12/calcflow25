import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileUp, Loader2, Truck, X } from 'lucide-react';
import { parseNfeFileContent, ParsedNfDocument } from '../services/nfeDocumentParser';
import { isMineralNcm, matchStoreItem } from '../services/storeItemMatch';
import { nextTransferCode } from '../services/ids';
import { Company, StoreItem, StoreItemCategory, TransferItem, TransferShipment, User } from '../types';

const CATEGORIES: StoreItemCategory[] = ['Peças', 'Lubrificantes', 'EPI', 'Ferramentas', 'Insumos', 'Outros'];

type ReviewRow = TransferItem & { mineral?: boolean; matchLabel?: string };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  storeItems: StoreItem[];
  transfers: TransferShipment[];
  currentUser?: User;
  company?: Company;
  onApply: (shipment: Omit<TransferShipment, 'id'>) => void;
}

const formatBRL = (val?: number) =>
  (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const digits = (value?: string) => (value || '').replace(/\D/g, '');

export const NfImportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  storeItems,
  transfers,
  currentUser,
  company,
  onApply
}) => {
  const [parsed, setParsed] = useState<ParsedNfDocument | null>(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [driver, setDriver] = useState('');
  const [plate, setPlate] = useState('');
  const [dateSent, setDateSent] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!isOpen) {
      setParsed(null);
      setError('');
      setFormError('');
      setLoading(false);
      setFileName('');
      setRows([]);
      setDriver('');
      setPlate('');
      setDateSent(new Date().toISOString().slice(0, 10));
    }
  }, [isOpen]);

  const destMismatch = useMemo(() => {
    const companyCnpj = digits(company?.cnpj || company?.document);
    const dest = digits(parsed?.destDocument);
    if (!companyCnpj || !dest) return false;
    return companyCnpj !== dest;
  }, [company, parsed]);

  const selected = rows.filter((row) => row.included !== false);
  const pdfBlocked = parsed?.source === 'pdf' && (!parsed.items.length || !parsed.accessKey);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    setError('');
    setFormError('');
    setFileName(file.name);
    try {
      const doc = await parseNfeFileContent(file);
      setParsed(doc);
      setDriver(doc.carrierName || '');
      setPlate((doc.vehiclePlate || '').toUpperCase());
      if (doc.issuedAt) setDateSent(doc.issuedAt.slice(0, 10));

      if (doc.source !== 'xml' && (!doc.items.length || !doc.accessKey)) {
        setError('O PDF não trouxe itens ou a chave da NF. Envie o XML da mesma nota.');
        setRows([]);
        return;
      }
      if (!doc.items.length) {
        setError('Arquivo lido, mas os itens não vieram claros. Prefira o XML da NF-e.');
        setRows([]);
        return;
      }

      setRows(doc.items.map((it, idx) => {
        const matched = matchStoreItem(storeItems, {
          cProd: it.cProd,
          ncm: it.ncm,
          name: it.productName,
          supplierCnpj: doc.supplierDocument
        });
        return {
          id: `nf-${Date.now()}-${idx}`,
          productId: matched?.id,
          productName: it.productName,
          category: matched?.category || it.category,
          quantitySent: it.quantitySent,
          quantityReceived: 0,
          unit: it.unit || matched?.unit || 'UN',
          unitCost: it.unitCost || undefined,
          totalCost: it.totalCost || undefined,
          nfCompraNumber: doc.nfNumber,
          supplier: doc.supplier,
          conferido: false,
          cProd: it.cProd,
          ncm: it.ncm,
          cfop: it.cfop,
          infAdProd: it.infAdProd,
          included: true,
          mineral: isMineralNcm(it.ncm),
          matchLabel: matched ? `Almoxarifado: ${matched.name}` : 'Cadastrar na fazenda na conferência'
        };
      }));
    } catch {
      setError('Não foi possível ler esse arquivo.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (id: string, patch: Partial<ReviewRow>) => {
    setRows((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, ...patch };
      if (patch.quantitySent != null || patch.unitCost != null) {
        const qty = Number(next.quantitySent || 0);
        const cost = Number(next.unitCost || 0);
        next.totalCost = qty * cost;
      }
      return next;
    }));
  };

  const linkStore = (id: string, storeId: string) => {
    const found = storeItems.find((item) => item.id === storeId);
    updateRow(id, {
      productId: found?.id,
      category: found?.category || undefined,
      unit: found?.unit || undefined,
      matchLabel: found ? `Almoxarifado: ${found.name}` : 'Cadastrar na fazenda na conferência'
    });
  };

  const apply = () => {
    if (!parsed || !selected.length || pdfBlocked) return;
    if (!driver.trim() || !plate.trim()) {
      setFormError('Informe motorista e placa antes de gerar a remessa.');
      return;
    }
    setFormError('');
    const notes = [
      parsed.nfNumber ? `NF ${parsed.nfNumber}${parsed.series ? `/${parsed.series}` : ''}` : '',
      parsed.supplier ? `Fornecedor: ${parsed.supplier}` : '',
      parsed.accessKey ? `Chave: ${parsed.accessKey}` : '',
      fileName ? `Arquivo: ${fileName}` : ''
    ].filter(Boolean).join(' · ');

    onApply({
      code: nextTransferCode(transfers),
      originLocation: 'Polo de Compras Santarém (Av. Mendonça Furtado)',
      destinationLocation: 'Fazenda Usina Matriz (Zona Rural / Rodovia)',
      dateSent,
      sentBy: currentUser?.name ? `${currentUser.name} (Compras Santarém)` : 'Compras / Expedição Santarém',
      carrierOrDriver: driver.trim(),
      vehiclePlate: plate.trim().toUpperCase(),
      notes,
      items: selected.map(({ mineral, matchLabel, included, ...item }) => ({
        ...item,
        included: true,
        conferido: false,
        quantityReceived: 0
      })),
      status: 'EM_TRANSITO',
      stockIntegrated: false,
      createdAt: new Date().toISOString(),
      nfeChave: parsed.accessKey,
      nfeNumero: parsed.nfNumber,
      nfeSerie: parsed.series,
      nfeXml: parsed.rawXml,
      nfeXmlRef: parsed.accessKey || fileName,
      nfeFileName: fileName,
      supplierCnpj: parsed.supplierDocument,
      supplierName: parsed.supplier
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[220] bg-[#0F5948]/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border border-[#D5E3DC] max-h-[92vh] flex flex-col">
        <header className="px-5 sm:px-6 py-4 border-b border-[#D5E3DC] bg-[#F7F8F3] flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[#0F5948]">Importar NF de Santarém</h3>
            <p className="text-xs text-slate-600">
              XML da SEFAZ primeiro. PDF só como fallback. A remessa vai para o almoxarifado da fazenda, não para o catálogo de calcário.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white text-slate-500" aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#1B6B58]/30 rounded-xl py-7 cursor-pointer hover:border-[#0F5948] bg-[#F7F8F3]">
            {loading ? <Loader2 className="animate-spin text-[#0F5948]" /> : <FileUp className="text-[#0F5948]" />}
            <span className="text-sm font-semibold text-[#0F5948]">Enviar XML da NF-e</span>
            <span className="text-[11px] text-slate-500">{fileName || 'Preferir .xml · PDF só se o XML não estiver disponível'}</span>
            <input
              type="file"
              accept=".xml,.pdf,application/xml,application/pdf,text/xml"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>

          {(error || parsed?.warnings?.[0]) && (
            <p className="text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error || parsed?.warnings?.[0]}
            </p>
          )}

          {destMismatch && (
            <p className="text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              O destinatário da nota ({parsed?.destName || parsed?.destDocument}) não bate com o CNPJ da empresa. Confira se a NF é da CBA.
            </p>
          )}

          {parsed && (
            <div className="border border-[#D5E3DC] rounded-xl p-4 space-y-3 bg-white">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span><strong className="text-[#0F5948]">NF</strong> {parsed.nfNumber || '—'}{parsed.series ? ` / série ${parsed.series}` : ''}</span>
                <span><strong className="text-[#0F5948]">Emitente</strong> {parsed.supplier || '—'}</span>
                <span className="font-mono break-all"><strong className="text-[#0F5948] font-sans">Chave</strong> {parsed.accessKey || '—'}</span>
                {parsed.vNF != null && <span><strong className="text-[#0F5948]">Total</strong> {formatBRL(parsed.vNF)}</span>}
                <span>{parsed.items.length} item(ns) · origem {parsed.source === 'xml' ? 'XML' : 'PDF'}</span>
              </div>

              <div className="overflow-x-auto max-h-64 border border-slate-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-[#F7F8F3] text-[#0F5948]">
                    <tr>
                      <th className="p-2 text-left">Incluir</th>
                      <th className="p-2 text-left">Item</th>
                      <th className="p-2 text-left">Qtde</th>
                      <th className="p-2 text-left">Un.</th>
                      <th className="p-2 text-left">Categoria</th>
                      <th className="p-2 text-left">Vínculo no almoxarifado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100 align-top">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={row.included !== false}
                            onChange={(e) => updateRow(row.id, { included: e.target.checked })}
                          />
                        </td>
                        <td className="p-2">
                          <p className="font-medium text-slate-800">{row.productName}</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {row.cProd ? `cProd ${row.cProd}` : ''}{row.ncm ? ` · NCM ${row.ncm}` : ''}
                          </p>
                          {row.mineral && (
                            <p className="text-[10px] text-amber-800 mt-1">NCM de minério. Esta compra Santarém → fazenda segue como suprimento, não como calcário de venda.</p>
                          )}
                        </td>
                        <td className="p-2 w-20">
                          <input
                            type="number"
                            min={0}
                            step="0.001"
                            value={row.quantitySent}
                            onChange={(e) => updateRow(row.id, { quantitySent: Number(e.target.value) })}
                            className="w-20 border border-slate-200 rounded-lg px-2 py-1"
                          />
                        </td>
                        <td className="p-2 w-16">
                          <input
                            value={row.unit}
                            onChange={(e) => updateRow(row.id, { unit: e.target.value.toUpperCase() })}
                            className="w-16 border border-slate-200 rounded-lg px-2 py-1 uppercase"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={row.category || 'Peças'}
                            onChange={(e) => updateRow(row.id, { category: e.target.value as StoreItemCategory })}
                            className="border border-slate-200 rounded-lg px-2 py-1"
                          >
                            {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                          </select>
                        </td>
                        <td className="p-2">
                          <select
                            value={row.productId || ''}
                            onChange={(e) => linkStore(row.id, e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1"
                          >
                            <option value="">Cadastrar na fazenda na conferência</option>
                            {storeItems.map((item) => (
                              <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                          </select>
                          <p className="text-[10px] text-slate-500 mt-1">{row.matchLabel}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 block mb-1">Motorista *</label>
                  <input
                    value={driver}
                    onChange={(e) => setDriver(e.target.value)}
                    placeholder="Nome do motorista"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 block mb-1">Placa *</label>
                  <input
                    value={plate}
                    onChange={(e) => setPlate(e.target.value.toUpperCase())}
                    placeholder="QDA-4E90"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm uppercase"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 block mb-1">Saída de Santarém</label>
                  <input
                    type="date"
                    value={dateSent}
                    onChange={(e) => setDateSent(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {formError && (
                <p className="text-xs font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {formError}
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="px-5 sm:px-6 py-4 border-t border-[#D5E3DC] bg-[#F7F8F3] flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-white">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!selected.length || pdfBlocked || loading}
            onClick={apply}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F5948] hover:bg-[#1B6B58] text-white text-xs font-semibold disabled:opacity-40"
          >
            <Truck size={14} />
            Gerar remessa em trânsito
          </button>
        </footer>
      </div>
    </div>
  );
};

export default NfImportModal;
