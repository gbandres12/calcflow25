/**
 * Registra a URL do webhook no bot do Telegram.
 *
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
 *   npx tsx scripts/telegram-set-webhook.ts https://calcflow25.vercel.app
 *
 * Passe a URL base do deploy; o script completa com /api/telegram/webhook.
 */

const baseUrl = (process.argv[2] || process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();

async function main() {
  if (!token) throw new Error('Defina TELEGRAM_BOT_TOKEN no ambiente.');
  if (!baseUrl) throw new Error('Informe a URL base: npx tsx scripts/telegram-set-webhook.ts https://seu-app.vercel.app');
  if (!secret) {
    console.warn('Aviso: sem TELEGRAM_WEBHOOK_SECRET qualquer um consegue postar no seu webhook.');
  }

  const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json());
  if (!me?.ok) throw new Error(`Token rejeitado pelo Telegram: ${me?.description || 'erro desconhecido'}`);
  console.log(`Bot: @${me.result.username} (${me.result.first_name})`);

  const url = `${baseUrl}/api/telegram/webhook`;
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: secret || undefined,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true
    })
  }).then((r) => r.json());

  if (!response?.ok) throw new Error(`setWebhook falhou: ${response?.description || 'erro desconhecido'}`);
  console.log(`Webhook registrado em ${url}`);

  const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((r) => r.json());
  console.log('getWebhookInfo:', JSON.stringify(info?.result, null, 2));
  console.log(`\nDefina TELEGRAM_BOT_USERNAME=${me.result.username} nas variáveis do projeto.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
