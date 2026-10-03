import assert from 'node:assert/strict';
import test from 'node:test';
import fiscalHandler from '../api/webhooks/notaas.js';
import telegramHandler from '../api/_lib/telegram/webhook.js';
import { hasValidWebhookSecret } from '../api/_lib/webhookAuth.js';

test('webhooks reject POST before processing when server secrets are missing or invalid', async () => {
  for (const [envName, headerName, handler] of [
    ['NOTAAS_WEBHOOK_SECRET', 'x-webhook-secret', fiscalHandler],
    ['TELEGRAM_WEBHOOK_SECRET', 'x-telegram-bot-api-secret-token', telegramHandler]
  ] as const) {
    const previous = process.env[envName];
    try {
      for (const [secret, token] of [[undefined, 'anything'], ['', ''], ['configured', 'wrong'], ['configured', undefined]]) {
        if (secret === undefined) delete process.env[envName];
        else process.env[envName] = secret;
        let status = 0;
        let body: any;
        const res = {
          status(value: number) { status = value; return this; },
          json(value: any) { body = value; return this; }
        };
        await handler({ method: 'POST', headers: { [headerName]: token }, body: {} }, res);
        assert.equal(status, 401, envName);
        assert.equal(body.error, 'Webhook não autorizado.');
      }
    } finally {
      if (previous === undefined) delete process.env[envName];
      else process.env[envName] = previous;
    }
  }
});

test('configured secret accepts the matching token and rejects malformed headers', () => {
  assert.equal(hasValidWebhookSecret('configured', 'configured'), true);
  assert.equal(hasValidWebhookSecret('configured', ['configured']), false);
  assert.equal(hasValidWebhookSecret('configured', 'Configured'), false);
  assert.equal(hasValidWebhookSecret('   ', 'anything'), false);
});
