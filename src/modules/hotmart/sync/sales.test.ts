import { describe, expect, it } from 'vitest';
import { transactionIdOf, type HotmartSaleItem } from './sales.js';

describe('transactionIdOf', () => {
  it('prefers the nested purchase.transaction field', () => {
    const item: HotmartSaleItem = { purchase: { transaction: 'HP123' }, transaction: 'fallback' };
    expect(transactionIdOf(item)).toBe('HP123');
  });

  it('falls back to a top-level transaction field', () => {
    const item: HotmartSaleItem = { transaction: 'HP456' };
    expect(transactionIdOf(item)).toBe('HP456');
  });

  it('returns null when no transaction id is present anywhere', () => {
    expect(transactionIdOf({})).toBeNull();
  });
});
