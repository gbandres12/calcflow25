import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import fetch from "node-fetch";

// Inicializa o Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * 📡 Cloud Function: emitirNfe (HTTPS Callable)
 * Emite NF-e diretamente Servidor -> Servidor (Nótass / FocusNFe), eliminando qualquer bloqueio de CORS.
 */
export const emitirNfe = onCall({
  cors: true,
  maxInstances: 10,
}, async (request) => {
  const { payload, companyId, provider = "notaas", apiKey, apiBaseUrl, orderId } = request.data || {};

  if (!payload) {
    throw new HttpsError("invalid-argument", "O payload da NF-e é obrigatório.");
  }

  // 1. Identificar Chave da Empresa (SaaS Multi-tenant)
  let effectiveApiKey = (apiKey || "").trim();
  const effectiveBaseUrl = (apiBaseUrl || "https://platform.notaas.com.br/api/v1").replace(/\/$/, "");

  // Se não foi passada chave direta, busca nas configurações da empresa no Firestore ou usa Secret
  if (!effectiveApiKey && companyId) {
    try {
      const companyDoc = await db.collection(`company_settings_${companyId}`).doc("config").get();
      if (companyDoc.exists) {
        const data = companyDoc.data();
        effectiveApiKey = data?.fiscalApiKey || data?.notaasApiKey || "";
      }
    } catch (err) {
      console.warn("⚠️ Não foi possível ler configurações da empresa no Firestore:", err);
    }
  }

  if (!effectiveApiKey) {
    effectiveApiKey = process.env.NOTAAS_API_KEY || "";
  }

  console.info(`📡 [Cloud Function emitirNfe] Transmitindo NF-e para ${provider.toUpperCase()}`);
  console.info(`📌 Referência Externa: ${payload.referenciaExterna} | Empresa: ${companyId || "default"}`);

  // 2. Configurar Headers de Autenticação
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  if (provider === "focusnfe") {
    const authHeader = `Basic ${Buffer.from(`${effectiveApiKey}:`).toString("base64")}`;
    headers["Authorization"] = authHeader;
    headers["x-api-key"] = effectiveApiKey;
  } else {
    headers["x-api-key"] = effectiveApiKey;
    headers["Authorization"] = `Bearer ${effectiveApiKey}`;
  }

  // 3. Montar Endpoints da API Fiscal
  const endpoints = provider === "focusnfe"
    ? [`${effectiveBaseUrl}/nfe?ref=${encodeURIComponent(payload.referenciaExterna || "")}`]
    : [
        `${effectiveBaseUrl}/nfe/emitir`,
        `${effectiveBaseUrl}/nfe`,
        "https://platform.notaas.com.br/api/v1/nfe/emitir",
      ];

  let lastError: any = null;
  let responseData: any = null;
  let statusHttp = 500;

  for (const endpoint of endpoints) {
    try {
      console.info(`🌐 Tentando conexão Servidor -> Servidor com: ${endpoint}`);
      const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      statusHttp = resp.status;
      responseData = await resp.json().catch(() => ({}));

      if (resp.ok || resp.status === 201 || resp.status === 202) {
        console.info(`✅ [SUCESSO NOTAAS HTTP ${resp.status}]`, responseData);
        break;
      } else {
        console.warn(`⚠️ [RESPOSTA NOTAAS HTTP ${resp.status}]`, responseData);
        break;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`⚠️ Falha ao conectar em ${endpoint}:`, err.message);
    }
  }

  // 4. Gravar log de emissão e atualizar o pedido no Firestore
  if (companyId && (orderId || payload.referenciaExterna)) {
    try {
      const invoiceId = responseData?.id || responseData?.invoiceId || responseData?.protocolo || `INV-${Date.now()}`;
      const chaveNfe = responseData?.chave || responseData?.chave_acesso || responseData?.chaveNFe || "";
      const nfeStatus = (statusHttp === 200 || statusHttp === 201 || responseData?.status === "AUTORIZADA")
        ? "AUTORIZADA"
        : (statusHttp === 202 || responseData?.status === "PROCESSANDO")
        ? "PROCESSANDO"
        : "ERRO";

      // Gravar histórico fiscal
      await db.collection(`fiscal_invoices_${companyId}`).doc(invoiceId).set({
        invoiceId,
        orderId: orderId || payload.referenciaExterna,
        reference: payload.referenciaExterna,
        chaveNfe,
        status: nfeStatus,
        statusHttp,
        provider,
        payload,
        response: responseData,
        emittedAt: new Date().toISOString(),
      }, { merge: true });

      // Atualizar o pedido de venda se o orderId for conhecido
      if (orderId) {
        await db.collection(`sales_orders_${companyId}`).doc(orderId).set({
          nfeStatus,
          nfeChave: chaveNfe || undefined,
          nfeProtocolo: invoiceId,
          nfeDanfeUrl: responseData?.danfeUrl || responseData?.url_danfe || responseData?.caminho_danfe,
          nfeXmlUrl: responseData?.xmlUrl || responseData?.url_xml || responseData?.caminho_xml,
          nfeEmitidaEm: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
    } catch (dbErr) {
      console.warn("⚠️ Erro ao persistir histórico fiscal no Firestore:", dbErr);
    }
  }

  if (!responseData && lastError) {
    throw new HttpsError("unavailable", `Falha de conexão com a API Fiscal: ${lastError.message}`);
  }

  return {
    statusHttp,
    success: statusHttp === 200 || statusHttp === 201 || statusHttp === 202,
    data: responseData,
  };
});

/**
 * 🔔 Cloud Function: notaasWebhook (HTTPS Request / Endpoint Público)
 * Recebe notificações assíncronas de status da Nótass/Focus e atualiza o Firestore em tempo real.
 */
export const notaasWebhook = onRequest({
  cors: true,
}, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido. Use POST." });
    return;
  }

  try {
    const event = (req.headers["x-notaas-event"] as string) || req.body?.event || req.body?.tipo_evento || "invoice.update";
    const data = req.body?.data || req.body?.invoice || req.body || {};
    const externalReference = data.externalReference || data.referencia || data.ref || req.body?.referencia;
    const companyId = req.query.companyId as string || data.companyId || "matriz-demo";

    console.info(`🔔 [WEBHOOK NOTAAS RECEBIDO] Evento: ${event} | Ref: ${externalReference}`);

    const statusMap: Record<string, string> = {
      "invoice.authorized": "AUTORIZADA",
      "invoice.issued": "AUTORIZADA",
      "autorizado": "AUTORIZADA",
      "invoice.rejected": "REJEITADA",
      "invoice.error": "ERRO",
      "rejeitado": "REJEITADA",
      "erro_autorizacao": "REJEITADA",
      "invoice.canceled": "CANCELADA",
      "cancelado": "CANCELADA",
      "invoice.processing": "PROCESSANDO",
      "processando_autorizacao": "PROCESSANDO",
    };

    const statusTraduzido = statusMap[event] || statusMap[data.status] || "PROCESSANDO";

    // Se temos a referência do pedido, atualizamos no Firestore
    if (externalReference && companyId) {
      try {
        const orderSnapshot = await db.collection(`sales_orders_${companyId}`).doc(externalReference).get();
        if (orderSnapshot.exists) {
          await db.collection(`sales_orders_${companyId}`).doc(externalReference).set({
            nfeStatus: statusTraduzido,
            nfeChave: data.nfeKey || data.chave || data.chave_nfe || undefined,
            nfeProtocolo: data.protocol || data.protocolo || undefined,
            nfeDanfeUrl: data.danfeUrl || data.pdfUrl || data.url_danfe || data.caminho_danfe || undefined,
            nfeXmlUrl: data.xmlUrl || data.url_xml || data.caminho_xml || undefined,
            nfeMotivoRejeicao: data.rejectionReason || data.motivo_rejeicao || data.mensagem_sefaz || undefined,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          console.info(`✅ [WEBHOOK] Pedido ${externalReference} atualizado para status: ${statusTraduzido}`);
        }
      } catch (orderUpdateErr) {
        console.warn("⚠️ Falha ao atualizar pedido via Webhook:", orderUpdateErr);
      }
    }

    res.status(200).json({
      received: true,
      event,
      status: statusTraduzido,
      processedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("❌ Erro ao processar Webhook da Nótass:", err);
    res.status(500).json({ error: err.message || "Erro interno ao processar webhook" });
  }
});

/**
 * 🔍 Cloud Function: consultarNfe (HTTPS Callable)
 * Consulta o status atual de uma NF-e na SEFAZ via API do parceiro.
 */
export const consultarNfe = onCall({
  cors: true,
}, async (request) => {
  const { invoiceId, companyId, provider = "notaas", apiKey } = request.data || {};
  if (!invoiceId) {
    throw new HttpsError("invalid-argument", "ID da nota fiscal é obrigatório.");
  }

  const effectiveApiKey = apiKey || process.env.NOTAAS_API_KEY || "";
  const endpoint = provider === "focusnfe"
    ? `https://api.focusnfe.com.br/v2/nfe/${invoiceId}`
    : `https://platform.notaas.com.br/api/v1/nfe/${invoiceId}`;

  try {
    const resp = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": effectiveApiKey,
        "Authorization": `Bearer ${effectiveApiKey}`,
      },
    });

    const data = await resp.json().catch(() => ({}));
    return { statusHttp: resp.status, data };
  } catch (err: any) {
    throw new HttpsError("unavailable", `Erro na consulta da NF-e: ${err.message}`);
  }
});
