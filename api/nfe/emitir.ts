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
    const payload = body.payload;
    const provider = String(body.provider || 'notaas').toLowerCase();
    const key = String(body.apiKey || process.env.NOTAAS_API_KEY || '').trim();
    const base = String(body.apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({error: 'Payload da NF-e não informado. O ERP precisa enviar o JSON da nota.'});
    }

    if (!key) {
      return res.status(400).json({
        error: 'Chave da API NotaAs ausente. Cadastre a Project Key (ntaas_…) em Configurações > Fiscal.'
      });
    }

    const endpoint =
      provider === 'focusnfe'
        ? `${base}/nfe?ref=${encodeURIComponent(payload.referenciaExterna || '')}`
        : `${base}/nfe/emitir`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-key': key
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const contentType = response.headers.get('content-type') || '';
    let data: any;
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => ({}));
    } else {
      const preview = await response.text().catch(() => '');
      data = {
        error: `A NotaAs não devolveu JSON (HTTP ${response.status}).`,
        preview: preview.slice(0, 400)
      };
    }

    if (response.status === 401) {
      data = {
        ...data,
        isAuthError: true,
        error: '[HTTP 401] Chave rejeitada pela NotaAs. Use a Project Key do painel (prefixo ntaas_).'
      };
    }

    return res.status(response.status).json(data);
  } catch (error: any) {
    const timeout = error?.name === 'AbortError';
    console.error('Erro no proxy NF-e emitir:', error);
    return res.status(502).json({
      error: timeout
        ? 'A NotaAs não respondeu em 25s. Tente de novo ou confira o status no painel NotaAs.'
        : error?.message || 'Falha ao conectar no emissor NotaAs.'
    });
  }
}
