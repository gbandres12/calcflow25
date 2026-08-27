export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-api-key, Authorization'
  );
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    const { payload, apiKey, apiBaseUrl } = req.body || {};
    const key = (apiKey || process.env.NOTAAS_API_KEY || '').trim();
    const base = (apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');

    if (!payload) {
      return res.status(400).json({ error: 'Payload da NF-e não informado.' });
    }

    const result = await proxyToFiscal({
      method: 'POST',
      endpoint: `${base}/nfe/emitir`,
      apiKey: key,
      body: payload,
    });

    return res.status(result.status).json(result.data);
  } catch (error: any) {
    console.error('Erro no proxy NF-e emitir:', error);
    return res.status(500).json({ error: error.message || 'Erro interno no servidor proxy.' });
  }
}

async function proxyToFiscal(opts: {
  method: string;
  endpoint: string;
  apiKey: string;
  body?: any;
}): Promise<{ status: number; data: any }> {
  const keyTail = (opts.apiKey || '').trim().slice(-4);
  try {
    console.log('[nfe-proxy] outbound', {
      method: opts.method,
      endpoint: opts.endpoint,
      apiKeyTail: keyTail ? `…${keyTail}` : '(empty)',
    });
    const response = await fetch(opts.endpoint, {
      method: opts.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-api-key': (opts.apiKey || '').trim(),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    let data: any;
    if (isJson) {
      data = await response.json().catch(() => ({}));
    } else {
      const preview = await response.text().catch(() => '');
      data = { error: 'Resposta não-JSON da API fiscal', preview: preview.slice(0, 240) };
    }
    const bodyPreview =
      typeof data === 'string' ? data.slice(0, 400) : JSON.stringify(data).slice(0, 400);
    console.log('[nfe-proxy] response', {
      endpoint: opts.endpoint,
      status: response.status,
      contentType,
      bodyPreview,
    });
    return { status: response.status, data };
  } catch (err: any) {
    console.error('[nfe-proxy] fetch failed', {
      endpoint: opts.endpoint,
      error: err?.message || 'Falha de rede',
    });
    return {
      status: 502,
      data: { error: 'Não foi possível conectar aos servidores da API Fiscal.', details: err?.message || 'Falha de rede' },
    };
  }
}
