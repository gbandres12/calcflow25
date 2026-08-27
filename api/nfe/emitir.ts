import { applyCors, proxyToFiscal } from './_lib';

export default async function handler(req: any, res: any) {
  applyCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    const { payload, apiKey, apiBaseUrl, provider = 'notaas' } = req.body || {};
    const effectiveApiKey = (apiKey || process.env.NOTAAS_API_KEY || '').trim();
    const effectiveBaseUrl = (apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');

    if (!payload) {
      return res.status(400).json({ error: 'Payload da NF-e não informado no corpo da requisição.' });
    }

    const endpoints = provider === 'focusnfe'
      ? [`${effectiveBaseUrl}/nfe?ref=${encodeURIComponent(payload.referenciaExterna || '')}`]
      : [
          `${effectiveBaseUrl}/nfe/emitir`,
          `${effectiveBaseUrl}/nfe`,
          'https://platform.notaas.com.br/api/v1/nfe/emitir',
        ];

    const result = await proxyToFiscal({
      method: 'POST',
      endpoints,
      apiKey: effectiveApiKey,
      provider,
      body: payload,
    });

    return res.status(result.status).json(result.data);
  } catch (error: any) {
    console.error('Erro inesperado no proxy fiscal:', error);
    return res.status(500).json({ error: error.message || 'Erro interno no servidor proxy.' });
  }
}
