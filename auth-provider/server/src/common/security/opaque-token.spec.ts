import { generateOpaqueToken, hashOpaqueToken } from './opaque-token';

describe('opaque token helpers', () => {
  it('generates independent 256-bit URL-safe tokens', () => {
    const firstToken = generateOpaqueToken();
    const secondToken = generateOpaqueToken();

    expect(firstToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secondToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(firstToken).not.toBe(secondToken);
  });

  it('stores a deterministic hash instead of the raw token', () => {
    const token = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(token);

    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash).not.toBe(token);
    expect(hashOpaqueToken(token)).toBe(tokenHash);
  });
});
