import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyLocalSession } from './local-session-state';

const now = new Date('2026-08-16T08:00:00.000Z');

describe('App A local session lifecycle', () => {
  it('keeps a non-revoked active session before its expiry', () => {
    assert.equal(
      classifyLocalSession(
        {
          status: 'ACTIVE',
          expiresAt: new Date('2026-08-16T09:00:00.000Z'),
          revokedAt: null,
        },
        now,
      ),
      'ACTIVE',
    );
  });

  it('treats elapsed time or an expired status as expired', () => {
    assert.equal(
      classifyLocalSession(
        {
          status: 'ACTIVE',
          expiresAt: new Date('2026-08-16T08:00:00.000Z'),
          revokedAt: null,
        },
        now,
      ),
      'EXPIRED',
    );
    assert.equal(
      classifyLocalSession(
        {
          status: 'EXPIRED',
          expiresAt: new Date('2026-08-16T09:00:00.000Z'),
          revokedAt: null,
        },
        now,
      ),
      'EXPIRED',
    );
  });

  it('prioritizes explicit revocation over expiry', () => {
    assert.equal(
      classifyLocalSession(
        {
          status: 'ACTIVE',
          expiresAt: new Date('2026-08-16T07:00:00.000Z'),
          revokedAt: new Date('2026-08-16T06:00:00.000Z'),
        },
        now,
      ),
      'REVOKED',
    );
  });
});
