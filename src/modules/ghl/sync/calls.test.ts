import { describe, expect, it } from 'vitest';
import { isCallMessage } from './calls.js';

describe('isCallMessage', () => {
  it('recognizes the REST API call message type', () => {
    expect(isCallMessage({ id: '1', messageType: 'TYPE_CALL' })).toBe(true);
  });

  it('recognizes the raw webhook call message type', () => {
    expect(isCallMessage({ id: '1', messageType: 'CALL' })).toBe(true);
  });

  it('recognizes campaign/IVR/custom call variants', () => {
    for (const messageType of ['TYPE_CAMPAIGN_CALL', 'TYPE_CAMPAIGN_MANUAL_CALL', 'TYPE_IVR_CALL', 'TYPE_CUSTOM_CALL']) {
      expect(isCallMessage({ id: '1', messageType })).toBe(true);
    }
  });

  it('does not treat SMS/email/chat messages as calls', () => {
    for (const messageType of ['TYPE_SMS', 'TYPE_EMAIL', 'TYPE_WEBCHAT', 'TYPE_WHATSAPP']) {
      expect(isCallMessage({ id: '1', messageType })).toBe(false);
    }
  });

  it('handles a missing messageType', () => {
    expect(isCallMessage({ id: '1' })).toBe(false);
  });
});
