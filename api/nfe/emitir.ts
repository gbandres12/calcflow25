export default async function handler(req: any, res: any) {
  // Configurar cabeçalhos CORS para o caso de chamadas externas ou internas
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-api-key, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    const { payload, apiKey, apiBaseUrl, provider = 'notaas' } = req.body || {};
    const effectiveApiKey = (apiKey || process.env.NOTAAS_API_KEY || '').trim();
    const effectiveBaseUrl = (apiBaseUrl || 'https://platform.notaas.com.br/api/v1').replace(/\/$/, '');

    if (!payload) {
      return res.status(400).json({ error: 'Payload da NF-e não informado no corpo da requisição.' });
    }

    console.info(`📡 [PROXY FISCAL SERVER] Transmitindo NF-e para ${provider.toUpperCase()} (Servidor -> Servidor sem CORS)`);
    console.info('📌 Referência Externa:', payload.referenciaExterna);

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

    let lastError: any = null;
    let successfulResponse: any = null;
    let successfulStatus = 500;

    for (const endpoint of endpoints) {
      try {
        console.info(`🌐 Tentando conexão com: ${endpoint}`);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });

        successfulStatus = response.status;
        const responseData = await response.json().catch(() => ({}));

        if (response.ok || response.status === 201 || response.status === 202) {
          console.info(`✅ [SUCESSO NOTAAS HTTP ${response.status}]`, responseData);
          return res.status(response.status).json(responseData);
        } else {
          console.warn(`⚠️ [RESPOSTA NOTAAS HTTP ${response.status}]`, responseData);
          return res.status(response.status).json(responseData);
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`⚠️ Falha ao conectar em ${endpoint}:`, err.message);
      }
    }

    return res.status(502).json({
      error: 'Não foi possível conectar aos servidores da API Fiscal.',
      details: lastError?.message || 'Falha de rede servidor-a-servidor'
    });
  } catch (error: any) {
    console.error('❌ Erro inesperado no proxy fiscal:', error);
    return res.status(500).json({ error: error.message || 'Erro interno no servidor proxy.' });
  }
}
