import { applyCors, proxyToFiscal } from './_lib';

export default async function handler(req: any, res: any) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { nfeIdOrChave, referencia, resource, apiKey, apiBaseUrl, provider = 'notaas' } = req.body || {};
  const key = (apiKey || process.env.NOTAAS_API_KEY || '').trim();
  const base = (apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');

  if (!nfeIdOrChave && !referencia) {
    return res.status(400).json({ error: 'Informe nfeIdOrChave ou referencia.' });
  }

  let endpoints: string[] = [];
  if (referencia) {
    endpoints = provider === 'focusnfe'
      ? [`${base}/nfe?ref=${encodeURIComponent(referencia)}`]
      : [`${base}/nfe?referencia=${encodeURIComponent(referencia)}`];
  } else if (resource === 'danfe') {
    endpoints = [`${base}/nfe/${nfeIdOrChave}/danfe`];
  } else if (resource === 'xml') {
    endpoints = [`${base}/nfe/${nfeIdOrChave}/xml`];
  } else {
    endpoints = provider === 'focusnfe'
      ? [`${base}/nfe/${nfeIdOrChave}`]
      : [
          `${base}/nfe/${nfeIdOrChave}`,
          `${base}/invoices/${nfeIdOrChave}/status`,
          `${base}/nfe/chave/${nfeIdOrChave}`,
        ];
  }

  const result = await proxyToFiscal({ method: 'GET', endpoints, apiKey: key, provider });
  return res.status(result.status).json(result.data);
}
