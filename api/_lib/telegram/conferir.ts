import { getTable } from '../_lib/erpRepository.js';
import { requireMember } from '../_lib/telegramAuth.js';
import { reconcileReceiptsAgainstPayments } from '../../services/domain/telegramWrites.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

/**
 * Conferência: por pedido, a soma dos recibos deve bater com a soma dos
 * pagamentos das transações. É a rede de segurança de ter duas implementações
 * da baixa — a do app e a do agente.
 */
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });

  const context = await requireMember(req, res);
  if (!context) return;

  try {
    const [orders, transactions] = await Promise.all([
      getTable(context.companyId, 'sales_orders'),
      getTable(context.companyId, 'transactions')
    ]);

    const issues = reconcileReceiptsAgainstPayments(orders as any, transactions as any);
    const telegramEntries = (transactions as any[]).filter((transaction) => transaction?.origin === 'telegram').length;

    return res.status(200).json({
      conferidoEm: new Date().toISOString(),
      pedidosConferidos: (orders as any[]).length,
      lancamentosPeloTelegram: telegramEntries,
      divergencias: issues
    });
  } catch (error: any) {
    console.error('[TELEGRAM] Erro na conferência:', error);
    return res.status(500).json({ error: error?.message || 'Falha ao conferir os lançamentos.' });
  }
}
