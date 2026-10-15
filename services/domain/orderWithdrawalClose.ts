import { SaleOrder, Transaction, TransactionStatus, TransactionType, Customer } from '../../types';
import { roundTons, sumTons } from './loadings';

export interface CloseWithdrawalsOptions {
  mode: 'adjust_to_withdrawn' | 'keep_contracted';
  operatorName?: string;
  reason?: string;
  closedAt?: string;
}

export interface CloseWithdrawalsResult {
  updatedOrder: SaleOrder;
  deltaQuantity: number; // Negativo se retirou menos do que contratou
  deltaMoney: number;    // Diferença em R$ do total do pedido
  updatedTransactions: Transaction[];
  deletedTransactionIds: string[];
}

export interface OverWithdrawalOptions {
  withdrawalQuantity: number;
  netWeight?: number;
  allowOverWithdrawal: boolean;
}

export interface OverWithdrawalAdjustmentResult {
  updatedOrder: SaleOrder;
  exceededQuantity: number; // Quantidade excedente além do saldo contratado
  additionalCost: number;   // Valor financeiro correspondente ao excedente
  newTransaction?: Transaction; // Nova parcela a receber referente ao excedente, se aplicável
}

/**
 * Encerra as retiradas de um pedido.
 * 
 * Se modo = 'adjust_to_withdrawn':
 *  - Ajusta a quantidade dos itens proporcionalmente ao total retirado.
 *  - Recalcula subtotal e total.
 *  - Ajusta as parcelas em aberto/pendentes do financeiro (NUNCA toca em pagamentos já confirmados/baixados no caixa).
 *  - Se as parcelas pendentes forem maiores que o corte, reduz ou cancela as últimas parcelas pendentes.
 * 
 * Se modo = 'keep_contracted':
 *  - Apenas marca withdrawalsClosed = true, mantendo as quantidades e valores originais do pedido.
 */
export function closeOrderWithdrawals(
  order: SaleOrder,
  transactions: Transaction[],
  options: CloseWithdrawalsOptions
): CloseWithdrawalsResult {
  const now = options.closedAt || new Date().toISOString();
  const withdrawals = order.withdrawals || [];
  const totalWithdrawn = sumTons(withdrawals.map(w => w.quantityWithdrawn));
  const totalContracted = sumTons((order.items || []).map(i => i.quantity));
  
  if (options.mode === 'keep_contracted' || totalWithdrawn >= totalContracted) {
    const updatedOrder: SaleOrder = {
      ...order,
      withdrawalsClosed: true,
      withdrawalsClosedAt: now,
      withdrawalsClosedBy: options.operatorName,
      withdrawalsClosedReason: options.reason || 'Retiradas dadas por encerradas pelo operador',
      notes: [
        order.notes || '',
        `[RETIRADAS ENCERRADAS] Total retirado: ${totalWithdrawn} t de ${totalContracted} t contratadas. Encerrado em ${now} por ${options.operatorName || 'Operador'}. Motivo: ${options.reason || 'Concluído'}`
      ].filter(Boolean).join('\n')
    };
    return {
      updatedOrder,
      deltaQuantity: 0,
      deltaMoney: 0,
      updatedTransactions: [],
      deletedTransactionIds: []
    };
  }

  // Modo: adjust_to_withdrawn
  // Reduz a quantidade dos itens proporcionalmente (ou ajusta o item principal)
  const ratio = totalContracted > 0 ? totalWithdrawn / totalContracted : 0;
  let accumulatedTons = 0;
  const newItems = (order.items || []).map((item, idx) => {
    const isLast = idx === (order.items || []).length - 1;
    const newQty = isLast
      ? roundTons(totalWithdrawn - accumulatedTons)
      : roundTons((item.quantity || 0) * ratio);
    accumulatedTons += newQty;
    const total = Number((newQty * (item.unitPrice || 0) - (item.discount || 0)).toFixed(2));
    return {
      ...item,
      quantity: Math.max(0, newQty),
      total: Math.max(0, total)
    };
  });

  const newSubtotal = Number(newItems.reduce((acc, it) => acc + (it.total || 0), 0).toFixed(2));
  const newTotal = Number(Math.max(0, newSubtotal - (order.discount || 0) + (order.shipping || 0)).toFixed(2));
  const deltaMoney = Number((newTotal - (order.total || 0)).toFixed(2)); // Negativo
  const deltaQuantity = roundTons(totalWithdrawn - totalContracted);       // Negativo

  // Ajusta financeiro de forma segura:
  // Parcelas CONFIRMADO / PAGO no caixa JAMAIS são alteradas.
  // Somente parcelas PENDENTE vinculadas a este pedido têm seu valor reduzido ou são excluídas.
  const orderTxs = transactions.filter(t => t.orderId === order.id && t.type === TransactionType.SALE);
  const updatedTransactions: Transaction[] = [];
  const deletedTransactionIds: string[] = [];

  let moneyToCut = Math.abs(deltaMoney);
  // Percorre as parcelas pendentes da última para a primeira
  const pendingTxs = orderTxs
    .filter(t => t.status === TransactionStatus.PENDENTE)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  for (const tx of pendingTxs) {
    if (moneyToCut <= 0.005) break;
    const currentAmount = Number(tx.amount || 0);
    if (currentAmount <= moneyToCut + 0.01) {
      // Exclui esta transação pendente inteira pois o corte cobre ela
      deletedTransactionIds.push(tx.id);
      moneyToCut -= currentAmount;
    } else {
      // Reduz o valor desta transação pendente
      const newAmount = Number((currentAmount - moneyToCut).toFixed(2));
      updatedTransactions.push({
        ...tx,
        amount: newAmount,
        notes: [
          tx.notes || '',
          `[AJUSTE RETIRADA] Valor reduzido de R$ ${currentAmount.toFixed(2)} para R$ ${newAmount.toFixed(2)} pelo fechamento de saldo de retiradas (${totalWithdrawn} t).`
        ].filter(Boolean).join(' ')
      });
      moneyToCut = 0;
    }
  }

  const updatedOrder: SaleOrder = {
    ...order,
    items: newItems,
    subtotal: newSubtotal,
    total: newTotal,
    withdrawalsClosed: true,
    withdrawalsClosedAt: now,
    withdrawalsClosedBy: options.operatorName,
    withdrawalsClosedReason: options.reason || 'Pedido ajustado e fechado conforme volume total retirado',
    notes: [
      order.notes || '',
      `[SALDO AJUSTADO E FECHADO] Pedido reajustado de ${totalContracted} t para ${totalWithdrawn} t (Total ajustado de R$ ${(order.total || 0).toFixed(2)} para R$ ${newTotal.toFixed(2)}). Encerrado por ${options.operatorName || 'Operador'} em ${now}. Motivo: ${options.reason || 'Cliente não retirará saldo restante'}`
    ].filter(Boolean).join('\n')
  };

  return {
    updatedOrder,
    deltaQuantity,
    deltaMoney,
    updatedTransactions,
    deletedTransactionIds
  };
}

/**
 * Ajusta o pedido quando uma retirada excede a quantidade contratada original.
 * Exemplo: comprou 8 t, carregou 8,42 t na balança.
 * 
 * - Aumenta a quantidade do item no pedido para acomodar a carga real.
 * - Recalcula total da venda.
 * - Adiciona o valor financeiro correspondente como uma transação pendente (a receber),
 *   sem interferir nos pagamentos que já entraram no caixa.
 */
export function adjustOrderForOverWithdrawal(
  order: SaleOrder,
  withdrawalQty: number,
  additionalQty: number,
  newTransactionId: string,
  today: string
): OverWithdrawalAdjustmentResult {
  const exceededQuantity = roundTons(additionalQty);
  if (exceededQuantity <= 0) {
    return {
      updatedOrder: order,
      exceededQuantity: 0,
      additionalCost: 0
    };
  }

  // Preço unitário do primeiro item (ou média ponderada)
  const mainItem = order.items?.[0];
  const unitPrice = mainItem?.unitPrice || 0;
  const additionalCost = Number((exceededQuantity * unitPrice).toFixed(2));

  // Ajusta a quantidade no item do pedido
  const updatedItems = (order.items || []).map((item, idx) => {
    if (idx === 0) {
      const newQty = roundTons((item.quantity || 0) + exceededQuantity);
      return {
        ...item,
        quantity: newQty,
        total: Number((newQty * (item.unitPrice || 0) - (item.discount || 0)).toFixed(2))
      };
    }
    return item;
  });

  const newSubtotal = Number(updatedItems.reduce((acc, it) => acc + (it.total || 0), 0).toFixed(2));
  const newTotal = Number(Math.max(0, newSubtotal - (order.discount || 0) + (order.shipping || 0)).toFixed(2));

  const updatedOrder: SaleOrder = {
    ...order,
    items: updatedItems,
    subtotal: newSubtotal,
    total: newTotal,
    allowOverWithdrawal: true,
    notes: [
      order.notes || '',
      `[CARGA EXCEDENTE REGISTRADA] Adicionado ${exceededQuantity} t ao pedido (+R$ ${additionalCost.toFixed(2)}) referente à pesagem/carregamento real.`
    ].filter(Boolean).join('\n')
  };

  let newTransaction: Transaction | undefined;
  if (!order.withoutFinance && additionalCost > 0) {
    newTransaction = {
      id: newTransactionId,
      companyId: order.companyId,
      accountId: '', // Pendente / A receber
      costCenterId: 'cc4',
      date: today,
      type: TransactionType.SALE,
      status: TransactionStatus.PENDENTE,
      description: `Diferença Carga Excedente #${order.reference} (+${exceededQuantity} t)`,
      category: 'Venda Calcário Moído Granel',
      amount: additionalCost,
      paidAmount: 0,
      customerId: order.customerId,
      orderId: order.id,
      payments: [],
      notes: `Lançamento automático de diferença de carga pesada a mais (+${exceededQuantity} t)`
    };
  }

  return {
    updatedOrder,
    exceededQuantity,
    additionalCost,
    newTransaction
  };
}
