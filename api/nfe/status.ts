import { applyCors, proxyToFiscal } from './_lib';

export default async function handler(req: any, res: any) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const body = req.body || {};
  const key = (body.apiKey || process.env.NOTAAS_API_KEY || '').trim();
  const base = (body.apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');
  const provider = body.provider || 'notaas';

  if (!key) {
    return res.status(400).json({ error: 'Chave de API não informada.', status: 'offline' });
  }

  const endpoints = provider === 'focusnfe' ? [`${base}/nfe/status`] : [`${base}/status`, `${base}/nfe/status`];
  const result = await proxyToFiscal({ method: 'GET', endpoints, apiKey: key, provider });
  return res.status(result.status).json(result.data);
}
