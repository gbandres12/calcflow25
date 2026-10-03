import { timingSafeEqual } from 'node:crypto';

/** A missing server secret must never enable an unauthenticated webhook. */
export function hasValidWebhookSecret(expected: string | undefined, received: unknown): boolean {
  const secret = (expected || '').trim();
  if (!secret || typeof received !== 'string') return false;
  const token = received.trim();
  if (!token) return false;
  const expectedBytes = Buffer.from(secret);
  const receivedBytes = Buffer.from(token);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}
