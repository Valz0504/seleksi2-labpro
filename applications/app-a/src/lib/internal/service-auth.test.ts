import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isInternalServiceAuthorized } from './service-auth';

const secret = 'test-only-internal-service-secret';

describe('App A internal service authentication', () => {
  it('accepts the exact Bearer service secret', () => {
    assert.equal(isInternalServiceAuthorized(`Bearer ${secret}`, secret), true);
    assert.equal(isInternalServiceAuthorized(`bearer ${secret}`, secret), true);
  });

  it('rejects missing and incorrect credentials', () => {
    assert.equal(isInternalServiceAuthorized(null, secret), false);
    assert.equal(isInternalServiceAuthorized('Bearer another-secret-value', secret), false);
  });

  it('rejects ambiguous Bearer header formatting', () => {
    assert.equal(isInternalServiceAuthorized(`Bearer  ${secret}`, secret), false);
    assert.equal(isInternalServiceAuthorized(`Bearer ${secret} extra`, secret), false);
    assert.equal(isInternalServiceAuthorized(`Basic ${secret}`, secret), false);
  });
});
