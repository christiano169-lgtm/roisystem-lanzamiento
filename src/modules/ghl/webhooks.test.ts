import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isSignatureValid } from './webhooks.js';

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('isSignatureValid', () => {
  const secret = 'test-webhook-secret';
  const body = JSON.stringify({ type: 'ContactCreate', locationId: 'loc_1' });

  it('accepts a correctly signed body', () => {
    expect(isSignatureValid(body, sign(secret, body), secret)).toBe(true);
  });

  it('rejects a body signed with the wrong secret', () => {
    expect(isSignatureValid(body, sign('a-different-secret', body), secret)).toBe(false);
  });

  it('rejects a tampered body with a stale signature', () => {
    const validSig = sign(secret, body);
    const tamperedBody = JSON.stringify({ type: 'ContactCreate', locationId: 'loc_2' });
    expect(isSignatureValid(tamperedBody, validSig, secret)).toBe(false);
  });

  it('rejects a missing signature when a secret is configured', () => {
    expect(isSignatureValid(body, undefined, secret)).toBe(false);
  });

  it('skips verification (accepts anything) when no secret is configured', () => {
    expect(isSignatureValid(body, undefined, '')).toBe(true);
  });
});
