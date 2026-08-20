import { describe, expect, it } from 'vitest';
import { decryptToken, encryptToken } from './crypto.js';

describe('encryptToken / decryptToken', () => {
  it('round-trips a plaintext token', () => {
    const plaintext = 'ghl-access-token-abc123';
    const ciphertext = encryptToken(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(decryptToken(ciphertext)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', () => {
    const plaintext = 'same-token';
    const a = encryptToken(plaintext);
    const b = encryptToken(plaintext);
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(plaintext);
    expect(decryptToken(b)).toBe(plaintext);
  });

  it('rejects tampered ciphertext (auth tag mismatch)', () => {
    const ciphertext = encryptToken('sensitive-value');
    const bytes = Buffer.from(ciphertext, 'base64');
    const lastIndex = bytes.length - 1;
    bytes[lastIndex] = bytes[lastIndex]! ^ 0xff; // flip a bit in the encrypted payload
    const tampered = bytes.toString('base64');
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('handles empty string plaintext', () => {
    const ciphertext = encryptToken('');
    expect(decryptToken(ciphertext)).toBe('');
  });
});
