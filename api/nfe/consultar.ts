import { applyCors, proxyToFiscal } from './_lib';

export default async function handler(req: any, res: any) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { nfeIdOrChave, invoiceId, apiKey, apiBaseUrl } = req.body || {};
  const id = invoiceId || nfeIdOrChave;
  const key = (apiKey || process.env.NOTAAS_API_KEY || '').trim();
  const base = (apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');

  if (!id) {
    return res.status(400).json({ error: 'Informe invoiceId da NotaAs.' });
  }

  const result = await proxyToFiscal({
    method: 'GET',
    endpoints: [`${base}/nfe/invoices/${encodeURIComponent(id)}/status`],
    apiKey: key,
  });
  return res.status(result.status).json(result.data);
}
