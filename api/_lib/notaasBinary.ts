import { getFiscalConfigForCompany, findSalesOrder, getAdminSupabase } from './supabaseAdmin.js';

export async function resolveNotaasAuth(body: any): Promise<{ key: string; base: string; error?: string }> {
  let key = String(body?.apiKey || process.env.NOTAAS_API_KEY || '').trim();
  let base = String(body?.apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');
  let companyId = String(body?.companyId || '').trim();

  // Se companyId não veio, tenta resolver pelo invoiceId / nfeIdOrChave no pedido
  const invoiceId = String(body?.invoiceId || body?.nfeIdOrChave || '').trim();
  if (!key && !companyId && invoiceId) {
    try {
      const order = await findSalesOrder({ invoiceId });
      if (order?.company_id) {
        companyId = order.company_id;
      }
    } catch (e) {
      console.warn('Não foi possível inferir companyId do pedido:', e);
    }
  }

  if (!key && companyId) {
    const cfg = await getFiscalConfigForCompany(companyId);
    if (cfg?.apiKey || cfg?.apiKeyNotaas) key = String(cfg.apiKey || cfg.apiKeyNotaas).trim();
    if (cfg?.apiBaseUrl) base = String(cfg.apiBaseUrl).replace(/\/$/, '');
  }

  // Fallback: se ainda não achou chave, busca qualquer fiscal_config válido cadastrado no Supabase
  if (!key) {
    try {
      const supabase = getAdminSupabase();
      if (supabase) {
        const { data } = await supabase
          .from('app_records')
          .select('id, company_id, data')
          .eq('table_name', 'fiscal_config')
          .limit(20);
        if (Array.isArray(data)) {
          const found = data.find((r: any) => (r.data?.apiKey || r.data?.apiKeyNotaas) && r.id !== '__seed__');
          if (found?.data) {
            key = String(found.data.apiKey || found.data.apiKeyNotaas).trim();
            if (found.data.apiBaseUrl) base = String(found.data.apiBaseUrl).replace(/\/$/, '');
          }
        }
      }
    } catch (e) {
      console.warn('Falha no fallback de fiscal_config:', e);
    }
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
