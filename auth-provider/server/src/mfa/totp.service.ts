import { Injectable } from '@nestjs/common';
import { Secret, TOTP } from 'otpauth';
import {
  MFA_TOTP_DIGITS,
  MFA_TOTP_ISSUER,
  MFA_TOTP_PERIOD_SECONDS,
  MFA_TOTP_SECRET_BYTES,
  MFA_TOTP_WINDOW,
} from './mfa.constants';

@Injectable()
export class TotpService {
  generateSecret(): string {
    return new Secret({ size: MFA_TOTP_SECRET_BYTES }).base32;
  }

  buildProvisioningUri(email: string, secret: string): string {
    return new TOTP({
      issuer: MFA_TOTP_ISSUER,
      label: email,
      secret: Secret.fromBase32(secret),
      algorithm: 'SHA1',
      digits: MFA_TOTP_DIGITS,
      period: MFA_TOTP_PERIOD_SECONDS,
    }).toString();
  }

  generateToken(secret: string, timestamp = Date.now()): string {
    return TOTP.generate({
      secret: Secret.fromBase32(secret),
      algorithm: 'SHA1',
      digits: MFA_TOTP_DIGITS,
      period: MFA_TOTP_PERIOD_SECONDS,
      timestamp,
    });
  }

  validateToken(
    secret: string,
    token: string,
    timestamp = Date.now(),
  ): bigint | null {
    if (!/^\d{6}$/.test(token)) {
      return null;
    }

    const delta = TOTP.validate({
      token,
      secret: Secret.fromBase32(secret),
      algorithm: 'SHA1',
      digits: MFA_TOTP_DIGITS,
      period: MFA_TOTP_PERIOD_SECONDS,
      timestamp,
      window: MFA_TOTP_WINDOW,
    });

    if (delta === null) {
      return null;
    }

    return BigInt(
      TOTP.counter({ period: MFA_TOTP_PERIOD_SECONDS, timestamp }) + delta,
    );
  }
}
