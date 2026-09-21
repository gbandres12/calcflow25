import React, { useEffect, useRef, useState } from 'react';
import { SaleOrder, Customer, FiscalConfig, Company } from '../types';
import { fiscalService } from '../services/fiscalService';
import { commitLinkedNfeSync, overlayLinkedNfeDocument, overlayNfeFields, findLinkedNfe } from '../services/saleNfe';
import { buildNfeDraftPdf, draftPdfFileName } from '../services/domain/nfeDraftPdf';
import {
  Printer, Download, AlertTriangle, Ban, RefreshCw, FileX, Copy
} from 'lucide-react';
import { FlowSheet } from './ui/FlowSheet';

interface DanfeModalProps {
  order: SaleOrder;
  customer: Customer;
  config: FiscalConfig;
  company: Company;
  onClose: () => void;
  onOrderUpdated: (updatedOrder: SaleOrder) => void;
  linkedNfeId?: string;
  onDuplicate?: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  autorizada: 'Autorizada',
  cancelada: 'Cancelada',
  rejeitada: 'Rejeitada',
  processando: 'Processando na SEFAZ',
  nao_emitida: 'Não emitida',
  rascunho: 'Rascunho',
};

export const DanfeModal: React.FC<DanfeModalProps> = ({
  order,
  customer,
  config,
  company,
  onClose,
  onOrderUpdated,
  linkedNfeId,
  onDuplicate
}) => {
  const invoiceView = (() => {
    const linked = findLinkedNfe(order, linkedNfeId);
    return linked ? overlayLinkedNfeDocument(order, linked) : order;
  })();
  const [current, setCurrent] = useState<SaleOrder>(invoiceView);
  const [loadingStatus, setLoadingStatus] = useState(invoiceView.nfeStatus !== 'rascunho');
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelJustificativa, setCancelJustificativa] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const blobRef = useRef<string | null>(null);
  const isDraft = (current.nfeStatus || invoiceView.nfeStatus) === 'rascunho';

  const revokeBlob = () => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
  };

  const loadPdf = async (invoice: SaleOrder) => {
    if (invoice.nfeStatus === 'rascunho') {
      setLoadingPdf(true);
      setPdfError(null);
      try {
        const bytes = await buildNfeDraftPdf({
          order: invoice,
          customer,
          config,
          company,
        });
        revokeBlob();
        const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        blobRef.current = url;
        setPdfUrl(url);
      } catch (e: any) {
        revokeBlob();
        setPdfUrl(null);
        setPdfError(e?.message || 'Não foi possível gerar a prévia em PDF.');
      } finally {
        setLoadingPdf(false);
      }
      return;
    }

    const invoiceId = (invoice.nfeId || '').trim();
    const canPdf = invoice.nfeStatus === 'autorizada' || invoice.nfeStatus === 'cancelada';
    if (!invoiceId || !canPdf) {
      revokeBlob();
      setPdfUrl(null);
      if (invoice.nfeStatus === 'rejeitada') {
        setPdfError(invoice.nfeErro || 'A SEFAZ rejeitou a nota. Não há DANFE oficial para nota negada.');
      } else if (invoice.nfeStatus === 'processando') {
        setPdfError(
          invoice.nfeErro
            ? `Não foi possível atualizar o status na NotaAs: ${invoice.nfeErro}`
            : 'A nota ainda está em processamento na SEFAZ. O DANFE sai assim que for autorizada.'
        );
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
    if (invoiceView.nfeStatus === 'rascunho') {
      setLoadingStatus(false);
      loadPdf(invoiceView);
      return () => revokeBlob();
    }
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
    link.download = isDraft
      ? draftPdfFileName(current)
      : `DANFE_${current.nfeNumero || current.nfeChave || current.reference}.pdf`;
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
    <FlowSheet
      title={isDraft ? 'Prévia do rascunho' : 'DANFE oficial'}
      wide
      zIndexClass="z-[200]"
      padded={false}
      onClose={onClose}
      subtitle={
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${statusClass}`}>
              {STATUS_LABEL[status] || status}
            </span>
            <span>NF-e Nº <b>{current.nfeNumero || config.proxNumeroNFe || '—'}</b> · Série <b>{current.nfeSerie || config.serieNFe || '—'}</b></span>
          </div>
          <p className="font-mono text-[10px] truncate">
            {isDraft
              ? 'Prévia interna · SEM VALOR FISCAL · sem chave de acesso'
              : (current.nfeChave || 'Chave ainda não retornada pela SEFAZ')}
          </p>
        </div>
      }
      footer={
        <div className="flex flex-wrap gap-2">
          {!isDraft && (
          <button
            type="button"
            onClick={() => refreshFromSefaz()}
            disabled={loadingStatus}
            className="flex-1 min-w-[7.5rem] min-h-11 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold disabled:opacity-50"
          >
            <RefreshCw size={14} className={loadingStatus ? 'animate-spin' : ''} /> Atualizar
          </button>
          )}
          <button
            type="button"
            onClick={handlePrintDanfe}
            disabled={!pdfUrl}
            className="flex-1 min-w-[7.5rem] min-h-11 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold disabled:opacity-40"
          >
            <Printer size={15} /> Imprimir
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={!pdfUrl}
            className="flex-1 min-w-[7.5rem] min-h-11 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold disabled:opacity-40"
          >
            <Download size={15} /> PDF
          </button>
          {!isDraft && (
          <button
            type="button"
            onClick={handleDownloadXml}
            disabled={!current.nfeId}
            className="flex-1 min-w-[7.5rem] min-h-11 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold disabled:opacity-40"
          >
            <Download size={15} /> XML
          </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              className="flex-1 min-w-[7.5rem] min-h-11 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-purple-200 text-purple-800 rounded-xl text-xs font-bold"
            >
              <Copy size={14} /> Duplicar
            </button>
          )}
          {status === 'autorizada' && (
            <button
              type="button"
              onClick={() => setIsCanceling(!isCanceling)}
              className="min-h-11 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-rose-600 border border-rose-200 bg-rose-50 rounded-xl text-xs font-bold"
            >
              <Ban size={15} /> Cancelar
            </button>
          )}
        </div>
      }
    >
      {isCanceling && (
        <div className="p-4 bg-rose-50 border-b border-rose-200 space-y-3">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
            <AlertTriangle size={16} /> Cancelamento na SEFAZ
          </div>
          <textarea
            value={cancelJustificativa}
            onChange={(e) => setCancelJustificativa(e.target.value)}
            placeholder="Justificativa com no mínimo 15 caracteres."
            rows={2}
            className="w-full p-3 bg-white border border-rose-300 rounded-xl text-sm outline-none"
          />
          {cancelError && <p className="text-xs text-rose-600 font-bold">{cancelError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsCanceling(false)} className="px-4 py-2.5 min-h-11 bg-white text-slate-600 rounded-xl text-xs font-bold border border-slate-200">
              Voltar
            </button>
            <button
              type="button"
              disabled={cancelLoading}
              onClick={handleCancelNFe}
              className="px-4 py-2.5 min-h-11 bg-rose-600 text-white rounded-xl text-xs font-bold disabled:opacity-50"
            >
              {cancelLoading ? 'Transmitindo…' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {status === 'rejeitada' && current.nfeErro && (
        <div className="px-4 py-3 bg-rose-50 border-b border-rose-100 text-sm text-rose-800 font-bold">
          Rejeição SEFAZ: {current.nfeErro}
        </div>
      )}

      <div className="min-h-[52dvh] sm:min-h-[62vh] bg-slate-200/70">
        {loadingStatus || loadingPdf ? (
          <div className="h-full min-h-[52dvh] flex flex-col items-center justify-center gap-3 text-slate-600 px-4">
            <RefreshCw className="animate-spin" size={26} />
            <p className="text-sm font-bold text-center">{loadingStatus ? 'Consultando status na SEFAZ…' : isDraft ? 'Gerando prévia em PDF…' : 'Carregando DANFE…'}</p>
          </div>
        ) : pdfUrl ? (
          <iframe title={isDraft ? 'Prévia PDF do rascunho da NF-e' : 'DANFE oficial'} src={pdfUrl} className="w-full h-full min-h-[52dvh] sm:min-h-[62vh] border-0 bg-white" />
        ) : (
          <div className="h-full min-h-[52dvh] flex flex-col items-center justify-center gap-3 p-6 text-center">
            <FileX size={32} className="text-slate-400" />
            <p className="text-sm font-black text-slate-800">{isDraft ? 'Prévia indisponível' : 'DANFE oficial indisponível'}</p>
            <p className="text-xs font-medium text-slate-600 max-w-md">{pdfError || (isDraft ? 'Não foi possível gerar o PDF do rascunho.' : 'O PDF da NotaAs ainda não está pronto.')}</p>
          </div>
        )}
      </div>
    </FlowSheet>
  );
};
