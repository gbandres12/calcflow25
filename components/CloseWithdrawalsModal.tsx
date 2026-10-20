import React, { useState } from 'react';
import { SaleOrder, Transaction } from '../types';
import { formatTons, sumTons, roundTons } from '../services/domain/loadings';
import { closeOrderWithdrawals, CloseWithdrawalsResult } from '../services/domain/orderWithdrawalClose';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { CheckCircle2, AlertTriangle, PlusCircle, Truck, Lock, Unlock } from 'lucide-react';

interface CloseWithdrawalsModalProps {
  order: SaleOrder;
  transactions?: Transaction[];
  operatorName?: string;
  initialAction?: 'close' | 'increase';
  onConfirm: (result: CloseWithdrawalsResult) => void;
  onClose: () => void;
}

export const CloseWithdrawalsModal: React.FC<CloseWithdrawalsModalProps> = ({
  order,
  transactions = [],
  operatorName,
  initialAction = 'close',
  onConfirm,
  onClose
}) => {
  const withdrawals = order.withdrawals || [];
  const totalContracted = sumTons((order.items || []).map(i => i.quantity || 0));
  const totalWithdrawn = sumTons(withdrawals.map(w => Number(w.quantityWithdrawn ?? w.netWeight ?? 0)));
  const diffQty = roundTons(totalWithdrawn - totalContracted); // negativo = retirou a menos, positivo = retirou a mais
  const leftoverQty = Math.max(0, roundTons(totalContracted - totalWithdrawn));
  const exceededQty = Math.max(0, roundTons(totalWithdrawn - totalContracted));
  const unitPrice = order.items?.[0]?.unitPrice || 0;

  const [mode, setMode] = useState<'adjust_to_withdrawn' | 'keep_contracted' | 'custom_quantity'>(
    initialAction === 'increase' ? 'custom_quantity' : 'adjust_to_withdrawn'
  );
  const [additionalTonsInput, setAdditionalTonsInput] = useState<string>(
    exceededQty > 0 ? String(exceededQty) : '10'
  );
  const [customTargetInput, setCustomTargetInput] = useState<string>(
    String(roundTons(Math.max(totalContracted, totalWithdrawn) + (initialAction === 'increase' ? 10 : 0)))
  );
  const [keepOpen, setKeepOpen] = useState<boolean>(initialAction === 'increase');
  const [reason, setReason] = useState(
    initialAction === 'increase'
      ? 'Aumento de pedido solicitado pelo cliente / ajuste de volume de calcário'
      : 'Encerramento do pedido mantendo histórico e valor real das retiradas'
  );

  const parsedCustomTarget = Math.max(0, roundTons(parseFloat(customTargetInput.replace(',', '.')) || 0));

  const handleAdditionalChange = (val: string) => {
    setAdditionalTonsInput(val);
    const add = parseFloat(val.replace(',', '.')) || 0;
    setCustomTargetInput(String(roundTons(totalContracted + add)));
  };

  const handleTargetChange = (val: string) => {
    setCustomTargetInput(val);
    const target = parseFloat(val.replace(',', '.')) || 0;
    setAdditionalTonsInput(String(roundTons(target - totalContracted)));
  };

  // Cálculo prévio do resultado com base na seleção
  const previewResult = closeOrderWithdrawals(order, transactions, {
    mode,
    targetQuantity: mode === 'custom_quantity' ? parsedCustomTarget : undefined,
    keepOpen: mode === 'custom_quantity' ? keepOpen : false,
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

  const isIncreasing = mode === 'custom_quantity' && keepOpen;

  return (
    <Modal
      title={isIncreasing ? 'Aumentar / Ajustar Pedido (Admin)' : 'Fechar / Encerrar Pedido e Retiradas'}
      subtitle={`Pedido #${order.reference} · ${order.customerName || 'Cliente'} · Preço: ${formatBRL(unitPrice)}/t`}
      onClose={onClose}
      narrow
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button
            onClick={handleConfirm}
            className={`flex-1 text-white ${isIncreasing ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-slate-800'}`}
          >
            <CheckCircle2 size={16} />
            {isIncreasing
              ? `Confirmar Ajuste (${formatTons(parsedCustomTarget)} t)`
              : `Confirmar Fechamento (${formatBRL(previewResult.updatedOrder.total)})`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-slate-800">
        {/* Resumo da Balança e Valores */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
          <div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Contratado Atual</span>
            <span className="text-sm font-bold text-slate-700">{formatTons(totalContracted)} t</span>
            <span className="text-[11px] text-slate-500 block">{formatBRL(order.total)}</span>
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Retirado Real ({withdrawals.length}x)</span>
            <span className="text-sm font-bold text-blue-600">{formatTons(totalWithdrawn)} t</span>
            <span className="text-[11px] font-bold text-blue-700 block">{formatBRL(totalWithdrawn * unitPrice)}</span>
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
              {diffQty > 0.001 ? 'Retirado a Mais' : 'Saldo Não Retirado'}
            </span>
            <span className={`text-sm font-black ${diffQty > 0.001 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {diffQty > 0.001 ? `+${formatTons(exceededQty)} t` : `${formatTons(leftoverQty)} t`}
            </span>
            <span className="text-[11px] text-slate-500 block">
              {diffQty > 0.001 ? `+${formatBRL(exceededQty * unitPrice)}` : `-${formatBRL(leftoverQty * unitPrice)}`}
            </span>
          </div>
        </div>

        {/* Histórico preservado das retiradas */}
        {withdrawals.length > 0 && (
          <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-2xl space-y-1.5">
            <div className="flex items-center justify-between text-xs font-black text-blue-900">
              <span className="flex items-center gap-1.5">
                <Truck size={14} className="text-blue-600" />
                Histórico de Retiradas Mantido ({withdrawals.length} {withdrawals.length === 1 ? 'viagem' : 'viagens'})
              </span>
              <span>Total: {formatTons(totalWithdrawn)} t</span>
            </div>
            <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
              {withdrawals.map((w, i) => {
                const qty = Number(w.quantityWithdrawn ?? w.netWeight ?? 0);
                return (
                  <div key={w.id || i} className="flex items-center justify-between text-[11px] text-slate-700 bg-white/80 px-2.5 py-1 rounded-lg border border-blue-100">
                    <span>
                      <strong>#{i + 1}</strong> · {w.date ? new Date(w.date).toLocaleDateString('pt-BR') : '-'} · Placa: <strong>{w.plateNumber || w.truckPlate || '-'}</strong> ({w.driverName || 'Motorista'})
                    </span>
                    <span className="font-black text-blue-700">
                      {formatTons(qty)} t ({formatBRL(qty * unitPrice)})
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Escolha do Modo */}
        <div className="space-y-2">
          <label className="text-xs font-black uppercase text-slate-500 tracking-wider">Escolha a ação desejada:</label>

          {/* Opção 1: Encerrar pelo total real retirado */}
          <label
            className={`block p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
              mode === 'adjust_to_withdrawn' ? 'bg-purple-50/50 border-purple-600' : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="close_mode"
                checked={mode === 'adjust_to_withdrawn'}
                onChange={() => {
                  setMode('adjust_to_withdrawn');
                  setKeepOpen(false);
                }}
                className="mt-1 text-purple-600 focus:ring-purple-500"
              />
              <div className="space-y-1 flex-1">
                <span className="font-black text-xs text-slate-900 block">
                  Encerrar pedido pelo que foi realmente retirado ({formatTons(totalWithdrawn)} t)
                </span>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Mantém todas as <strong>{withdrawals.length} retirada(s)</strong> no histórico e ajusta o valor final do pedido para{' '}
                  <strong className="text-slate-900">{formatBRL(totalWithdrawn * unitPrice)}</strong>.
                  {diffQty < -0.001 && (
                    <> Devolve a sobra não retirada ({formatTons(leftoverQty)} t) ao estoque e abate apenas das parcelas pendentes.</>
                  )}
                  {diffQty > 0.001 && (
                    <> Soma o excedente retirado (+{formatTons(exceededQty)} t) ao pedido e lança a diferença a receber.</>
                  )}
                </p>
              </div>
            </div>
          </label>

          {/* Opção 2: Aumentar / Definir Quantidade (Admin) */}
          <label
            className={`block p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
              mode === 'custom_quantity' ? 'bg-emerald-50/50 border-emerald-600' : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="close_mode"
                checked={mode === 'custom_quantity'}
                onChange={() => {
                  setMode('custom_quantity');
                  setKeepOpen(true);
                }}
                className="mt-1 text-emerald-600 focus:ring-emerald-500"
              />
              <div className="space-y-2 flex-1">
                <span className="font-black text-xs text-slate-900 flex items-center gap-1.5">
                  <PlusCircle size={14} className="text-emerald-600" />
                  Aumentar ou definir nova quantidade do pedido (Admin)
                </span>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Aumente a tonelagem do pedido para que o cliente possa retirar a mais (ou fixe o volume final desejado).
                </p>

                {mode === 'custom_quantity' && (
                  <div className="pt-2 space-y-2.5 border-t border-emerald-200/70" onClick={e => e.stopPropagation()}>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                          Adicionar (+ Toneladas)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={additionalTonsInput}
                          onChange={e => handleAdditionalChange(e.target.value)}
                          className="w-full p-2 bg-white border border-emerald-300 rounded-xl font-black text-xs text-emerald-800 outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                          Nova Quantidade Total (t)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={customTargetInput}
                          onChange={e => handleTargetChange(e.target.value)}
                          className="w-full p-2 bg-white border border-emerald-300 rounded-xl font-black text-xs text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setKeepOpen(true)}
                        className={`flex-1 py-2 px-2.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 border transition-all ${
                          keepOpen
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Unlock size={13} /> Manter Aberto p/ Retiradas
                      </button>
                      <button
                        type="button"
                        onClick={() => setKeepOpen(false)}
                        className={`flex-1 py-2 px-2.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 border transition-all ${
                          !keepOpen
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Lock size={13} /> Já Encerrar Pedido
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </label>

          {/* Opção 3: Manter valor contratado original */}
          <label
            className={`block p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
              mode === 'keep_contracted' ? 'bg-purple-50/50 border-purple-600' : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="close_mode"
                checked={mode === 'keep_contracted'}
                onChange={() => {
                  setMode('keep_contracted');
                  setKeepOpen(false);
                }}
                className="mt-1 text-purple-600 focus:ring-purple-500"
              />
              <div className="space-y-1 flex-1">
                <span className="font-black text-xs text-slate-900 block">
                  Encerrar mantendo o valor contratado atual ({formatTons(totalContracted)} t = {formatBRL(order.total)})
                </span>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Apenas encerra novas retiradas na balança mantendo o histórico de viagens e o valor contratado original sem alteração.
                </p>
              </div>
            </div>
          </label>
        </div>

        {/* Impacto Financeiro Exibido */}
        {previewResult.deltaMoney !== 0 && (
          <div
            className={`p-3 rounded-2xl space-y-1 text-xs border ${
              previewResult.deltaMoney > 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold">
              <AlertTriangle size={14} className={previewResult.deltaMoney > 0 ? 'text-emerald-600' : 'text-amber-600'} />
              Resumo do Ajuste ({previewResult.deltaQuantity >= 0 ? `+${formatTons(previewResult.deltaQuantity)}` : formatTons(previewResult.deltaQuantity)} t):
            </div>
            {previewResult.deltaMoney > 0 ? (
              <p className="leading-relaxed">
                O valor do pedido aumentará em <strong>+{formatBRL(previewResult.deltaMoney)}</strong> (novo total:{' '}
                <strong>{formatBRL(previewResult.updatedOrder.total)}</strong>).
                {!order.withoutFinance && ' Será gerada uma parcela complementar pendente para a diferença, mantendo intactos os pagamentos já realizados.'}
              </p>
            ) : (
              <p className="leading-relaxed">
                O valor do pedido será ajustado para <strong>{formatBRL(previewResult.updatedOrder.total)}</strong> (redução de{' '}
                <strong>{formatBRL(Math.abs(previewResult.deltaMoney))}</strong>).
                {previewResult.deletedTransactionIds.length > 0 && ` ${previewResult.deletedTransactionIds.length} parcela(s) pendente(s) cancelada(s).`}
                {previewResult.updatedTransactions.length > 0 && ` ${previewResult.updatedTransactions.length} parcela(s) pendente(s) ajustada(s).`}
                {' Pagamentos já recebidos no caixa são preservados.'}
              </p>
            )}
          </div>
        )}

        {/* Motivo / Observação */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Observação / Motivo</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Ex: Cliente encerrou retiradas / solicitou aumento de carga"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-xs focus:border-purple-600"
          />
        </div>
      </div>
    </Modal>
  );
};
