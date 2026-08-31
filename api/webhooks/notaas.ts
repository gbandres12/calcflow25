import { findSalesOrder, getAdminSupabase, patchSalesOrder } from '../_lib/supabaseAdmin';

const STATUS_MAP: Record<string, string> = {
  'invoice.authorized': 'autorizada',
  'invoice.issued': 'autorizada',
  autorizado: 'autorizada',
  autorizada: 'autorizada',
  issued: 'autorizada',
  authorized: 'autorizada',
  'nfe.issued': 'autorizada',
  'nfce.issued': 'autorizada',
  'invoice.rejected': 'rejeitada',
  'invoice.error': 'rejeitada',
  rejeitado: 'rejeitada',
  rejeitada: 'rejeitada',
  erro_autorizacao: 'rejeitada',
  error: 'rejeitada',
  'nfe.error': 'rejeitada',
  'nfce.error': 'rejeitada',
  'invoice.canceled': 'cancelada',
  cancelado: 'cancelada',
  cancelada: 'cancelada',
  cancelled: 'cancelada',
  canceled: 'cancelada',
  'nfe.cancelled': 'cancelada',
  'nfce.cancelled': 'cancelada',
  'invoice.processing': 'processando',
  processando_autorizacao: 'processando',
  processando: 'processando',
  queued: 'processando',
  processing: 'processando',
};

function webhookAuthorized(req: any): boolean {
  const expected = (process.env.NOTAAS_WEBHOOK_SECRET || '').trim();
  if (!expected) return true;
  const header =
    req.headers['x-webhook-secret'] ||
    req.headers['x-notaas-secret'] ||
    req.headers['authorization'] ||
    '';
  const token = String(header).replace(/^Bearer\s+/i, '').trim();
  return token === expected;
}

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'Calcário Flow ERP - Webhook NF-e',
      store: getAdminSupabase() ? 'supabase' : 'unconfigured',
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  if (!webhookAuthorized(req)) {
    return res.status(401).json({ error: 'Webhook não autorizado.' });
  }

  try {
    const event =
      req.headers['x-notaas-event'] ||
      req.body?.event ||
      req.body?.tipo_evento ||
      'invoice.update';
    const data = req.body?.data || req.body?.invoice || req.body || {};
    const reference =
      data.externalReference ||
      data.referenciaExterna ||
      data.referencia ||
      data.ref ||
      req.body?.referencia ||
      '';
    const orderId = data.orderId || req.body?.orderId || '';
    const invoiceId = data.invoiceId || data.id || req.body?.invoiceId || '';
    const companyId =
      (req.query?.companyId as string) ||
      data.companyId ||
      req.body?.companyId ||
      '';

    const rawStatus = data.status || event;
    const nfeStatus =
      STATUS_MAP[String(rawStatus).toLowerCase()] ||
      STATUS_MAP[String(event).toLowerCase()] ||
      STATUS_MAP[event] ||
      'processando';

    const nfeChave = data.nfeKey || data.chave || data.chaveAcesso || data.chave_nfe || data.chave_acesso || '';
    const nfeProtocolo = data.nProt || data.protocol || data.protocolo || '';
    const nfeDanfeUrl = data.danfeUrl || data.pdfUrl || data.url_danfe || data.caminho_danfe || '';
    const nfeXmlUrl = data.xmlUrl || data.url_xml || data.caminho_xml || '';
    const nfeErro = data.xMotivo || data.errorMessage || data.rejectionReason || data.motivo_rejeicao || data.mensagem_sefaz || '';
    const nfeNumero = data.nNf != null ? String(data.nNf) : data.numero != null ? String(data.numero) : '';
    const nfeSerie = data.serie != null ? String(data.serie) : '';

    if (!reference && !orderId && !invoiceId) {
      return res.status(200).json({
        received: true,
        updated: false,
        reason: 'Webhook sem invoiceId/referenciaExterna/orderId; pedido não atualizado.',
        event,
      });
    }

    const found = await findSalesOrder({
      companyId: companyId || undefined,
      orderId: orderId || undefined,
      invoiceId: invoiceId || undefined,
      reference: reference || undefined,
    });

    if (!found) {
      return res.status(200).json({
        received: true,
        updated: false,
        reason: 'Pedido não encontrado no Supabase.',
        event,
        nfeStatus,
        orderId: orderId || null,
        invoiceId: invoiceId || null,
        reference: reference || null,
        timestamp: new Date().toISOString(),
      });
    }

    const patch: Record<string, any> = {
      nfeStatus,
    };
    if (invoiceId) patch.nfeId = invoiceId;
    if (nfeChave) patch.nfeChave = nfeChave;
    if (nfeProtocolo) patch.nfeProtocolo = nfeProtocolo;
    if (nfeDanfeUrl) patch.nfeDanfeUrl = nfeDanfeUrl;
    if (nfeXmlUrl) patch.nfeXmlUrl = nfeXmlUrl;
    if (nfeNumero) patch.nfeNumero = nfeNumero;
    if (nfeSerie) patch.nfeSerie = nfeSerie;
    if (nfeErro) patch.nfeErro = nfeErro;
    else if (nfeStatus === 'autorizada') patch.nfeErro = '';

    const updated = await patchSalesOrder(found, patch);

    return res.status(200).json({
      received: true,
      updated,
      event,
      nfeStatus,
      orderId: found.id,
      invoiceId: invoiceId || null,
      reference: reference || found.data?.reference || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Erro no webhook NF-e:', err);
    return res.status(500).json({ error: err.message || 'Erro interno ao processar webhook' });
  }
}
