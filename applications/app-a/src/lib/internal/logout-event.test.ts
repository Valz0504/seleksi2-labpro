import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fingerprintRevocationEvent, parseRevocationEvent } from '@seleksi/shared';
import { createInternalLogoutPlan } from './logout-plan';

const baseEvent = {
  eventId: '11111111-1111-4111-8111-111111111111',
  eventType: 'SessionRevoked',
  userId: '22222222-2222-4222-8222-222222222222',
  centralSessionId: '33333333-3333-4333-8333-333333333333',
  applicationId: null,
  reason: 'sso_logout',
  occurredAt: '2026-08-16T09:00:00Z',
  metadata: { delivery: { attempt: 1 }, source: 'auth-provider' },
};

describe('App A internal logout event', () => {
  it('validates the shared SessionRevoked contract and central-session target', () => {
    const event = parseRevocationEvent(baseEvent);

    assert.equal(event.occurredAt, '2026-08-16T09:00:00.000Z');
    assert.deepEqual(createInternalLogoutPlan(event), {
      externalUserId: baseEvent.userId,
      centralSessionId: baseEvent.centralSessionId,
      revokeReason: 'sso_logout',
      activityMessage: 'Local session dicabut setelah central session direvoke',
    });
  });

  it('targets every user session for password and access-policy changes', () => {
    const passwordEvent = parseRevocationEvent({
      ...baseEvent,
      eventType: 'PasswordChanged',
      centralSessionId: null,
      reason: 'password_changed',
    });
    const policyEvent = parseRevocationEvent({
      ...baseEvent,
      eventType: 'AccessPolicyChanged',
      centralSessionId: null,
      applicationId: '44444444-4444-4444-8444-444444444444',
      reason: 'policy_removed',
    });

    assert.deepEqual(createInternalLogoutPlan(passwordEvent), {
      externalUserId: baseEvent.userId,
      revokeReason: 'password_changed',
      activityMessage: 'Local session dicabut setelah password user berubah',
    });
    assert.deepEqual(createInternalLogoutPlan(policyEvent), {
      externalUserId: baseEvent.userId,
      revokeReason: 'access_policy_changed',
      activityMessage: 'Local session dicabut setelah akses aplikasi berubah',
    });
  });

  it('creates a stable semantic fingerprint independent of metadata key order', () => {
    const first = parseRevocationEvent(baseEvent);
    const reordered = parseRevocationEvent({
      ...baseEvent,
      metadata: { source: 'auth-provider', delivery: { attempt: 1 } },
    });

    assert.equal(fingerprintRevocationEvent(first), fingerprintRevocationEvent(reordered));
    assert.notEqual(
      fingerprintRevocationEvent(first),
      fingerprintRevocationEvent({ ...reordered, reason: 'admin_revocation' }),
    );
  });

  it('rejects malformed fields, extra fields, and non-JSON metadata', () => {
    assert.throws(() => parseRevocationEvent({ ...baseEvent, eventId: 'not-a-uuid' }));
    assert.throws(() => parseRevocationEvent({ ...baseEvent, reason: 'has spaces' }));
    assert.throws(() => parseRevocationEvent({ ...baseEvent, unexpected: true }));
    assert.throws(() => parseRevocationEvent({ ...baseEvent, metadata: { bad: undefined } }));
  });

  it('rejects event targets that contradict their event type', () => {
    assert.throws(() => parseRevocationEvent({ ...baseEvent, eventType: 'PasswordChanged' }));
    assert.throws(() =>
      parseRevocationEvent({
        ...baseEvent,
        eventType: 'AccessPolicyChanged',
        centralSessionId: null,
        applicationId: null,
      }),
    );
  });
});
