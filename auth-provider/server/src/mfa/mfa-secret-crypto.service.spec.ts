import { ConfigService } from '@nestjs/config';
import { MfaSecretCryptoService } from './mfa-secret-crypto.service';

describe('MfaSecretCryptoService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const service = new MfaSecretCryptoService(
    new ConfigService({
      MFA_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
    }),
  );

  it('round-trips a TOTP secret without storing plaintext', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = service.encrypt(secret, userId);

    expect(encrypted.ciphertext.toString('utf8')).not.toContain(secret);
    expect(service.decrypt(encrypted, userId)).toBe(secret);
  });

  it('rejects tampered ciphertext and a secret moved to another user', () => {
    const encrypted = service.encrypt('JBSWY3DPEHPK3PXP', userId);
    const tamperedCiphertext = Buffer.from(encrypted.ciphertext);

    tamperedCiphertext[0] ^= 1;

    expect(() =>
      service.decrypt({ ...encrypted, ciphertext: tamperedCiphertext }, userId),
    ).toThrow();
    expect(() =>
      service.decrypt(encrypted, '22222222-2222-4222-8222-222222222222'),
    ).toThrow();
  });
});
