export async function proxyToFiscal(opts: {
  method: string;
  endpoint: string;
  apiKey: string;
  body?: any;
  provider?: string;
}): Promise<{ status: number; data: any }> {
  const cleanKey = (opts.apiKey || '').trim();
  const provider = (opts.provider || 'notaas').toLowerCase();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };

  if (cleanKey) {
    headers['x-api-key'] = cleanKey;
    if (provider === 'focusnfe') {
      try {
        headers['Authorization'] = `Basic ${Buffer.from(`${cleanKey}:`).toString('base64')}`;
      } catch {}
    } else {
      // Alguns endpoints ou proxies aceitam Bearer como fallback
      headers['Authorization'] = `Bearer ${cleanKey}`;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(opts.endpoint, {
      method: opts.method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    let data: any;
    if (isJson) {
      data = await response.json().catch(() => ({}));
    } else {
      const preview = await response.text().catch(() => '');
      data = { error: 'Resposta não-JSON da API fiscal', preview: preview.slice(0, 300) };
    }

    // Se a API externa retornou 401 (chave inválida), adicionar dica amigável
    if (response.status === 401) {
      const originalErr = data?.error || data?.mensagem || data?.message || 'API key não autorizada';
      data = {
        ...data,
        error: `[HTTP 401] ${originalErr}. Verifique a chave de API nas Configurações Fiscais. Na Notaas, certifique-se de copiar a 'Project Key' (com prefixo 'ntaas_') no Dashboard da Notaas > API Keys.`,
        isAuthError: true
      };
    }

    return { status: response.status, data };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err?.name === 'AbortError';
    const errorMsg = isTimeout
      ? 'Tempo limite esgotado ao aguardar resposta dos servidores da API Fiscal (Timeout de 25s).'
      : (err?.message || 'Falha de rede ao conectar com a API Fiscal');

    console.error(`💥 [PROXY FISCAL] Erro ao conectar em ${opts.endpoint}:`, errorMsg);

    return {
      status: 502,
      data: {
        error: `Erro de conexão com o servidor da API Fiscal: ${errorMsg}.`,
        details: err?.code || err?.message || 'Falha de rede',
        endpoint: opts.endpoint
      }
    };
  }
}

export function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-api-key, Authorization'
  );
}
