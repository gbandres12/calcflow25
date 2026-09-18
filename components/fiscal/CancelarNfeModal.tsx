import React, { useState } from 'react';
import { SaleOrder, FiscalConfig } from '../../types';
import { fiscalService } from '../../services/fiscalService';
import { AlertTriangle, Ban } from 'lucide-react';

interface Props {
  order: SaleOrder;
  config: FiscalConfig;
  onClose: () => void;
  onCancelled: (updated: SaleOrder) => void;
}

export const CancelarNfeModal: React.FC<Props> = ({ order, config, onClose, onCancelled }) => {
  const [justificativa, setJustificativa] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (justificativa.trim().length < 15) {
      setError('A justificativa deve ter no mínimo 15 caracteres.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fiscalService.cancelarNFe(order.nfeId || order.nfeChave || '', justificativa, config);
      if (res.success) {
        onCancelled({
          ...order,
          nfeStatus: 'cancelada',
          notes: `${order.notes || ''} [NF-e CANCELADA: ${justificativa.trim()}]`.trim()
        });
      } else {
        setError(res.error || 'Cancelamento rejeitado pela SEFAZ.');
      }
    } catch (e: any) {
      setError(e.message || 'Erro ao cancelar a NF-e.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[220] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-rose-100 bg-rose-50 flex items-center gap-2 text-rose-900">
          <Ban size={18} />
          <div>
            <h3 className="text-sm font-black">Cancelar NF-e na SEFAZ</h3>
            <p className="text-[11px] font-medium text-rose-700">
              Nota Nº {order.nfeNumero || '—'} · {order.reference}
            </p>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-600 flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
            Permitido no prazo legal da SEFAZ (em geral até 24h após a autorização). A justificativa é obrigatória.
          </p>
          <textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            rows={3}
            placeholder="Ex: Cancelamento por erro de quantidade / destinatário na emissão."
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-rose-400"
          />
          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl">
              Voltar
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={confirm}
              className="px-4 py-2 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 rounded-xl disabled:opacity-50"
            >
              {loading ? 'Transmitindo…' : 'Confirmar cancelamento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
