export function applyCors(res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-api-key, Authorization'
  );
}

export function fiscalAuthHeaders(apiKey: string, provider: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  const key = (apiKey || '').trim();
  if (provider === 'focusnfe') {
    headers['Authorization'] = `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
    headers['x-api-key'] = key;
  } else {
    headers['x-api-key'] = key;
    headers['Authorization'] = `Bearer ${key}`;
  }
  return headers;
}

/** Continua para o próximo endpoint só em falha de rede. HTTP 4xx/5xx da API fiscal é retornado na hora. */
export async function proxyToFiscal(opts: {
  method: string;
  endpoints: string[];
  apiKey: string;
  provider: string;
  body?: any;
}): Promise<{ status: number; data: any; isJson: boolean }> {
  let lastNetworkError = '';
  for (const endpoint of opts.endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: opts.method,
        headers: fiscalAuthHeaders(opts.apiKey, opts.provider),
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
      return { status: response.status, data, isJson };
    } catch (err: any) {
      lastNetworkError = err?.message || 'Falha de rede';
    }
  }
  return {
    status: 502,
    data: { error: 'Não foi possível conectar aos servidores da API Fiscal.', details: lastNetworkError },
    isJson: true,
  };
}
