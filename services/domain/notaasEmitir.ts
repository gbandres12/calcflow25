/**
 * Proxy HTTP para emissão NF-e na NotaAs.
 * Usado por api/nfe/emitir.ts e pelo agente Telegram (sem duplicar integração).
 */

export const NOTAAS_DEFAULT_BASE = 'https://platform.notaas.com.br/api/v1';

export interface PostNotaasEmitirInput {
  payload: Record<string, unknown>;
  apiKey: string;
  apiBaseUrl?: string;
  provider?: string;
  timeoutMs?: number;
}

export interface PostNotaasEmitirResult {
  status: number;
  data: any;
  ok: boolean;
}

export async function postNotaasEmitir(input: PostNotaasEmitirInput): Promise<PostNotaasEmitirResult> {
  const key = String(input.apiKey || '').trim();
  const provider = String(input.provider || 'notaas').toLowerCase();
  const base = String(input.apiBaseUrl || NOTAAS_DEFAULT_BASE).replace(/\/$/, '');
  const payload = input.payload;

  if (!payload || typeof payload !== 'object') {
    return {
      status: 400,
      ok: false,
      data: { error: 'Payload da NF-e não informado. O ERP precisa enviar o JSON da nota.' }
    };
  }

  if (!key) {
    return {
      status: 400,
      ok: false,
      data: {
        error: 'Chave da API NotaAs ausente. Cadastre a Project Key (ntaas_…) em Configurações > Fiscal.'
      }
    };
  }

  const endpoint =
    provider === 'focusnfe'
      ? `${base}/nfe?ref=${encodeURIComponent(String((payload as any).referenciaExterna || ''))}`
      : `${base}/nfe/emitir`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs ?? 25000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-key': key
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

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

    return {
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      data
    };
  } catch (error: any) {
    const timeout = error?.name === 'AbortError';
    return {
      status: 502,
      ok: false,
      data: {
        error: timeout
          ? 'A NotaAs não respondeu em 25s. Tente de novo ou confira o status no painel NotaAs.'
          : error?.message || 'Falha ao conectar no emissor NotaAs.'
      }
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
