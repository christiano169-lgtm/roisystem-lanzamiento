import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './passwords.js';

describe('hashPassword / verifyPassword', () => {
  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('correctHorseBatteryStaple');
    expect(await verifyPassword('correctHorseBatteryStaple', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correctHorseBatteryStaple');
    expect(await verifyPassword('wrongPassword', hash)).toBe(false);
  });

  it('never stores the password in plaintext', async () => {
    const hash = await hashPassword('correctHorseBatteryStaple');
    expect(hash).not.toContain('correctHorseBatteryStaple');
  });
});
