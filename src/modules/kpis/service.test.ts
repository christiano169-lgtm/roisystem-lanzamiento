import { describe, expect, it } from 'vitest';
import { average, pct } from './service.js';

describe('pct', () => {
  it('computes a percentage rounded to one decimal', () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(2, 3)).toBe(66.7);
    expect(pct(1, 2)).toBe(50);
  });

  it('returns 0 for a zero or negative denominator instead of dividing by zero', () => {
    expect(pct(5, 0)).toBe(0);
    expect(pct(5, -1)).toBe(0);
  });

  it('returns 0 when numerator is 0', () => {
    expect(pct(0, 10)).toBe(0);
  });
});

describe('average', () => {
  it('averages a list of numbers', () => {
    expect(average([1, 2, 3])).toBe(2);
    expect(average([10])).toBe(10);
  });

  it('returns null for an empty list instead of NaN', () => {
    expect(average([])).toBeNull();
  });
});
