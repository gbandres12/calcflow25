export const config = { runtime: 'nodejs', maxDuration: 20 };

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
    const id = body.invoiceId || body.nfeIdOrChave || body.referencia;
    const key = String(body.apiKey || process.env.NOTAAS_API_KEY || '').trim();
    const base = String(body.apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');

    if (!id) {
      return res.status(400).json({ error: 'Informe o invoiceId da NotaAs para consultar o status.' });
    }
    if (!key) {
      return res.status(400).json({ error: 'Chave da API NotaAs ausente na consulta.' });
    }

    const endpoint = `${base}/nfe/invoices/${encodeURIComponent(String(id))}/status`;
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-api-key': key
      }
    });

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : { error: `Resposta não-JSON da NotaAs (HTTP ${response.status}).` };

    return res.status(response.status).json(data);
  } catch (error: any) {
    console.error('Erro no proxy NF-e consultar:', error);
    return res.status(502).json({
      error: error?.message || 'Falha ao consultar status na NotaAs.'
    });
  }
}
