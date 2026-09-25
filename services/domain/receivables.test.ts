import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OrderStatus, SaleOrder } from '../../types';
import { agingOf, allocatePayment, allocationsByOrder, buildReceivableRows, loadingDueDate } from './receivables';

const order = (o: Partial<SaleOrder>): SaleOrder => ({
  id: 'o', reference: 'PED-2026-0001', customerId: 'c1', sellerName: 'x', date: '2026-09-20',
  items: [], subtotal: 0, discount: 0, shipping: 0, total: 1000, status: OrderStatus.FINALIZED, payments: [],
  ...o
});

describe('contas a receber', () => {
  it('conta só venda confirmada, desconta recibos e ignora nota avulsa', () => {
    const rows = buildReceivableRows([
      order({ id: 'a', receipts: [{ amount: 400 } as any] }),
      order({ id: 'b', status: OrderStatus.BUDGET }),
      order({ id: 'c', isAvulsa: true }),
      order({ id: 'd', receipts: [{ amount: 1000 } as any] }),
      order({ id: 'e', withoutFinance: true })
    ]);
    assert.deepEqual(rows.map((r) => [r.orderId, r.open]), [['a', 600], ['e', 1000]]);
  });

  it('baixa feita direto no Financeiro também quita a venda', () => {
    const tx = (o: any) => ({ id: 't', accountId: 'a', date: '', description: '', category: '', amount: 1000, paidAmount: 0, type: 'SALE', status: 'pendente', ...o });
    const rows = buildReceivableRows(
      [order({ id: 'fin' }), order({ id: 'part' }), order({ id: 'both', receipts: [{ amount: 300 } as any] })],
      [
        tx({ orderId: 'fin', status: 'pago', paidAmount: 1000 }),
        tx({ orderId: 'part', payments: [{ amount: 200 }, { amount: 50, isDiscountOrDeduction: true }] }),
        tx({ orderId: 'both', payments: [{ amount: 300 }] })
      ] as any
    );
    assert.deepEqual(rows.map((r) => [r.orderId, r.open]), [['part', 750], ['both', 700]]);
  });

  it('vencimento é a primeira parcela e ordena pelo mais antigo', () => {
    const rows = buildReceivableRows([
      order({ id: 'late', date: '2026-09-10', payments: [{ date: '2026-09-30' } as any, { date: '2026-09-26' } as any] }),
      order({ id: 'early', date: '2026-09-22' })
    ]);
    assert.deepEqual(rows.map((r) => [r.orderId, r.dueDate]), [['early', '2026-09-22'], ['late', '2026-09-26']]);
  });

  it('pagamento de sábado baixa as cargas da semana e sobra vira aviso', () => {
    const rows = buildReceivableRows([
      order({ id: 'seg', date: '2026-09-21', total: 3000 }),
      order({ id: 'qua', date: '2026-09-23', total: 2500.5 }),
      order({ id: 'sex', date: '2026-09-25', total: 1000 })
    ]);
    const partial = allocatePayment(rows, 5000);
    assert.deepEqual(partial.allocations.map((a) => [a.orderId, a.amount]), [['seg', 3000], ['qua', 2000]]);
    assert.equal(partial.leftover, 0);
    const over = allocatePayment(rows, 7000);
    assert.equal(over.leftover, 499.5);
  });

  it('vencimento por modalidade: semanal cai no sábado', () => {
    assert.equal(loadingDueDate('semanal', '2026-09-21'), '2026-09-26'); // segunda → sábado
    assert.equal(loadingDueDate('semanal', '2026-09-26'), '2026-09-26'); // sábado → mesmo dia
    assert.equal(loadingDueDate('semanal', '2026-09-27'), '2026-10-03'); // domingo → próximo sábado
    assert.equal(loadingDueDate('prazo', '2026-09-21', 30), '2026-10-21');
    assert.equal(loadingDueDate('avista', '2026-09-21'), '2026-09-21');
  });

  it('pedido cobrado por carga: deve o que carregou, cada carga com seu preço e vencimento', () => {
    const w = (id: string, date: string, qty: number, extra: any = {}) =>
      ({ id, orderId: 'big', date, quantityWithdrawn: qty, driverName: '', plateNumber: 'AAA1A11', ...extra });
    const big = order({
      id: 'big', total: 50000,
      items: [{ unitPrice: 100 } as any],
      receipts: [{ amount: 4000 } as any],
      withdrawals: [
        w('seg', '2026-09-21', 30, { billingTerm: 'semanal' }),
        w('qua', '2026-09-23', 40, { billingTerm: 'semanal', unitPrice: 95 }),
        w('qui', '2026-09-24', 10, { billingTerm: 'avista' })
      ] as any
    });
    const rows = buildReceivableRows([big]);
    // à vista (vence 24) quita primeiro; os 3000 restantes vão na carga de segunda.
    assert.deepEqual(rows.map((r) => [r.key, r.term, r.dueDate, r.total, r.open]), [
      ['qua', 'semanal', '2026-09-26', 3800, 3800]
    ]);
    const all = buildReceivableRows([{ ...big, receipts: [] }]);
    assert.deepEqual(all.map((r) => [r.key, r.open]), [['qui', 1000], ['seg', 3000], ['qua', 3800]]);
    const { allocations } = allocatePayment(all, 7800);
    assert.deepEqual(allocationsByOrder(allocations), [{ orderId: 'big', amount: 7800 }]);
  });

  it('situação do vencimento', () => {
    assert.equal(agingOf('2026-09-20', '2026-09-25'), 'vencido');
    assert.equal(agingOf('2026-09-25', '2026-09-25'), 'hoje');
    assert.equal(agingOf('2026-09-26', '2026-09-25'), 'a_vencer');
  });
});
