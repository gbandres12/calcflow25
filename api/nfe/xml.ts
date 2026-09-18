import { fetchNotaasBinary, resolveNotaasAuth, setDocCors } from '../_lib/notaasBinary';

export const config = { runtime: 'nodejs', maxDuration: 30 };

export default async function handler(req: any, res: any) {
  setDocCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    const body = req.body || {};
    const id = String(body.invoiceId || body.nfeIdOrChave || '').trim();
    if (!id) return res.status(400).json({ error: 'Informe o invoiceId da NotaAs para baixar o XML.' });

    const auth = await resolveNotaasAuth(body);
    if (auth.error) return res.status(400).json({ error: auth.error });

    const type = String(body.type || 'emission');
    const qs = type === 'cancel' ? '?type=cancel' : '?type=emission';
    const result = await fetchNotaasBinary({
      endpoint: `${auth.base}/nfe/invoices/${encodeURIComponent(id)}/xml${qs}`,
      apiKey: auth.key,
      accept: 'application/xml, text/xml, application/json',
    });

    if (result.json || !result.buffer) {
      const json = result.json || {};
      return res.status(result.status || 502).json({
        error: json.error || json.message || `Falha ao baixar XML (HTTP ${result.status}).`,
        ...json,
      });
    }

    const filename = result.filename || `nfe-${id}.xml`;
    res.setHeader('Content-Type', result.contentType.includes('xml') ? result.contentType : 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(result.status).send(result.buffer);
  } catch (error: any) {
    const timeout = error?.name === 'AbortError';
    return res.status(502).json({
      error: timeout ? 'A NotaAs não devolveu o XML a tempo.' : error?.message || 'Falha ao baixar o XML.',
    });
  }
}
