import { getFiscalConfigForCompany } from './supabaseAdmin';

export async function resolveNotaasAuth(body: any): Promise<{ key: string; base: string; error?: string }> {
  let key = String(body?.apiKey || process.env.NOTAAS_API_KEY || '').trim();
  let base = String(body?.apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');
  const companyId = String(body?.companyId || '').trim();
  if (!key && companyId) {
    const cfg = await getFiscalConfigForCompany(companyId);
    if (cfg?.apiKey) key = String(cfg.apiKey).trim();
    if (cfg?.apiBaseUrl) base = String(cfg.apiBaseUrl).replace(/\/$/, '');
  }
  if (!key) return { key: '', base, error: 'Chave da API NotaAs ausente. Cadastre a Project Key nas Configurações Fiscais.' };
  return { key, base };
}

export async function fetchNotaasBinary(opts: {
  endpoint: string;
  apiKey: string;
  accept: string;
}): Promise<{ status: number; contentType: string; buffer?: Buffer; json?: any; filename?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 28000);
  try {
    const response = await fetch(opts.endpoint, {
      method: 'GET',
      headers: {
        Accept: opts.accept,
        'x-api-key': opts.apiKey,
      },
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    const disposition = response.headers.get('content-disposition') || '';
    const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
    const filename = filenameMatch?.[1];

    if (contentType.includes('application/json') || contentType.includes('text/json')) {
      const json = await response.json().catch(() => ({}));
      return { status: response.status, contentType, json, filename };
    }

    const ab = await response.arrayBuffer();
    return {
      status: response.status,
      contentType: contentType || 'application/octet-stream',
      buffer: Buffer.from(ab),
      filename,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function setDocCors(res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization, X-Requested-With');
}
