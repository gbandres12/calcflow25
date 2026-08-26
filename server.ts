import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Proxy de Emissão de NF-e (Server-to-Server / Anti-CORS)
  app.post("/api/nfe/emitir", async (req, res) => {
    try {
      const { payload, apiKey, apiBaseUrl, provider = 'notaas' } = req.body || {};
      const effectiveApiKey = (apiKey || process.env.NOTAAS_API_KEY || '').trim();
      const effectiveBaseUrl = (apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');

      if (!payload) {
        return res.status(400).json({ error: 'Payload da NF-e não informado.' });
      }

      console.info(`📡 [PROXY FISCAL SERVER.TS] Transmitindo NF-e para ${provider.toUpperCase()}`);

      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };

      if (provider === 'focusnfe') {
        const authHeader = `Basic ${Buffer.from(`${effectiveApiKey}:`).toString('base64')}`;
        headers['Authorization'] = authHeader;
        headers['x-api-key'] = effectiveApiKey;
      } else {
        headers['x-api-key'] = effectiveApiKey;
        headers['Authorization'] = `Bearer ${effectiveApiKey}`;
      }

      const endpoints = provider === 'focusnfe' 
        ? [`${effectiveBaseUrl}/nfe?ref=${encodeURIComponent(payload.referenciaExterna || '')}`]
        : [
            `${effectiveBaseUrl}/nfe/emitir`,
            `${effectiveBaseUrl}/nfe`,
            'https://platform.notaas.com.br/api/v1/nfe/emitir'
          ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          });

          const responseData = await response.json().catch(() => ({}));
          return res.status(response.status).json(responseData);
        } catch (err: any) {
          console.warn(`⚠️ Falha ao conectar em ${endpoint}:`, err.message);
        }
      }

      return res.status(502).json({ error: 'Falha de comunicação com a API Fiscal.' });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Erro interno no servidor proxy.' });
    }
  });

  // Webhook Nótass Endpoint (POST)
  app.post("/api/webhooks/notaas", (req, res) => {
    const event = (req.headers["x-notaas-event"] as string) || req.body?.event || "test.ping";
    console.info(`📡 [WEBHOOK NÓTASS] Recebido evento: ${event}`, req.body);

    // Responder HTTP 200 OK para confirmação
    res.status(200).json({
      status: "received",
      event: event,
      timestamp: new Date().toISOString()
    });
  });

  // Healthcheck / Ping (GET)
  app.get("/api/webhooks/notaas", (req, res) => {
    res.status(200).json({
      status: "ok",
      service: "Calcário Flow ERP - Webhook Nótass",
      timestamp: new Date().toISOString()
    });
  });

  // Generic API Healthcheck
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "Calcário Flow ERP" });
  });

  // Vite middleware para ambiente de desenvolvimento
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor ERP executando em http://localhost:${PORT}`);
  });
}

startServer();
