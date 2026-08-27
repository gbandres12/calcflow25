import { applyCors, proxyToFiscal } from './_lib';

export default async function handler(req: any, res: any) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { invoiceId, chaveOuId, justificativa, motivo, apiKey, apiBaseUrl } = req.body || {};
  const id = invoiceId || chaveOuId;
  const reason = (motivo || justificativa || '').trim();
  const key = (apiKey || process.env.NOTAAS_API_KEY || '').trim();
  const base = (apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');

  if (!id) return res.status(400).json({ error: 'invoiceId é obrigatório.' });
  if (reason.length < 15) {
    return res.status(400).json({ error: 'Justificativa deve ter no mínimo 15 caracteres.' });
  }

  const result = await proxyToFiscal({
    method: 'POST',
    endpoints: [`${base}/nfe/cancelar`],
    apiKey: key,
    body: { invoiceId: id, motivo: reason },
  });
  return res.status(result.status).json(result.data);
}
