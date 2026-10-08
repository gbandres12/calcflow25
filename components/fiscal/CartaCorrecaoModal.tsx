import React, { useState } from 'react';
import { SaleOrder, FiscalConfig, CartaCorrecaoEvento } from '../../types';
import { fiscalService } from '../../services/fiscalService';
import { FileEdit, AlertCircle, CheckCircle2, History, Sparkles } from 'lucide-react';
import { FlowSheet } from '../ui/FlowSheet';
import { useToast } from '../ui/Toast';

interface Props {
  order: SaleOrder;
  linkedNfeId?: string;
  config: FiscalConfig;
  onClose: () => void;
  onSuccess: (updated: SaleOrder) => void;
}

export const CartaCorrecaoModal: React.FC<Props> = ({
  order,
  linkedNfeId,
  config,
  onClose,
  onSuccess
}) => {
  const toast = useToast();
  const linkedNfe = linkedNfeId && order.nfes ? order.nfes.find((n) => n.id === linkedNfeId) : undefined;
  
  const nfeId = linkedNfe?.nfeId || order.nfeId || '';
  const nfeChave = linkedNfe?.nfeChave || order.nfeChave || '';
  const nfeNumero = linkedNfe?.nfeNumero || order.nfeNumero || '';
  const destNome = linkedNfe?.destinatarioNome || order.customerName || (order.nfePayload?.dest?.nome) || 'Destinatário';

  const [correcao, setCorrecao] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cartas de correção anteriores já registradas neste pedido/nota
  const existingCces: CartaCorrecaoEvento[] = (linkedNfe?.cartasCorrecao || order.cartasCorrecao || []);

  const handleApplyTemplate = (template: string) => {
    setCorrecao(template);
    setError(null);
  };

  const handleEnviar = async () => {
    const texto = correcao.trim();
    if (texto.length < 15) {
      setError('A carta de correção deve ter no mínimo 15 caracteres (Exigência legal SEFAZ).');
      return;
    }
    if (texto.length > 1000) {
      setError('A carta de correção deve ter no máximo 1000 caracteres (Exigência legal SEFAZ).');
      return;
    }
    if (!nfeId && !nfeChave) {
      setError('Identificador da NF-e não encontrado para envio à SEFAZ.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fiscalService.enviarCartaCorrecao(nfeId || nfeChave, texto, config);

      if (res.success) {
        const novoEvento: CartaCorrecaoEvento = {
          sequencial: existingCces.length + 1,
          correcao: texto,
          dataEvento: res.dataEvento || new Date().toISOString(),
          protocolo: res.protocolo,
          status: 'autorizada'
        };

        const updatedCartas = [...existingCces, novoEvento];

        let updatedOrder: SaleOrder = {
          ...order,
          cartasCorrecao: updatedCartas,
          notes: `${order.notes || ''} [CC-e #${novoEvento.sequencial}: ${texto}]`.trim()
        };

        if (linkedNfeId && order.nfes) {
          updatedOrder = {
            ...updatedOrder,
            nfes: order.nfes.map((n) =>
              n.id === linkedNfeId
                ? { ...n, cartasCorrecao: [...(n.cartasCorrecao || []), novoEvento] }
                : n
            )
          };
        }

        toast.push(`Carta de Correção transmitida e autorizada pela SEFAZ com sucesso!`, 'success');
        onSuccess(updatedOrder);
        onClose();
      } else {
        setError(res.error || 'A SEFAZ rejeitou o envio da carta de correção.');
      }
    } catch (e: any) {
      setError(e.message || 'Falha de comunicação ao transmitir a carta de correção.');
    } finally {
      setLoading(false);
    }
  };

  const charsCount = correcao.trim().length;

  return (
    <FlowSheet
      title="Carta de Correção Eletrônica (CC-e)"
      zIndexClass="z-[220]"
      onClose={onClose}
      subtitle={`NF-e Nº ${nfeNumero || '—'} · ${destNome}`}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 min-h-11 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading || charsCount < 15 || charsCount > 1000}
            onClick={handleEnviar}
            className="flex-1 min-h-11 text-xs font-black uppercase text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-all shadow-md shadow-purple-200 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {loading ? (
              <span>Transmitindo à SEFAZ…</span>
            ) : (
              <>
                <FileEdit size={14} />
                <span>Transmitir Carta de Correção</span>
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Aviso de regras legais SEFAZ */}
        <div className="p-3 bg-purple-50/80 border border-purple-100 rounded-2xl text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-purple-900">
            <AlertCircle size={15} className="text-purple-600 shrink-0" />
            <span>Regras Legais da SEFAZ (Ajuste SINIEF 07/05)</span>
          </div>
          <p className="text-slate-600 leading-relaxed text-[11px]">
            A <strong>CC-e</strong> serve para regularizar erros como <strong>CEP</strong>, endereço (sem alterar o destinatário), transportador, placa ou observações fiscais. 
            <span className="text-rose-700 font-semibold block mt-1">
              É proibido alterar: valores, alíquotas, impostos, data de emissão ou o emitente/destinatário completo.
            </span>
          </p>
        </div>

        {/* Chave da Nota e Destinatário */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-500 text-[10px] uppercase">Destinatário:</span>
            <span className="font-bold text-slate-800">{destNome}</span>
          </div>
          {nfeChave && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-500 text-[10px] uppercase">Chave:</span>
              <span className="font-mono text-slate-600 truncate max-w-[280px]" title={nfeChave}>{nfeChave}</span>
            </div>
          )}
        </div>

        {/* Modelos rápidos */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-black uppercase text-slate-500 flex items-center gap-1">
            <Sparkles size={12} className="text-amber-500" /> Modelos Rápidos de Correção:
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleApplyTemplate('Onde se lê CEP 68165-000, leia-se CEP 68143-000, permanecendo inalterados os demais dados.')}
              className="px-2.5 py-1 text-[11px] font-bold bg-white border border-slate-200 text-slate-700 hover:border-purple-300 hover:text-purple-700 rounded-lg transition-colors"
            >
              Corrigir CEP (68143-000)
            </button>
            <button
              type="button"
              onClick={() => handleApplyTemplate('Onde constam os dados de frete e transporte, retifica-se a placa do veículo para [PLACA], permanecendo os demais dados inalterados.')}
              className="px-2.5 py-1 text-[11px] font-bold bg-white border border-slate-200 text-slate-700 hover:border-purple-300 hover:text-purple-700 rounded-lg transition-colors"
            >
              Corrigir Placa / Veículo
            </button>
            <button
              type="button"
              onClick={() => handleApplyTemplate('Retifica-se as informações complementares de interesse do fisco: [INSERIR_TEXTO].')}
              className="px-2.5 py-1 text-[11px] font-bold bg-white border border-slate-200 text-slate-700 hover:border-purple-300 hover:text-purple-700 rounded-lg transition-colors"
            >
              Inf. Complementares
            </button>
          </div>
        </div>

        {/* Textarea */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <label className="font-bold text-slate-700">Texto da Correção:</label>
            <span className={`text-[11px] font-bold ${charsCount < 15 ? 'text-amber-600' : charsCount > 1000 ? 'text-rose-600' : 'text-slate-400'}`}>
              {charsCount} / 1000 caracteres {charsCount < 15 && `(mín. 15)`}
            </span>
          </div>
          <textarea
            value={correcao}
            onChange={(e) => {
              setCorrecao(e.target.value);
              if (error) setError(null);
            }}
            rows={4}
            placeholder="Descreva a correção detalhadamente (mínimo 15 caracteres). Ex: Onde se lê CEP 68165-000, leia-se CEP 68143-000."
            className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-none"
          />
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-xs">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Histórico de CC-es anteriores */}
        {existingCces.length > 0 && (
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex items-center gap-1.5 text-slate-600 text-xs font-bold">
              <History size={13} />
              <span>Cartas de Correção Anteriores ({existingCces.length}):</span>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {existingCces.map((cce, idx) => (
                <div key={idx} className="p-2 bg-slate-50 border border-slate-100 rounded-lg text-[11px] space-y-0.5">
                  <div className="flex items-center justify-between font-bold text-slate-700">
                    <span>Evento #{cce.sequencial || idx + 1}</span>
                    <span className="text-slate-400 font-normal">{new Date(cce.dataEvento).toLocaleString('pt-BR')}</span>
                  </div>
                  <p className="text-slate-600 font-medium italic">"{cce.correcao}"</p>
                  {cce.protocolo && (
                    <p className="text-[10px] text-slate-400">Protocolo SEFAZ: {cce.protocolo}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </FlowSheet>
  );
};
