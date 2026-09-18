import React, { useEffect, useRef, useState } from 'react';
import { SaleOrder, Customer, FiscalConfig, Company } from '../types';
import { fiscalService } from '../services/fiscalService';
import { commitLinkedNfeSync, overlayNfeFields, findLinkedNfe } from '../services/saleNfe';
import {
  X, Printer, Download, FileCheck, AlertTriangle, Ban, RefreshCw, FileX
} from 'lucide-react';

interface DanfeModalProps {
  order: SaleOrder;
  customer: Customer;
  config: FiscalConfig;
  company: Company;
  onClose: () => void;
  onOrderUpdated: (updatedOrder: SaleOrder) => void;
  linkedNfeId?: string;
}

const STATUS_LABEL: Record<string, string> = {
  autorizada: 'Autorizada',
  cancelada: 'Cancelada',
  rejeitada: 'Rejeitada',
  processando: 'Processando na SEFAZ',
  nao_emitida: 'Não emitida',
};

export const DanfeModal: React.FC<DanfeModalProps> = ({
  order,
  customer: _customer,
  config,
  company: _company,
  onClose,
  onOrderUpdated,
  linkedNfeId
}) => {
  const invoiceView = (() => {
    const linked = findLinkedNfe(order, linkedNfeId);
    return linked ? overlayNfeFields(order, linked) : order;
  })();
  const [current, setCurrent] = useState<SaleOrder>(invoiceView);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelJustificativa, setCancelJustificativa] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const blobRef = useRef<string | null>(null);

  const revokeBlob = () => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
  };

  const loadPdf = async (invoice: SaleOrder) => {
    const invoiceId = (invoice.nfeId || '').trim();
    const canPdf = invoice.nfeStatus === 'autorizada' || invoice.nfeStatus === 'cancelada';
    if (!invoiceId || !canPdf) {
      revokeBlob();
      setPdfUrl(null);
      if (invoice.nfeStatus === 'rejeitada') {
        setPdfError(invoice.nfeErro || 'A SEFAZ rejeitou a nota. Não há DANFE oficial para nota negada.');
      } else if (invoice.nfeStatus === 'processando') {
        setPdfError('A nota ainda está em processamento na SEFAZ. O DANFE sai assim que for autorizada.');
      } else if (!invoiceId) {
        setPdfError('Esta nota não tem o identificador da NotaAs. Atualize o status ou emita de novo.');
      } else {
        setPdfError(null);
      }
      return;
    }

    setLoadingPdf(true);
    setPdfError(null);
    const res = await fiscalService.baixarDanfePdf(invoiceId, { ...config, companyId: invoice.companyId || config.companyId });
    setLoadingPdf(false);
    if (res.ok && res.blob) {
      revokeBlob();
      const url = URL.createObjectURL(res.blob);
      blobRef.current = url;
      setPdfUrl(url);
    } else {
      revokeBlob();
      setPdfUrl(null);
      setPdfError(res.error || 'Não foi possível carregar o DANFE oficial.');
    }
  };

  const refreshFromSefaz = async (silent = false) => {
    if (!silent) setLoadingStatus(true);
    try {
      const updated = await fiscalService.sincronizarPedidoComSefaz(current, {
        ...config,
        companyId: current.companyId || config.companyId,
      });
      const committed = commitLinkedNfeSync(order, updated, linkedNfeId);
      const linked = findLinkedNfe(committed, linkedNfeId);
      const view = linked ? overlayNfeFields(committed, linked) : committed;
      setCurrent(view);
      onOrderUpdated(committed);
      await loadPdf(view);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    refreshFromSefaz(true);
    return () => revokeBlob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, order.nfeId, linkedNfeId]);

  const handlePrintDanfe = () => {
    if (!pdfUrl) return;
    const win = window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    if (win) {
      win.addEventListener('load', () => {
        try { win.print(); } catch {}
      });
    }
  };

  const handleDownloadPdf = () => {
    if (!pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `DANFE_${current.nfeNumero || current.nfeChave || current.reference}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadXml = async () => {
    const invoiceId = (current.nfeId || '').trim();
    if (!invoiceId) return;
    const xml = await fiscalService.baixarXmlNFe(
      invoiceId,
      { ...config, companyId: current.companyId || config.companyId },
      current.nfeStatus === 'cancelada' ? 'cancel' : 'emission'
    );
    if (!xml.ok || !xml.blob) {
      setPdfError(xml.error || 'Não foi possível baixar o XML autorizado.');
      return;
    }
    const url = URL.createObjectURL(xml.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NFe_${current.nfeChave || current.reference}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCancelNFe = async () => {
    if (cancelJustificativa.trim().length < 15) {
      setCancelError('A justificativa deve ter no mínimo 15 caracteres.');
      return;
    }
    setCancelLoading(true);
    setCancelError(null);
    try {
      const res = await fiscalService.cancelarNFe(current.nfeId || current.nfeChave || '', cancelJustificativa, config);
      if (res.success) {
        const updated = {
          ...current,
          nfeStatus: 'cancelada' as const,
        };
        const synced = await fiscalService.sincronizarPedidoComSefaz(updated, config);
        const committed = commitLinkedNfeSync(order, synced, linkedNfeId);
        const linked = findLinkedNfe(committed, linkedNfeId);
        const view = linked ? overlayNfeFields(committed, linked) : committed;
        setCurrent(view);
        onOrderUpdated(committed);
        setIsCanceling(false);
        await loadPdf(synced);
      } else {
        setCancelError(res.error || 'Erro ao cancelar NF-e.');
      }
    } catch (e: any) {
      setCancelError(e.message || 'Erro inesperado ao cancelar.');
    } finally {
      setCancelLoading(false);
    }
  };

  const status = current.nfeStatus || 'nao_emitida';
  const statusClass =
    status === 'autorizada' ? 'bg-emerald-100 text-emerald-700' :
    status === 'cancelada' ? 'bg-rose-100 text-rose-700' :
    status === 'rejeitada' ? 'bg-rose-100 text-rose-800' :
    'bg-amber-100 text-amber-700';

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden my-8 flex flex-col max-h-[92vh]">
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-lg shrink-0">
              <FileCheck size={24} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">DANFE oficial</h3>
                <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${statusClass}`}>
                  {STATUS_LABEL[status] || status}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium truncate">
                NF-e Nº <b>{current.nfeNumero || '—'}</b> | Série <b>{current.nfeSerie || '—'}</b>
                {current.nfeChave ? (
                  <> | Chave: <span className="font-mono">{current.nfeChave}</span></>
                ) : (
                  <> | Chave ainda não retornada pela SEFAZ</>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={() => refreshFromSefaz()}
              disabled={loadingStatus}
              className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loadingStatus ? 'animate-spin' : ''} /> Atualizar SEFAZ
            </button>
            <button
              onClick={handlePrintDanfe}
              disabled={!pdfUrl}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 shadow-md disabled:opacity-40"
            >
              <Printer size={16} /> Imprimir
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={!pdfUrl}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-md disabled:opacity-40"
            >
              <Download size={16} /> PDF
            </button>
            <button
              onClick={handleDownloadXml}
              disabled={!current.nfeId}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 disabled:opacity-40"
            >
              <Download size={16} /> XML
            </button>
            {status === 'autorizada' && (
              <button
                onClick={() => setIsCanceling(!isCanceling)}
                className="flex items-center gap-1.5 px-3 py-2.5 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold"
              >
                <Ban size={16} /> Cancelar NF-e
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl text-slate-400">
              <X size={20} />
            </button>
          </div>
        </div>

        {isCanceling && (
          <div className="p-6 bg-rose-50 border-b border-rose-200 space-y-3 shrink-0">
            <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
              <AlertTriangle size={18} /> Cancelamento de NF-e na SEFAZ
            </div>
            <textarea
              value={cancelJustificativa}
              onChange={(e) => setCancelJustificativa(e.target.value)}
              placeholder="Justificativa com no mínimo 15 caracteres."
              rows={2}
              className="w-full p-3 bg-white border border-rose-300 rounded-xl text-xs outline-none focus:border-rose-500"
            />
            {cancelError && <p className="text-xs text-rose-600 font-bold">{cancelError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsCanceling(false)} className="px-4 py-2 bg-white text-slate-600 rounded-xl text-xs font-bold border border-slate-200">
                Voltar
              </button>
              <button
                disabled={cancelLoading}
                onClick={handleCancelNFe}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {cancelLoading ? 'Transmitindo à SEFAZ...' : 'Confirmar Cancelamento'}
              </button>
            </div>
          </div>
        )}

        {status === 'rejeitada' && current.nfeErro && (
          <div className="px-6 py-3 bg-rose-50 border-b border-rose-100 text-sm text-rose-800 font-bold shrink-0">
            Rejeição SEFAZ: {current.nfeErro}
          </div>
        )}

        <div className="flex-1 min-h-[70vh] bg-slate-200/70">
          {loadingStatus || loadingPdf ? (
            <div className="h-full min-h-[70vh] flex flex-col items-center justify-center gap-3 text-slate-600">
              <RefreshCw className="animate-spin" size={28} />
              <p className="text-sm font-bold">{loadingStatus ? 'Consultando status real na SEFAZ…' : 'Carregando DANFE oficial…'}</p>
            </div>
          ) : pdfUrl ? (
            <iframe title="DANFE oficial" src={pdfUrl} className="w-full h-full min-h-[70vh] border-0 bg-white" />
          ) : (
            <div className="h-full min-h-[70vh] flex flex-col items-center justify-center gap-3 p-8 text-center">
              <FileX size={36} className="text-slate-400" />
              <p className="text-sm font-black text-slate-800">DANFE oficial indisponível</p>
              <p className="text-xs font-medium text-slate-600 max-w-md">{pdfError || 'O PDF da NotaAs ainda não está pronto.'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
