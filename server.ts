import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import emitirNfe from "./api/nfe/emitir";
import consultarNfe from "./api/nfe/consultar";
import cancelarNfe from "./api/nfe/cancelar";
import statusNfe from "./api/nfe/status";
import notaasWebhook from "./api/webhooks/notaas";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "2mb" }));

  app.post("/api/nfe/emitir", (req, res) => emitirNfe(req, res));
  app.post("/api/nfe/consultar", (req, res) => consultarNfe(req, res));
  app.post("/api/nfe/cancelar", (req, res) => cancelarNfe(req, res));
  app.post("/api/nfe/status", (req, res) => statusNfe(req, res));
  app.get("/api/nfe/status", (req, res) => statusNfe(req, res));
  app.post("/api/webhooks/notaas", (req, res) => notaasWebhook(req, res));
  app.get("/api/webhooks/notaas", (req, res) => notaasWebhook(req, res));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "Calcário Flow ERP" });
  });

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
    console.log(`Servidor ERP executando em http://localhost:${PORT}`);
  });
}

startServer();
