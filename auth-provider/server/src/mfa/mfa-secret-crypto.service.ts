import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MFA_SECRET_IV_BYTES } from './mfa.constants';

export interface EncryptedMfaSecret {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

@Injectable()
export class MfaSecretCryptoService {
  private readonly encryptionKey: Buffer;

  constructor(configService: ConfigService) {
    this.encryptionKey = Buffer.from(
      configService.getOrThrow<string>('MFA_ENCRYPTION_KEY'),
      'hex',
    );
  }

  encrypt(secret: string, userId: string): EncryptedMfaSecret {
    const iv = randomBytes(MFA_SECRET_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    cipher.setAAD(this.additionalAuthenticatedData(userId));

    return {
      ciphertext: Buffer.concat([
        cipher.update(secret, 'utf8'),
        cipher.final(),
      ]),
      iv,
      authTag: cipher.getAuthTag(),
    };
  }

  decrypt(encryptedSecret: EncryptedMfaSecret, userId: string): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      encryptedSecret.iv,
    );

    decipher.setAAD(this.additionalAuthenticatedData(userId));
    decipher.setAuthTag(encryptedSecret.authTag);

    return Buffer.concat([
      decipher.update(encryptedSecret.ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }

  private additionalAuthenticatedData(userId: string): Buffer {
    return Buffer.from(`mfa-totp:${userId}`, 'utf8');
  }
}
