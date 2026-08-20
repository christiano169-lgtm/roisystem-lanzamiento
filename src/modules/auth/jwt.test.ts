import { describe, expect, it } from 'vitest';
import { signAuthToken, verifyAuthToken } from './jwt.js';

describe('signAuthToken / verifyAuthToken', () => {
  it('round-trips the payload', () => {
    const token = signAuthToken({ sub: 'user_1', tenantId: 'tenant_1', role: 'admin', isPlatformAdmin: false });
    const decoded = verifyAuthToken(token);
    expect(decoded.sub).toBe('user_1');
    expect(decoded.tenantId).toBe('tenant_1');
    expect(decoded.role).toBe('admin');
  });

  it('rejects a tampered token', () => {
    const token = signAuthToken({ sub: 'user_1', tenantId: 'tenant_1', role: 'asesor', isPlatformAdmin: false });
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'aa' ? 'bb' : 'aa');
    expect(() => verifyAuthToken(tampered)).toThrow();
  });

  it('rejects a garbage token', () => {
    expect(() => verifyAuthToken('not-a-real-jwt')).toThrow();
  });
});
