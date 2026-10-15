import React, { useState } from 'react';
import { SaleOrder, Transaction } from '../types';
import { formatTons, sumTons, roundTons } from '../services/domain/loadings';
import { closeOrderWithdrawals, CloseWithdrawalsResult } from '../services/domain/orderWithdrawalClose';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { CheckCircle2, AlertTriangle, ShieldCheck, FileText, ArrowRight } from 'lucide-react';

interface CloseWithdrawalsModalProps {
  order: SaleOrder;
  transactions?: Transaction[];
  operatorName?: string;
  onConfirm: (result: CloseWithdrawalsResult) => void;
  onClose: () => void;
}

export const CloseWithdrawalsModal: React.FC<CloseWithdrawalsModalProps> = ({
  order,
  transactions = [],
  operatorName,
  onConfirm,
  onClose
}) => {
  const totalContracted = sumTons((order.items || []).map(i => i.quantity || 0));
  const totalWithdrawn = sumTons((order.withdrawals || []).map(w => w.quantityWithdrawn || 0));
  const leftoverQty = Math.max(0, roundTons(totalContracted - totalWithdrawn));

  const [mode, setMode] = useState<'adjust_to_withdrawn' | 'keep_contracted'>('adjust_to_withdrawn');
  const [reason, setReason] = useState('Cliente informou encerramento das retiradas / safra concluída');

  // Cálculo prévio do resultado com base na seleção
  const previewResult = closeOrderWithdrawals(order, transactions, {
    mode,
    operatorName,
    reason,
    closedAt: new Date().toISOString()
  });

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  const handleConfirm = () => {
    onConfirm(previewResult);
  };

  return (
    <Modal
      title="Encerrar Retiradas do Pedido"
      subtitle={`Pedido #${order.reference} · Total Contratado: ${formatTons(totalContracted)} t`}
      onClose={onClose}
      narrow
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white">
            <CheckCircle2 size={16} /> Confirmar Encerramento
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-slate-800">
        {/* Resumo da Balança */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
          <div>
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">Contratado</span>
            <span className="text-sm font-bold text-slate-700">{formatTons(totalContracted)} t</span>
          </div>
          <div>
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">Retirado Real</span>
            <span className="text-sm font-bold text-blue-600">{formatTons(totalWithdrawn)} t</span>
          </div>
          <div>
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">Sobra Não Retirada</span>
            <span className="text-sm font-black text-amber-600">{formatTons(leftoverQty)} t</span>
          </div>
        </div>

        {/* Escolha do Modo */}
        <div className="space-y-2">
          <label className="text-xs font-black uppercase text-slate-500 tracking-wider">Como deseja tratar a sobra?</label>
          
          <label className={`block p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${mode === 'adjust_to_withdrawn' ? 'bg-purple-50/50 border-purple-600' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="close_mode"
                checked={mode === 'adjust_to_withdrawn'}
                onChange={() => setMode('adjust_to_withdrawn')}
                className="mt-1 text-purple-600 focus:ring-purple-500"
              />
              <div className="space-y-1">
                <span className="font-black text-xs text-slate-900 block">
                  Ajustar pedido para o que foi realmente retirado ({formatTons(totalWithdrawn)} t)
                </span>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Recalcula o valor da venda para <strong className="text-slate-800">{formatBRL(previewResult.updatedOrder.total)}</strong>.
                  Devolve a sobra ({formatTons(leftoverQty)} t) ao estoque e desconta apenas das parcelas pendentes no financeiro. Pagamentos já confirmados no caixa não são alterados.
                </p>
              </div>
            </div>
          </label>

          <label className={`block p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${mode === 'keep_contracted' ? 'bg-purple-50/50 border-purple-600' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="close_mode"
                checked={mode === 'keep_contracted'}
                onChange={() => setMode('keep_contracted')}
                className="mt-1 text-purple-600 focus:ring-purple-500"
              />
              <div className="space-y-1">
                <span className="font-black text-xs text-slate-900 block">
                  Manter valor contratado original ({formatTons(totalContracted)} t = {formatBRL(order.total)})
                </span>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Apenas encerra a fila de carregamentos do pedido na balança e pátio, mantendo o contrato e faturamento originais intactos.
                </p>
              </div>
            </div>
          </label>
        </div>

        {/* Impacto Financeiro Exibido */}
        {mode === 'adjust_to_withdrawn' && previewResult.deltaMoney !== 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl space-y-1 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-amber-900">
              <AlertTriangle size={14} className="text-amber-600" />
              Impacto no financeiro:
            </div>
            <p className="text-amber-800 leading-relaxed">
              O total da venda diminuirá em <strong>{formatBRL(Math.abs(previewResult.deltaMoney))}</strong>.
              {previewResult.deletedTransactionIds.length > 0 && ` ${previewResult.deletedTransactionIds.length} parcela(s) a receber pendente(s) cancelada(s).`}
              {previewResult.updatedTransactions.length > 0 && ` ${previewResult.updatedTransactions.length} parcela(s) pendente(s) reduzida(s).`}
            </p>
          </div>
        )}

        {/* Motivo */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Motivo do Encerramento</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Ex: Cliente informou que encerrou aplicação"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs focus:border-purple-600"
          />
        </div>
      </div>
    </Modal>
  );
};
