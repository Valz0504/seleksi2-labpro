import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generateLocalSessionToken,
  hashLocalSessionToken,
  isLocalSessionToken,
} from './session-token';

describe('App A local session token', () => {
  it('generates an opaque token and persists only a deterministic SHA-256 hash', () => {
    const firstToken = generateLocalSessionToken();
    const secondToken = generateLocalSessionToken();
    const tokenHash = hashLocalSessionToken(firstToken);

    assert.match(firstToken, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(firstToken, secondToken);
    assert.match(tokenHash, /^[a-f0-9]{64}$/);
    assert.notEqual(tokenHash, firstToken);
    assert.equal(hashLocalSessionToken(firstToken), tokenHash);
    assert.equal(isLocalSessionToken(firstToken), true);
    assert.equal(isLocalSessionToken('not-a-valid-session-token'), false);
  });
});
