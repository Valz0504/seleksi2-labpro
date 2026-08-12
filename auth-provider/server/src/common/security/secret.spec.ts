import { hashSecret, verifySecret } from './secret';

describe('secret hashing', () => {
  it('creates a deterministic SHA-256 digest', () => {
    const secret = 'a-high-entropy-machine-secret';
    const digest = hashSecret(secret);

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toBe(secret);
    expect(hashSecret(secret)).toBe(digest);
  });

  it('compares a raw secret with its stored hash', () => {
    const storedHash = hashSecret('correct-client-secret');

    expect(verifySecret('correct-client-secret', storedHash)).toBe(true);
    expect(verifySecret('wrong-client-secret', storedHash)).toBe(false);
    expect(verifySecret('correct-client-secret', 'malformed-hash')).toBe(false);
  });
});
