import {
  MFA_RECOVERY_CODE_COUNT,
  MFA_RECOVERY_CODE_CHARACTERS,
} from './mfa.constants';
import { MfaRecoveryCodeService } from './mfa-recovery-code.service';

describe('MfaRecoveryCodeService', () => {
  const service = new MfaRecoveryCodeService();
  const userId = '11111111-1111-4111-8111-111111111111';

  it('generates unique, readable codes and stores only their hashes', () => {
    const generated = service.generate(userId);

    expect(generated.rawCodes).toHaveLength(MFA_RECOVERY_CODE_COUNT);
    expect(new Set(generated.rawCodes).size).toBe(MFA_RECOVERY_CODE_COUNT);
    expect(generated.codeHashes).toHaveLength(MFA_RECOVERY_CODE_COUNT);

    for (const [index, code] of generated.rawCodes.entries()) {
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/);
      expect(code.replaceAll('-', '')).toHaveLength(
        MFA_RECOVERY_CODE_CHARACTERS,
      );
      expect(generated.codeHashes[index]).toBe(service.hash(userId, code));
      expect(generated.codeHashes[index]).not.toContain(code);
    }
  });

  it('normalizes case and separators but rejects malformed input', () => {
    expect(service.hash(userId, 'abcd-efgh-jkmp')).toBe(
      service.hash(userId, 'ABCDEFGHJKMP'),
    );
    expect(service.hash(userId, 'ABCD-EFGH-IJKL')).toBeNull();
    expect(service.hash(userId, '123456')).toBeNull();
  });

  it('binds a code hash to its owner', () => {
    expect(service.hash(userId, 'ABCD-EFGH-JKMP')).not.toBe(
      service.hash('22222222-2222-4222-8222-222222222222', 'ABCD-EFGH-JKMP'),
    );
  });
});
