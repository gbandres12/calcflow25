import { fetchNotaasBinary, resolveNotaasAuth, setDocCors } from '../_lib/notaasBinary.js';

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
    if (!id) return res.status(400).json({ error: 'Informe o invoiceId da NotaAs para baixar o DANFE.' });

    const auth = await resolveNotaasAuth(body);
    if (auth.error) return res.status(400).json({ error: auth.error });

    const result = await fetchNotaasBinary({
      endpoint: `${auth.base}/nfe/invoices/${encodeURIComponent(id)}/danfe`,
      apiKey: auth.key,
      accept: 'application/pdf, application/json',
    });

    if (result.json || !result.buffer) {
      const json = result.json || {};
      const error =
        json.error ||
        json.message ||
        json.xMotivo ||
        json.motivo ||
        (result.status === 422
          ? 'A NF-e ainda não foi autorizada. O DANFE só é gerado após a SEFAZ autorizar (issued).'
          : `Falha ao gerar DANFE (HTTP ${result.status}).`);
      return res.status(result.status || 502).json({ error, ...json });
    }

    const filename = result.filename || `danfe-${id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(result.status).send(result.buffer);
  } catch (error: any) {
    const timeout = error?.name === 'AbortError';
    console.error('Erro no proxy NF-e DANFE:', error);
    return res.status(502).json({
      error: timeout
        ? 'A NotaAs não gerou o DANFE em 28s. Tente de novo.'
        : error?.message || 'Falha ao baixar o DANFE na NotaAs.',
    });
  }
}
