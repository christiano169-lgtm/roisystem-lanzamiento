import { describe, expect, it } from 'vitest';
import { buildWriteBackNote, interestBucket, interestBucketTag, objectionTag } from './writeback.js';

describe('interestBucket', () => {
  it('is the canonical bucket the GHL tag and stage-automation rule lookup both derive from', () => {
    expect(interestBucket(70)).toBe('alto');
    expect(interestBucket(40)).toBe('medio');
    expect(interestBucket(0)).toBe('bajo');
  });
});

describe('interestBucketTag', () => {
  it('buckets high interest', () => {
    expect(interestBucketTag(70)).toBe('ia-interes-alto');
    expect(interestBucketTag(95)).toBe('ia-interes-alto');
  });

  it('buckets medium interest', () => {
    expect(interestBucketTag(40)).toBe('ia-interes-medio');
    expect(interestBucketTag(69)).toBe('ia-interes-medio');
  });

  it('buckets low interest', () => {
    expect(interestBucketTag(0)).toBe('ia-interes-bajo');
    expect(interestBucketTag(39)).toBe('ia-interes-bajo');
  });
});

describe('objectionTag', () => {
  it('prefixes the fixed objection category into a GHL-safe tag', () => {
    expect(objectionTag('precio')).toBe('objecion-precio');
    expect(objectionTag('competencia')).toBe('objecion-competencia');
  });
});

describe('buildWriteBackNote', () => {
  it('includes the channel, scores, summary, and improvement notes', () => {
    const note = buildWriteBackNote({
      channel: 'call',
      interestScorePct: 82,
      qualityScore: 7.5,
      summary: 'El lead mostró interés pero pidió tiempo para decidir.',
      improvementNotes: 'Cerrar con mayor urgencia.',
    });
    expect(note).toContain('llamada');
    expect(note).toContain('82%');
    expect(note).toContain('7.5/10');
    expect(note).toContain('El lead mostró interés');
    expect(note).toContain('Cerrar con mayor urgencia.');
  });

  it('omits summary/improvement sections when null', () => {
    const note = buildWriteBackNote({
      channel: 'chat',
      interestScorePct: 10,
      qualityScore: 2,
      summary: null,
      improvementNotes: null,
    });
    expect(note).not.toContain('Resumen:');
    expect(note).not.toContain('Aspectos de mejora');
  });
});
