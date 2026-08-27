const PROJECT_ID = 'gen-lang-client-0353764568';
const DATABASE_ID = 'ai-studio-calcrioflowerp-e81fd407-c01c-4f57-9894-aa3f60aec01a';
const API_KEY = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyBlgnANdwa6BKVPTeB_ERali62bKGFt6xM';

const STATUS_MAP: Record<string, string> = {
  'invoice.authorized': 'autorizada',
  'invoice.issued': 'autorizada',
  autorizado: 'autorizada',
  autorizada: 'autorizada',
  issued: 'autorizada',
  authorized: 'autorizada',
  'invoice.rejected': 'rejeitada',
  'invoice.error': 'rejeitada',
  rejeitado: 'rejeitada',
  rejeitada: 'rejeitada',
  erro_autorizacao: 'rejeitada',
  'invoice.canceled': 'cancelada',
  cancelado: 'cancelada',
  cancelada: 'cancelada',
  'invoice.processing': 'processando',
  processando_autorizacao: 'processando',
  processando: 'processando',
};

function firestoreBase() {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
}

function fieldString(fields: any, key: string): string {
  return fields?.[key]?.stringValue || '';
}

async function findOrder(companyId: string, reference: string, orderId?: string) {
  if (orderId) {
    const byId = await fetch(
      `${firestoreBase()}/sales_orders_${companyId}/${encodeURIComponent(orderId)}?key=${API_KEY}`
    );
    if (byId.ok) {
      const doc = await byId.json();
      return { name: doc.name as string, fields: doc.fields, id: orderId };
    }
  }

  const queryRes = await fetch(`${firestoreBase()}:runQuery?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: `sales_orders_${companyId}` }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'reference' },
            op: 'EQUAL',
            value: { stringValue: reference },
          },
        },
        limit: 5,
      },
    }),
  });

  if (!queryRes.ok) return null;
  const rows = await queryRes.json();
  const hit = (Array.isArray(rows) ? rows : []).find((r: any) => r.document);
  if (!hit?.document) return null;
  const name: string = hit.document.name;
  const id = name.split('/').pop() || '';
  return { name, fields: hit.document.fields, id };
}

async function patchOrder(docName: string, updates: Record<string, string>) {
  const masks = Object.keys(updates)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined && v !== '') fields[k] = { stringValue: v };
  }
  const url = `https://firestore.googleapis.com/v1/${docName}?${masks}&key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return res.ok;
}

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'Calcário Flow ERP - Webhook Nótass',
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
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
    const companyId =
      (req.query?.companyId as string) ||
      data.companyId ||
      req.body?.companyId ||
      '';

    const rawStatus = data.status || event;
    const nfeStatus = STATUS_MAP[String(rawStatus).toLowerCase()] || STATUS_MAP[event] || 'processando';

    const nfeChave = data.nfeKey || data.chave || data.chaveAcesso || data.chave_nfe || data.chave_acesso || '';
    const nfeProtocolo = data.protocol || data.protocolo || '';
    const nfeDanfeUrl = data.danfeUrl || data.pdfUrl || data.url_danfe || data.caminho_danfe || '';
    const nfeXmlUrl = data.xmlUrl || data.url_xml || data.caminho_xml || '';
    const nfeErro = data.rejectionReason || data.motivo_rejeicao || data.mensagem_sefaz || '';

    if (!reference && !orderId) {
      return res.status(200).json({
        received: true,
        updated: false,
        reason: 'Webhook sem referenciaExterna/orderId; pedido não atualizado.',
        event,
      });
    }

    const companiesToTry = companyId ? [companyId] : ['matriz-demo'];
    let updated = false;
    let matchedId = '';

    for (const cid of companiesToTry) {
      const found = await findOrder(cid, reference, orderId);
      if (!found) continue;
      const patch: Record<string, string> = {
        nfeStatus,
        updatedAt: new Date().toISOString(),
      };
      if (nfeChave) patch.nfeChave = nfeChave;
      if (nfeProtocolo) patch.nfeProtocolo = nfeProtocolo;
      if (nfeDanfeUrl) patch.nfeDanfeUrl = nfeDanfeUrl;
      if (nfeXmlUrl) patch.nfeXmlUrl = nfeXmlUrl;
      if (nfeErro) patch.nfeErro = nfeErro;
      updated = await patchOrder(found.name, patch);
      matchedId = found.id;
      break;
    }

    return res.status(200).json({
      received: true,
      updated,
      event,
      nfeStatus,
      orderId: matchedId || orderId || null,
      reference: reference || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Erro no webhook Nótass:', err);
    return res.status(500).json({ error: err.message || 'Erro interno ao processar webhook' });
  }
}
