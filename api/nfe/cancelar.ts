import { proxyToFiscal, setCors } from '../_lib/fiscalProxy';
import { getFiscalConfigForCompany } from '../_lib/supabaseAdmin';

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { invoiceId, chaveOuId, justificativa, motivo, apiKey, apiBaseUrl, companyId } = req.body || {};
  const id = invoiceId || chaveOuId;
  const reason = (motivo || justificativa || '').trim();
  let key = (apiKey || process.env.NOTAAS_API_KEY || '').trim();
  let base = (apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');

  if (!id) return res.status(400).json({ error: 'invoiceId é obrigatório.' });
  if (reason.length < 15) {
    return res.status(400).json({ error: 'Justificativa deve ter no mínimo 15 caracteres.' });
  }

  if (!key && companyId) {
    const cfg = await getFiscalConfigForCompany(companyId);
    if (cfg?.apiKey) key = String(cfg.apiKey).trim();
    if (cfg?.apiBaseUrl) base = String(cfg.apiBaseUrl).replace(/\/$/, '');
  }

  const result = await proxyToFiscal({
    method: 'POST',
    endpoint: `${base}/nfe/cancelar`,
    apiKey: key,
    body: { invoiceId: id, motivo: reason },
  });
  return res.status(result.status).json(result.data);
}
