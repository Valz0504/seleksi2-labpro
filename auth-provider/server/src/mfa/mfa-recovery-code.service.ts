import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { hashSecret } from '../common/security/secret';
import {
  MFA_RECOVERY_CODE_CHARACTERS,
  MFA_RECOVERY_CODE_COUNT,
} from './mfa.constants';

const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{12}$/;

export interface GeneratedRecoveryCodes {
  rawCodes: string[];
  codeHashes: string[];
}

@Injectable()
export class MfaRecoveryCodeService {
  generate(userId: string): GeneratedRecoveryCodes {
    const compactCodes = new Set<string>();

    while (compactCodes.size < MFA_RECOVERY_CODE_COUNT) {
      compactCodes.add(this.generateCompactCode());
    }

    const rawCodes = [...compactCodes].map((code) => this.format(code));

    return {
      rawCodes,
      codeHashes: rawCodes.map((code) => this.hash(userId, code) as string),
    };
  }

  hash(userId: string, input: string): string | null {
    const normalized = this.normalize(input);

    return normalized === null
      ? null
      : hashSecret(`mfa-recovery:${userId}:${normalized}`);
  }

  normalize(input: string): string | null {
    const normalized = input.trim().toUpperCase().replaceAll('-', '');

    return RECOVERY_CODE_PATTERN.test(normalized) ? normalized : null;
  }

  private generateCompactCode(): string {
    return Array.from({ length: MFA_RECOVERY_CODE_CHARACTERS }, () =>
      RECOVERY_CODE_ALPHABET.charAt(randomInt(RECOVERY_CODE_ALPHABET.length)),
    ).join('');
  }

  private format(code: string): string {
    return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
  }
}
