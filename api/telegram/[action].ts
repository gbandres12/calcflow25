import pair from '../_lib/telegram/pair.js';
import conferir from '../_lib/telegram/conferir.js';
import webhook from '../_lib/telegram/webhook.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

const handlers: Record<string, (req: any, res: any) => Promise<any>> = {
  pair,
  conferir,
  webhook,
};

function resolveAction(req: any): string {
  const fromQuery = String(req.query?.action || '').trim();
  if (fromQuery && handlers[fromQuery]) return fromQuery;
  const pathname = String(req.url || '')
    .split('?')[0]
    .replace(/\/+$/, '');
  const lastSegment = pathname.split('/').pop() || '';
  return lastSegment.trim();
}

/** Uma função só na Vercel. As URLs /api/telegram/pair|conferir|webhook continuam iguais. */
export default async function handler(req: any, res: any) {
  const action = resolveAction(req);
  const route = handlers[action];
  if (!route) {
    return res.status(404).json({ error: 'Rota do Telegram não encontrada.' });
  }
  return route(req, res);
}
