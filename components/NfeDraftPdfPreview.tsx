import React, { useEffect, useRef, useState } from 'react';
import { Company, Customer, FiscalConfig, SaleOrder, SaleOrderLinkedNfe } from '../types';
import { buildNfeDraftPdf, draftPdfFileName } from '../services/domain/nfeDraftPdf';
import { Download, Printer, RefreshCw, FileX } from 'lucide-react';

interface NfeDraftPdfPreviewProps {
  order: SaleOrder;
  customer: Customer;
  config: FiscalConfig;
  company?: Company | null;
  linkedNfe?: SaleOrderLinkedNfe | null;
}

export const NfeDraftPdfPreview: React.FC<NfeDraftPdfPreviewProps> = ({
  order,
  customer,
  config,
  company,
  linkedNfe,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const blobRef = useRef<string | null>(null);

  const revoke = () => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    buildNfeDraftPdf({ order, customer, config, company, linkedNfe })
      .then((bytes) => {
        if (!alive) return;
        revoke();
        const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' });
        const next = URL.createObjectURL(blob);
        blobRef.current = next;
        setUrl(next);
      })
      .catch((e: any) => {
        if (!alive) return;
        revoke();
        setUrl(null);
        setError(e?.message || 'Não foi possível gerar a prévia em PDF.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      revoke();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    order.id,
    order.reference,
    order.total,
    order.nfeInfCpl,
    order.nfeNaturezaOperacao,
    order.items,
    order.frete,
    customer.id,
    customer.name,
    customer.document,
    config.proxNumeroNFe,
    config.serieNFe,
    linkedNfe?.id,
  ]);

  const handleDownload = () => {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = draftPdfFileName(order);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    if (!url) return;
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (win) {
      win.addEventListener('load', () => {
        try { win.print(); } catch { /* ignore */ }
      });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] font-black uppercase tracking-wider text-amber-800">
          Prévia PDF · rascunho sem valor fiscal
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePrint}
            disabled={!url}
            className="min-h-9 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <Printer size={13} /> Imprimir
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!url}
            className="min-h-9 px-3 py-1.5 bg-amber-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <Download size={13} /> Baixar PDF
          </button>
        </div>
      </div>
      <div className="min-h-[52dvh] sm:min-h-[58vh] bg-slate-200/70 rounded-2xl overflow-hidden border border-slate-200">
        {loading ? (
          <div className="h-full min-h-[52dvh] flex flex-col items-center justify-center gap-3 text-slate-600">
            <RefreshCw className="animate-spin" size={22} />
            <p className="text-sm font-bold">Gerando prévia em PDF…</p>
          </div>
        ) : url ? (
          <iframe title="Prévia PDF do rascunho da NF-e" src={url} className="w-full h-full min-h-[52dvh] sm:min-h-[58vh] border-0 bg-white" />
        ) : (
          <div className="h-full min-h-[52dvh] flex flex-col items-center justify-center gap-3 p-6 text-center">
            <FileX size={28} className="text-slate-400" />
            <p className="text-sm font-black text-slate-800">Prévia indisponível</p>
            <p className="text-xs font-medium text-slate-600">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};
