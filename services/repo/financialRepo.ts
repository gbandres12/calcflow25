import type { FinancialAccount, Transaction, TransactionPayment } from '../../types';
import { dateISOBR } from "../../utils/dateFilterUtils";

export function assembleAccount(row: any): FinancialAccount {
  const extra = row.extra || {};
  return {
    ...extra,
    id: row.id,
    companyId: row.company_id,
    name: row.name || extra.name || 'Sem nome',
    type: row.type || extra.type || 'banco',
    bankName: row.bank_name || extra.bankName || undefined,
    agency: row.agency || extra.agency || undefined,
    accountNumber: row.account_number || extra.accountNumber || undefined,
    initialBalance: Number(row.initial_balance != null ? row.initial_balance : (extra.initialBalance || 0)),
    currentBalance: Number(row.current_balance != null ? row.current_balance : (row.initial_balance || extra.currentBalance || extra.initialBalance || 0))
  };
}

export function assembleTransaction(header: any, payments: any[] = []): Transaction {
  const extra = header.extra || {};
  const mappedPayments: TransactionPayment[] = payments.map((p) => ({
    id: p.id,
    transactionId: p.transaction_id,
    amount: Number(p.amount || 0),
    paymentDate: p.payment_date,
    paymentMethod: p.payment_method || 'PIX',
    accountId: p.account_id,
    receiptId: p.receipt_id,
    notes: p.notes
  }));

  return {
    ...extra,
    id: header.id,
    companyId: header.company_id,
    description: header.description || extra.description || '',
    type: header.type || extra.type || 'SALE',
    amount: Number(header.amount != null ? header.amount : (extra.amount || 0)),
    paidAmount: Number(header.paid_amount != null ? header.paid_amount : (extra.paidAmount || 0)),
    status: header.status || extra.status || 'pendente',
    date: header.date || extra.date,
    paymentDate: header.payment_date || extra.paymentDate || undefined,
    category: header.category || extra.category || '',
    accountId: header.account_id || extra.accountId || undefined,
    orderId: header.order_id || extra.orderId || undefined,
    customerId: header.customer_id || extra.customerId || undefined,
    receiptId: header.receipt_id || extra.receiptId || undefined,
    costCenterId: header.cost_center_id || extra.costCenterId || undefined,
    paymentMethod: header.payment_method || extra.paymentMethod || undefined,
    notes: header.notes || extra.notes || undefined,
    payments: mappedPayments.length > 0 ? mappedPayments : extra.payments
  };
}

export async function fetchAccountsFromErp(companyId: string, supabase: any): Promise<FinancialAccount[]> {
  const { data, error } = await supabase
    .schema('erp')
    .from('financial_accounts')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null);

  if (error) throw error;
  return (data || []).map(assembleAccount);
}

export async function upsertAccountToErp(companyId: string, record: any, supabase: any): Promise<void> {
  const {
    id, name, type, bankName, agency, accountNumber,
    initialBalance, currentBalance, ...extra
  } = record;

  const { error } = await supabase
    .schema('erp')
    .from('financial_accounts')
    .upsert({
      company_id: companyId,
      id: String(id),
      name: name || 'Sem nome',
      type: type || 'banco',
      bank_name: bankName || null,
      agency: agency || null,
      account_number: accountNumber || null,
      initial_balance: Number(initialBalance || 0),
      current_balance: Number(currentBalance != null ? currentBalance : (initialBalance || 0)),
      extra: extra || {},
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id,id' });

  if (error) throw error;
}

export async function deleteAccountFromErp(companyId: string, id: string, supabase: any): Promise<void> {
  const { error } = await supabase
    .schema('erp')
    .from('financial_accounts')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);

  if (error) throw error;
}

export async function fetchTransactionsFromErp(companyId: string, supabase: any): Promise<Transaction[]> {
  const [
    { data: headers, error: hErr },
    { data: payments, error: pErr }
  ] = await Promise.all([
    supabase.schema('erp').from('transactions').select('*').eq('company_id', companyId).is('deleted_at', null),
    supabase.schema('erp').from('transaction_payments').select('*').eq('company_id', companyId)
  ]);

  if (hErr) throw hErr;
  if (pErr) console.warn('[FinancialRepo] Falha ao ler pagamentos:', pErr);

  const paymentsByTx = new Map<string, any[]>();
  (payments || []).forEach((p: any) => {
    const list = paymentsByTx.get(p.transaction_id) || [];
    list.push(p);
    paymentsByTx.set(p.transaction_id, list);
  });

  return (headers || []).map((h: any) =>
    assembleTransaction(h, paymentsByTx.get(h.id) || [])
  );
}

export async function upsertTransactionToErp(companyId: string, record: any, supabase: any): Promise<void> {
  const {
    id, description, type, amount, paidAmount, status,
    date, paymentDate, category, accountId, orderId,
    customerId, receiptId, costCenterId, paymentMethod,
    notes, payments, ...extra
  } = record;

  const { error: txErr } = await supabase
    .schema('erp')
    .from('transactions')
    .upsert({
      company_id: companyId,
      id: String(id),
      description: description || '',
      type: type || 'SALE',
      amount: Number(amount || 0),
      paid_amount: Number(paidAmount || 0),
      status: status || 'pendente',
      date: date || dateISOBR(),
      payment_date: paymentDate || null,
      category: category || null,
      account_id: accountId || null,
      order_id: orderId || null,
      customer_id: customerId || null,
      receipt_id: receiptId || null,
      cost_center_id: costCenterId || null,
      payment_method: paymentMethod || null,
      notes: notes || null,
      extra: extra || {},
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id,id' });

  if (txErr) throw txErr;

  if (Array.isArray(payments)) {
    if (payments.length > 0) {
      const paymentRows = payments.map((p: any, idx: number) => {
        const receiptRef = p.receiptId || p.receipt_id || receiptId || null;
        const pid = p.id || (receiptRef ? `pmt-${receiptRef}-${id}` : `pmt-${id}-${idx + 1}`);
        return {
          company_id: companyId,
          id: String(pid),
          transaction_id: String(id),
          amount: Number(p.amount || 0),
          payment_date: p.paymentDate || date || dateISOBR(),
          payment_method: p.paymentMethod || paymentMethod || 'PIX',
          account_id: p.accountId || accountId || null,
          receipt_id: receiptRef ? String(receiptRef) : null,
          notes: p.notes || null
        };
      });

      const keepIds = paymentRows.map(r => r.id);
      await supabase.schema('erp').from('transaction_payments').delete()
        .eq('company_id', companyId)
        .eq('transaction_id', String(id))
        .not('id', 'in', `(${keepIds.map(i => `"${i}"`).join(',')})`);

      const { error: pErr } = await supabase
        .schema('erp')
        .from('transaction_payments')
        .upsert(paymentRows, { onConflict: 'company_id,id' });

      if (pErr) console.warn('[FinancialRepo] Falha ao upsert em transaction_payments:', pErr);
    } else {
      await supabase.schema('erp').from('transaction_payments').delete()
        .eq('company_id', companyId)
        .eq('transaction_id', String(id));
    }
  }
}

export async function deleteTransactionFromErp(companyId: string, id: string, supabase: any): Promise<void> {
  const { error } = await supabase
    .schema('erp')
    .from('transactions')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id);

  if (error) throw error;
}
