import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
