import { applyCors, proxyToFiscal } from './_lib';

export default async function handler(req: any, res: any) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { chaveOuId, justificativa, apiKey, apiBaseUrl, provider = 'notaas' } = req.body || {};
  const key = (apiKey || process.env.NOTAAS_API_KEY || '').trim();
  const base = (apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');

  if (!chaveOuId) return res.status(400).json({ error: 'chaveOuId é obrigatório.' });
  if (!justificativa || String(justificativa).trim().length < 15) {
    return res.status(400).json({ error: 'Justificativa deve ter no mínimo 15 caracteres.' });
  }

  const body = { id: chaveOuId, chaveAcesso: chaveOuId, justificativa: String(justificativa).trim() };
  const endpoints = provider === 'focusnfe'
    ? [`${base}/nfe/${chaveOuId}/cancelamento`]
    : [`${base}/nfe/${chaveOuId}/cancelar`, `${base}/cancelar`];

  const result = await proxyToFiscal({ method: 'POST', endpoints, apiKey: key, provider, body });
  return res.status(result.status).json(result.data);
}
