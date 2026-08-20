import { describe, expect, it } from 'vitest';
import { extractLeadCount, normalizeAdAccountId, type MetaAction } from './insights.js';

describe('normalizeAdAccountId', () => {
  it('leaves an already-prefixed id untouched', () => {
    expect(normalizeAdAccountId('act_123456789')).toBe('act_123456789');
  });

  it('prefixes a bare numeric id', () => {
    expect(normalizeAdAccountId('123456789')).toBe('act_123456789');
  });
});

describe('extractLeadCount', () => {
  it('sums recognized lead action types', () => {
    const actions: MetaAction[] = [
      { action_type: 'lead', value: '3' },
      { action_type: 'onsite_conversion.lead_grouped', value: '2' },
      { action_type: 'link_click', value: '50' },
    ];
    expect(extractLeadCount(actions)).toBe(5);
  });

  it('returns 0 when there are no actions', () => {
    expect(extractLeadCount(undefined)).toBe(0);
  });

  it('ignores non-lead action types entirely', () => {
    expect(extractLeadCount([{ action_type: 'post_engagement', value: '10' }])).toBe(0);
  });
});
