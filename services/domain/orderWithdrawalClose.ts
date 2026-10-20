import { SaleOrder, Transaction, TransactionStatus, TransactionType, Customer } from '../../types';
import { roundTons, sumTons } from './loadings';

export interface CloseWithdrawalsOptions {
  mode: 'adjust_to_withdrawn' | 'keep_contracted' | 'custom_quantity';
  /** Quantidade alvo (t) quando mode === 'custom_quantity' (ex.: Admin aumentando o pedido). */
  targetQuantity?: number;
  /** Se true, mantém o pedido aberto para novas retiradas após ajustar a quantidade. */
  keepOpen?: boolean;
  operatorName?: string;
  reason?: string;
  closedAt?: string;
  newTransactionId?: string;
  today?: string;
}

export interface CloseWithdrawalsResult {
  updatedOrder: SaleOrder;
  deltaQuantity: number; // Negativo se reduziu, positivo se aumentou
  deltaMoney: number;    // Diferença em R$ do total do pedido (negativo ou positivo)
  updatedTransactions: Transaction[];
  deletedTransactionIds: string[];
  newTransaction?: Transaction;
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
 * Encerra as retiradas de um pedido ou ajusta sua quantidade contratada (Admin).
 * 
 * Se modo = 'adjust_to_withdrawn':
 *  - Ajusta a quantidade dos itens proporcionalmente ao total retirado (seja a menos ou a mais do que o contratado inicial).
 *  - Recalcula subtotal e total.
 *  - Se retirou a menos: reduz/cancela apenas parcelas PENDENTE (ou saldo aberto de PARCIAL), jamais tocando no que já foi pago.
 *  - Se retirou a mais: cria uma parcela PENDENTE complementar para a diferença (+R$).
 * 
 * Se modo = 'custom_quantity':
 *  - Ajusta a quantidade do pedido para `options.targetQuantity` (permitindo ao Admin aumentar ou ajustar o pedido).
 *  - Se `options.keepOpen` for true, mantém `withdrawalsClosed = false` para continuar retirando.
 * 
 * Se modo = 'keep_contracted':
 *  - Apenas marca withdrawalsClosed = true, mantendo as quantidades e valores contratados do pedido.
 */
export function closeOrderWithdrawals(
  order: SaleOrder,
  transactions: Transaction[],
  options: CloseWithdrawalsOptions
): CloseWithdrawalsResult {
  const now = options.closedAt || new Date().toISOString();
  const todayStr = options.today || now.split('T')[0];
  const withdrawals = order.withdrawals || [];
  const totalWithdrawn = sumTons(withdrawals.map(w => Number(w.quantityWithdrawn ?? w.netWeight ?? 0)));
  const totalContracted = sumTons((order.items || []).map(i => i.quantity));
  const shouldClose = !options.keepOpen;

  const targetQty =
    options.mode === 'custom_quantity'
      ? roundTons(Math.max(0, Number(options.targetQuantity ?? totalContracted)))
      : options.mode === 'adjust_to_withdrawn'
        ? totalWithdrawn
        : totalContracted;

  // Caso não haja mudança de quantidade (keep_contracted ou targetQty === totalContracted)
  if (options.mode === 'keep_contracted' || Math.abs(targetQty - totalContracted) < 0.001) {
    const updatedOrder: SaleOrder = {
      ...order,
      withdrawalsClosed: shouldClose,
      withdrawalsClosedAt: shouldClose ? now : undefined,
      withdrawalsClosedBy: shouldClose ? options.operatorName : undefined,
      withdrawalsClosedReason: shouldClose
        ? (options.reason || 'Retiradas dadas por encerradas pelo operador')
        : undefined,
      notes: [
        order.notes || '',
        shouldClose
          ? `[PEDIDO ENCERRADO] Total retirado: ${totalWithdrawn} t de ${totalContracted} t contratadas. Encerrado em ${now} por ${options.operatorName || 'Operador'}. Motivo: ${options.reason || 'Concluído'}`
          : ''
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

  // Preserva o contratado original na primeira vez que o pedido sofre ajuste de fechamento/aumento
  const originalContractedQuantity = order.originalContractedQuantity ?? totalContracted;
  const originalContractedTotal = order.originalContractedTotal ?? order.total;

  // Ajusta a quantidade dos itens proporcionalmente (ou no item principal)
  let accumulatedTons = 0;
  const itemsCount = (order.items || []).length;
  const newItems = (order.items || []).map((item, idx) => {
    const isLast = idx === itemsCount - 1;
    let newQty: number;
    if (totalContracted > 0) {
      const ratio = targetQty / totalContracted;
      newQty = isLast
        ? roundTons(targetQty - accumulatedTons)
        : roundTons((item.quantity || 0) * ratio);
    } else {
      newQty = idx === 0 ? roundTons(targetQty) : 0;
    }
    accumulatedTons += newQty;
    const total = Number((Math.max(0, newQty) * (item.unitPrice || 0) - (item.discount || 0)).toFixed(2));
    return {
      ...item,
      quantity: Math.max(0, newQty),
      total: Math.max(0, total)
    };
  });

  const newSubtotal = Number(newItems.reduce((acc, it) => acc + (it.total || 0), 0).toFixed(2));
  const newTotal = Number(Math.max(0, newSubtotal - (order.discount || 0) + (order.shipping || 0)).toFixed(2));
  const deltaMoney = Number((newTotal - (order.total || 0)).toFixed(2));
  const deltaQuantity = roundTons(targetQty - totalContracted);

  const orderTxs = transactions.filter(t => t.orderId === order.id && t.type === TransactionType.SALE);
  const updatedTransactions: Transaction[] = [];
  const deletedTransactionIds: string[] = [];
  let newTransaction: Transaction | undefined;

  if (deltaMoney < -0.005) {
    // Redução do pedido (cliente retirou a menos):
    // Parcelas CONFIRMADO / PAGO no caixa JAMAIS são alteradas.
    // Primeiro reduzimos/excluímos parcelas PENDENTE, depois o saldo em aberto de parcelas PARCIAL.
    let moneyToCut = Math.abs(deltaMoney);
    const pendingTxs = orderTxs
      .filter(t => t.status === TransactionStatus.PENDENTE)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    for (const tx of pendingTxs) {
      if (moneyToCut <= 0.005) break;
      const currentAmount = Number(tx.amount || 0);
      if (currentAmount <= moneyToCut + 0.01) {
        deletedTransactionIds.push(tx.id);
        moneyToCut -= currentAmount;
      } else {
        const newAmount = Number((currentAmount - moneyToCut).toFixed(2));
        updatedTransactions.push({
          ...tx,
          amount: newAmount,
          notes: [
            tx.notes || '',
            `[AJUSTE RETIRADA] Valor reduzido de R$ ${currentAmount.toFixed(2)} para R$ ${newAmount.toFixed(2)} pelo fechamento de saldo (${targetQty} t).`
          ].filter(Boolean).join(' ')
        });
        moneyToCut = 0;
      }
    }

    // Se ainda restar valor a abater e houver transação PARCIAL com saldo em aberto, reduz apenas a parte não paga
    if (moneyToCut > 0.005) {
      const partialTxs = orderTxs
        .filter(t => t.status === TransactionStatus.PARCIAL)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      for (const tx of partialTxs) {
        if (moneyToCut <= 0.005) break;
        const currentAmount = Number(tx.amount || 0);
        const paid = Number(tx.paidAmount || 0);
        const openBalance = Math.max(0, Number((currentAmount - paid).toFixed(2)));
        if (openBalance <= 0.005) continue;

        const cutFromThis = Math.min(openBalance, moneyToCut);
        const newAmount = Number((currentAmount - cutFromThis).toFixed(2));
        const newStatus = newAmount <= paid + 0.01 ? TransactionStatus.PAGO : TransactionStatus.PARCIAL;
        updatedTransactions.push({
          ...tx,
          amount: newAmount,
          status: newStatus,
          notes: [
            tx.notes || '',
            `[AJUSTE RETIRADA] Valor ajustado de R$ ${currentAmount.toFixed(2)} para R$ ${newAmount.toFixed(2)} conforme total retirado (${targetQty} t).`
          ].filter(Boolean).join(' ')
        });
        moneyToCut -= cutFromThis;
      }
    }
  } else if (deltaMoney > 0.005 && !order.withoutFinance) {
    // Aumento do pedido (cliente retirou acima do combinado ou Admin aumentou o pedido):
    // Cria uma nova transação PENDENTE para o valor adicional, sem tocar nos pagamentos já feitos.
    const txId = options.newTransactionId || `tx_adj_${order.id}_${Date.now()}`;
    const mainProduct = newItems[0]?.productName || 'Calcário';
    newTransaction = {
      id: txId,
      companyId: order.companyId,
      accountId: '',
      costCenterId: 'cc4',
      date: todayStr,
      dueDate: todayStr,
      type: TransactionType.SALE,
      status: TransactionStatus.PENDENTE,
      description: `Complemento Pedido #${order.reference} (+${deltaQuantity} t)`,
      category: `Venda ${mainProduct}`,
      amount: deltaMoney,
      paidAmount: 0,
      quantity: deltaQuantity,
      customerId: order.customerId,
      orderId: order.id,
      payments: [],
      notes: `Lançamento complementar referente ao aumento/excedente do pedido de ${totalContracted} t para ${targetQty} t (+${deltaQuantity} t).`
    };
  }

  // Sincroniza também o cronograma interno `order.payments` para manter consistência visual
  let updatedOrderPayments = [...(order.payments || [])];
  if (deltaMoney > 0.005 && newTransaction) {
    updatedOrderPayments.push({
      id: newTransaction.id,
      amount: deltaMoney,
      paidAmount: 0,
      date: todayStr,
      status: TransactionStatus.PENDENTE,
      accountId: '',
      description: `Complemento (+${deltaQuantity} t)`
    });
  } else if (deltaMoney < -0.005 && updatedOrderPayments.length > 0) {
    let cutSchedule = Math.abs(deltaMoney);
    for (let i = updatedOrderPayments.length - 1; i >= 0 && cutSchedule > 0.005; i--) {
      const p = updatedOrderPayments[i];
      if (p.status === TransactionStatus.PENDENTE) {
        if (p.amount <= cutSchedule + 0.01) {
          cutSchedule -= p.amount;
          updatedOrderPayments.splice(i, 1);
        } else {
          updatedOrderPayments[i] = { ...p, amount: Number((p.amount - cutSchedule).toFixed(2)) };
          cutSchedule = 0;
        }
      }
    }
  }

  const actionTag = shouldClose
    ? `[PEDIDO AJUSTADO E ENCERRADO]`
    : `[PEDIDO AUMENTADO / AJUSTADO PELO ADMIN]`;

  const updatedOrder: SaleOrder = {
    ...order,
    items: newItems,
    subtotal: newSubtotal,
    total: newTotal,
    payments: updatedOrderPayments,
    originalContractedQuantity,
    originalContractedTotal,
    allowOverWithdrawal: deltaQuantity > 0 ? true : order.allowOverWithdrawal,
    withdrawalsClosed: shouldClose,
    withdrawalsClosedAt: shouldClose ? now : undefined,
    withdrawalsClosedBy: shouldClose ? options.operatorName : undefined,
    withdrawalsClosedReason: shouldClose
      ? (options.reason || 'Pedido encerrado pelo valor final das retiradas')
      : undefined,
    notes: [
      order.notes || '',
      `${actionTag} Quantidade alterada de ${totalContracted} t para ${targetQty} t (${deltaQuantity >= 0 ? '+' : ''}${deltaQuantity} t). Valor ajustado de R$ ${(order.total || 0).toFixed(2)} para R$ ${newTotal.toFixed(2)}. Por ${options.operatorName || 'Admin'} em ${now}. Motivo: ${options.reason || (shouldClose ? 'Encerramento pelo volume real retirado' : 'Aumento de pedido')}`
    ].filter(Boolean).join('\n')
  };

  return {
    updatedOrder,
    deltaQuantity,
    deltaMoney,
    updatedTransactions,
    deletedTransactionIds,
    newTransaction
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

  const totalContracted = sumTons((order.items || []).map(i => i.quantity));
  const originalContractedQuantity = order.originalContractedQuantity ?? totalContracted;
  const originalContractedTotal = order.originalContractedTotal ?? order.total;

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

  let newTransaction: Transaction | undefined;
  const updatedPayments = [...(order.payments || [])];
  if (!order.withoutFinance && additionalCost > 0) {
    newTransaction = {
      id: newTransactionId,
      companyId: order.companyId,
      accountId: '', // Pendente / A receber
      costCenterId: 'cc4',
      date: today,
      dueDate: today,
      type: TransactionType.SALE,
      status: TransactionStatus.PENDENTE,
      description: `Diferença Carga Excedente #${order.reference} (+${exceededQuantity} t)`,
      category: 'Venda Calcário Moído Granel',
      amount: additionalCost,
      paidAmount: 0,
      quantity: exceededQuantity,
      customerId: order.customerId,
      orderId: order.id,
      payments: [],
      notes: `Lançamento automático de diferença de carga pesada a mais (+${exceededQuantity} t)`
    };
    updatedPayments.push({
      id: newTransactionId,
      amount: additionalCost,
      paidAmount: 0,
      date: today,
      status: TransactionStatus.PENDENTE,
      accountId: '',
      description: `Carga Excedente (+${exceededQuantity} t)`
    });
  }

  const updatedOrder: SaleOrder = {
    ...order,
    items: updatedItems,
    subtotal: newSubtotal,
    total: newTotal,
    payments: updatedPayments,
    originalContractedQuantity,
    originalContractedTotal,
    allowOverWithdrawal: true,
    notes: [
      order.notes || '',
      `[CARGA EXCEDENTE REGISTRADA] Adicionado ${exceededQuantity} t ao pedido (+R$ ${additionalCost.toFixed(2)}) referente à pesagem/carregamento real.`
    ].filter(Boolean).join('\n')
  };

  return {
    updatedOrder,
    exceededQuantity,
    additionalCost,
    newTransaction
  };
}
