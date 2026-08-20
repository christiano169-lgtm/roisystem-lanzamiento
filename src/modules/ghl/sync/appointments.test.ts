import { describe, expect, it } from 'vitest';
import { buildWindows } from './appointments.js';

describe('buildWindows', () => {
  it('covers roughly 24 months back to 6 months ahead in 6-month chunks', () => {
    const windows = buildWindows();
    expect(windows.length).toBe(5); // (24 + 6) / 6

    const now = Date.now();
    const first = windows[0]!;
    const last = windows[windows.length - 1]!;

    // ~24 months back, generous tolerance for month-length variance.
    expect(first.start).toBeLessThan(now - 23 * 30 * 24 * 60 * 60 * 1000);
    // ~6 months ahead.
    expect(last.end).toBeGreaterThan(now + 5 * 28 * 24 * 60 * 60 * 1000);
  });

  it('produces contiguous, non-overlapping windows', () => {
    const windows = buildWindows();
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i]!;
      expect(w.end).toBeGreaterThan(w.start);
      if (i > 0) {
        expect(w.start).toBe(windows[i - 1]!.end);
      }
    }
  });
});
