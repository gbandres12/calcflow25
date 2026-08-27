import { applyCors, proxyToFiscal } from './_lib';

export default async function handler(req: any, res: any) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    const { payload, apiKey, apiBaseUrl } = req.body || {};
    const key = (apiKey || process.env.NOTAAS_API_KEY || '').trim();
    const base = (apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');

    if (!payload) {
      return res.status(400).json({ error: 'Payload da NF-e não informado.' });
    }

    const result = await proxyToFiscal({
      method: 'POST',
      endpoints: [`${base}/nfe/emitir`],
      apiKey: key,
      body: payload,
    });

    return res.status(result.status).json(result.data);
  } catch (error: any) {
    console.error('Erro no proxy NF-e emitir:', error);
    return res.status(500).json({ error: error.message || 'Erro interno no servidor proxy.' });
  }
}
