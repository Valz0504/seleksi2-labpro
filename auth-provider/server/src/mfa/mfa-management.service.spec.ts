import { UnauthorizedException } from '@nestjs/common';
import { hashPassword } from '../common/security/password';
import { PrismaService } from '../database/prisma.service';
import { MfaManagementService } from './mfa-management.service';
import { MfaRecoveryCodeService } from './mfa-recovery-code.service';
import { MfaSecretCryptoService } from './mfa-secret-crypto.service';
import { TotpService } from './totp.service';

describe('MfaManagementService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const transaction = {
    userMfaTotp: { updateMany: jest.fn(), deleteMany: jest.fn() },
    mfaRecoveryCode: {
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    mfaLoginChallenge: { updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    mfaRecoveryCode: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const cryptoService = { decrypt: jest.fn() };
  const recoveryCodeService = {
    generate: jest.fn(),
    hash: jest.fn(),
  };
  const totpService = { validateToken: jest.fn() };
  let service: MfaManagementService;
  const latestAudit = () => {
    const calls = transaction.auditLog.create.mock.calls as unknown as Array<
      [
        {
          data: {
            eventType: string;
            metadata: Record<string, unknown>;
          };
        },
      ]
    >;

    return calls.at(-1)?.[0].data;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      passwordHash: await hashPassword('correct-password'),
      status: 'ACTIVE',
      mfaTotp: {
        secretCiphertext: Buffer.from('ciphertext'),
        secretIv: Buffer.alloc(12, 1),
        secretAuthTag: Buffer.alloc(16, 2),
        enabledAt: new Date(),
        lastUsedTimeStep: 100n,
      },
    });
    prisma.$transaction.mockImplementation(
      (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    transaction.userMfaTotp.updateMany.mockResolvedValue({ count: 1 });
    transaction.userMfaTotp.deleteMany.mockResolvedValue({ count: 1 });
    transaction.mfaRecoveryCode.updateMany.mockResolvedValue({ count: 1 });
    transaction.mfaRecoveryCode.deleteMany.mockResolvedValue({ count: 8 });
    transaction.mfaRecoveryCode.createMany.mockResolvedValue({ count: 2 });
    transaction.mfaLoginChallenge.updateMany.mockResolvedValue({ count: 0 });
    transaction.auditLog.create.mockResolvedValue({});
    cryptoService.decrypt.mockReturnValue('JBSWY3DPEHPK3PXP');
    totpService.validateToken.mockReturnValue(101n);
    recoveryCodeService.generate.mockReturnValue({
      rawCodes: ['ABCD-EFGH-JKMP', 'QRST-UVWX-YZ23'],
      codeHashes: ['hash-1', 'hash-2'],
    });
    recoveryCodeService.hash.mockReturnValue('old-code-hash');

    service = new MfaManagementService(
      prisma as unknown as PrismaService,
      cryptoService as unknown as MfaSecretCryptoService,
      recoveryCodeService as unknown as MfaRecoveryCodeService,
      totpService as unknown as TotpService,
    );
  });

  it('regenerates recovery codes after password and TOTP reauthentication', async () => {
    await expect(
      service.regenerateRecoveryCodes(userId, 'correct-password', '123456', {
        ipAddress: '127.0.0.1',
      }),
    ).resolves.toEqual({
      recoveryCodes: ['ABCD-EFGH-JKMP', 'QRST-UVWX-YZ23'],
    });

    expect(transaction.userMfaTotp.updateMany).toHaveBeenCalledWith({
      where: {
        userId,
        enabledAt: { not: null },
        OR: [{ lastUsedTimeStep: null }, { lastUsedTimeStep: { lt: 101n } }],
      },
      data: { lastUsedTimeStep: 101n },
    });
    expect(transaction.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith({
      where: { userId },
    });
    expect(transaction.mfaRecoveryCode.createMany).toHaveBeenCalledWith({
      data: [
        { userId, codeHash: 'hash-1' },
        { userId, codeHash: 'hash-2' },
      ],
    });
    expect(latestAudit()).toMatchObject({
      eventType: 'mfa_recovery_regenerated',
      metadata: { factor: 'totp' },
    });
  });

  it('accepts an unused recovery code for reauthentication', async () => {
    prisma.mfaRecoveryCode.findFirst.mockResolvedValue({ id: 'recovery-id' });

    await service.regenerateRecoveryCodes(
      userId,
      'correct-password',
      'ABCD-EFGH-JKMP',
      {},
    );

    const recoveryUpdateCalls = transaction.mfaRecoveryCode.updateMany.mock
      .calls as unknown as Array<
      [
        {
          where: { id: string; userId: string; usedAt: null };
          data: { usedAt: Date };
        },
      ]
    >;
    const recoveryUpdate = recoveryUpdateCalls[0]?.[0];

    expect(recoveryUpdate).toMatchObject({
      where: { id: 'recovery-id', userId, usedAt: null },
    });
    expect(recoveryUpdate?.data.usedAt).toBeInstanceOf(Date);
    expect(latestAudit()).toMatchObject({
      metadata: { factor: 'recovery_code' },
    });
  });

  it('does not mutate MFA state when reauthentication fails', async () => {
    await expect(
      service.regenerateRecoveryCodes(
        userId,
        'incorrect-password',
        '123456',
        {},
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('disables MFA, removes recovery codes, and invalidates pending challenges', async () => {
    await service.disable(userId, 'correct-password', '123456', {
      ipAddress: '127.0.0.1',
    });

    expect(transaction.userMfaTotp.deleteMany).toHaveBeenCalledWith({
      where: { userId, enabledAt: { not: null } },
    });
    expect(transaction.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith({
      where: { userId },
    });
    const challengeUpdateCalls = transaction.mfaLoginChallenge.updateMany.mock
      .calls as unknown as Array<
      [
        {
          where: { userId: string; usedAt: null };
          data: { usedAt: Date };
        },
      ]
    >;
    const challengeUpdate = challengeUpdateCalls[0]?.[0];

    expect(challengeUpdate).toMatchObject({
      where: { userId, usedAt: null },
    });
    expect(challengeUpdate?.data.usedAt).toBeInstanceOf(Date);
    expect(latestAudit()).toMatchObject({
      eventType: 'mfa_disabled',
      metadata: { method: 'self_service' },
    });
  });

  it('rejects a factor that loses a one-time race', async () => {
    transaction.userMfaTotp.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.disable(userId, 'correct-password', '123456', {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(transaction.userMfaTotp.deleteMany).not.toHaveBeenCalled();
  });
});
