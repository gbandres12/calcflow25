import pair from '../_lib/telegram/pair.js';
import conferir from '../_lib/telegram/conferir.js';
import webhook from '../_lib/telegram/webhook.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

const handlers: Record<string, (req: any, res: any) => Promise<any>> = {
  pair,
  conferir,
  webhook,
};

/** Uma função só na Vercel. As URLs /api/telegram/pair|conferir|webhook continuam iguais. */
export default async function handler(req: any, res: any) {
  const action = String(req.query?.action || '').trim();
  const route = handlers[action];
  if (!route) {
    return res.status(404).json({ error: 'Rota do Telegram não encontrada.' });
  }
  return route(req, res);
}
