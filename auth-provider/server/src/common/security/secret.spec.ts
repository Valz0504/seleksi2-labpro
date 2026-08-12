import { hashSecret } from './secret';

describe('secret hashing', () => {
  it('creates a deterministic SHA-256 digest', () => {
    const secret = 'a-high-entropy-machine-secret';
    const digest = hashSecret(secret);

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toBe(secret);
    expect(hashSecret(secret)).toBe(digest);
  });
});
