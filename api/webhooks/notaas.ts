export default function handler(req: any, res: any) {
  // Tratar requisição POST do Nótass
  if (req.method === 'POST') {
    const event = req.headers['x-notaas-event'] || req.body?.event || 'test.ping';
    console.info(`📡 [WEBHOOK NÓTASS] Recebido evento: ${event}`, req.body);

    return res.status(200).json({
      status: 'received',
      event: event,
      timestamp: new Date().toISOString()
    });
  }

  // Resposta para teste GET
  return res.status(200).json({
    status: 'ok',
    service: 'Calcário Flow ERP - Webhook Nótass',
    timestamp: new Date().toISOString()
  });
}
