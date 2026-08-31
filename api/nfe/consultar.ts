import { proxyToFiscal, setCors } from '../_lib/fiscalProxy';
import { getFiscalConfigForCompany } from '../_lib/supabaseAdmin';

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { nfeIdOrChave, invoiceId, referencia, apiKey, apiBaseUrl, companyId } = req.body || {};
  const id = invoiceId || nfeIdOrChave || referencia;
  let key = (apiKey || process.env.NOTAAS_API_KEY || '').trim();
  let base = (apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');

  if ((!key || !base) && companyId) {
    const cfg = await getFiscalConfigForCompany(companyId);
    if (cfg) {
      if (!key) key = (cfg.apiKey || '').trim();
      if (cfg.apiBaseUrl) base = String(cfg.apiBaseUrl).replace(/\/$/, '');
    }
  }

  if (!id) {
    return res.status(400).json({ error: 'Informe invoiceId da NotaAs.' });
  }

  const result = await proxyToFiscal({
    method: 'GET',
    endpoint: `${base}/nfe/invoices/${encodeURIComponent(id)}/status`,
    apiKey: key,
  });
  return res.status(result.status).json(result.data);
}
