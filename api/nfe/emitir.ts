import { postNotaasEmitir } from '../../services/domain/notaasEmitir.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, x-api-key, Authorization, X-Requested-With'
  );
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    const body = req.body || {};
    const result = await postNotaasEmitir({
      payload: body.payload,
      apiKey: String(body.apiKey || process.env.NOTAAS_API_KEY || ''),
      apiBaseUrl: body.apiBaseUrl,
      provider: body.provider
    });
    return res.status(result.status).json(result.data);
  } catch (error: any) {
    console.error('Erro no proxy NF-e emitir:', error);
    return res.status(502).json({
      error: error?.message || 'Falha ao conectar no emissor NotaAs.'
    });
  }
}
