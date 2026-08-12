import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('hashes passwords using Argon2id', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(
      verifyPassword(hash, 'correct horse battery staple'),
    ).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct password');

    await expect(verifyPassword(hash, 'incorrect password')).resolves.toBe(
      false,
    );
  });
});
