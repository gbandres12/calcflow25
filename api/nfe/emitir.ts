import { proxyToFiscal, setCors } from '../_lib/fiscalProxy';
import { getFiscalConfigForCompany } from '../_lib/supabaseAdmin';

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    const { payload, apiKey, apiBaseUrl, companyId, provider = 'notaas' } = req.body || {};
    let key = (apiKey || process.env.NOTAAS_API_KEY || '').trim();
    let base = (apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');

    if (!payload) {
      return res.status(400).json({ error: 'Payload da NF-e não informado.' });
    }

    if ((!key || !base) && companyId) {
      const cfg = await getFiscalConfigForCompany(companyId);
      if (cfg) {
        if (!key) key = (cfg.apiKey || '').trim();
        if (cfg.apiBaseUrl) base = String(cfg.apiBaseUrl).replace(/\/$/, '');
      }
    }

    if (!key) {
      return res.status(400).json({ error: 'Chave de API fiscal não configurada para esta empresa.' });
    }

    const endpoint =
      provider === 'focusnfe'
        ? `${base}/nfe?ref=${encodeURIComponent(payload.referenciaExterna || '')}`
        : `${base}/nfe/emitir`;

    const result = await proxyToFiscal({
      method: 'POST',
      endpoint,
      apiKey: key,
      body: payload,
    });

    return res.status(result.status).json(result.data);
  } catch (error: any) {
    console.error('Erro no proxy NF-e emitir:', error);
    return res.status(500).json({ error: error.message || 'Erro interno no servidor proxy.' });
  }
}
