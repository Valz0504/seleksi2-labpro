import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { MfaEnrollmentService } from './mfa-enrollment.service';
import { MfaSecretCryptoService } from './mfa-secret-crypto.service';
import { TotpService } from './totp.service';

describe('MfaEnrollmentService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const encrypted = {
    ciphertext: Buffer.from('encrypted-secret'),
    iv: Buffer.alloc(12, 1),
    authTag: Buffer.alloc(16, 2),
  };
  const prisma = {
    userMfaTotp: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const cryptoService = {
    encrypt: jest.fn(),
    decrypt: jest.fn(),
  };
  const totpService = {
    generateSecret: jest.fn(),
    buildProvisioningUri: jest.fn(),
    validateToken: jest.fn(),
  };
  let service: MfaEnrollmentService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
    prisma.userMfaTotp.upsert.mockResolvedValue({});
    prisma.userMfaTotp.updateMany.mockResolvedValue({ count: 1 });
    prisma.auditLog.create.mockResolvedValue({});
    cryptoService.encrypt.mockReturnValue(encrypted);
    cryptoService.decrypt.mockReturnValue('JBSWY3DPEHPK3PXP');
    totpService.generateSecret.mockReturnValue('JBSWY3DPEHPK3PXP');
    totpService.buildProvisioningUri.mockReturnValue(
      'otpauth://totp/Labpro%20Auth%20Provider:user%40example.com?secret=JBSWY3DPEHPK3PXP',
    );
    totpService.validateToken.mockReturnValue(123n);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaEnrollmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: MfaSecretCryptoService, useValue: cryptoService },
        { provide: TotpService, useValue: totpService },
      ],
    }).compile();

    service = module.get(MfaEnrollmentService);
  });

  it('reports disabled, pending, and enabled states without returning a secret', async () => {
    prisma.userMfaTotp.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ enabledAt: null })
      .mockResolvedValueOnce({ enabledAt: new Date() });

    await expect(service.getStatus(userId)).resolves.toEqual({
      enabled: false,
      enrollmentPending: false,
    });
    await expect(service.getStatus(userId)).resolves.toEqual({
      enabled: false,
      enrollmentPending: true,
    });
    await expect(service.getStatus(userId)).resolves.toEqual({
      enabled: true,
      enrollmentPending: false,
    });
  });

  it('stores only encrypted enrollment state and returns a scannable QR', async () => {
    prisma.userMfaTotp.findUnique.mockResolvedValue(null);

    const result = await service.start(userId, 'user@example.com');
    const upsertCalls = prisma.userMfaTotp.upsert.mock
      .calls as unknown as Array<
      [{ create: Record<string, unknown>; update: Record<string, unknown> }]
    >;
    const upsertCall = upsertCalls[0]?.[0];

    expect(result.manualKey).toBe('JBSWY3DPEHPK3PXP');
    expect(result.provisioningUri).toMatch(/^otpauth:\/\/totp\//);
    expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(JSON.stringify(upsertCall)).not.toContain('JBSWY3DPEHPK3PXP');
    expect(cryptoService.encrypt).toHaveBeenCalledWith(
      'JBSWY3DPEHPK3PXP',
      userId,
    );
  });

  it('does not replace an already active MFA secret', async () => {
    prisma.userMfaTotp.findUnique.mockResolvedValue({ enabledAt: new Date() });

    await expect(
      service.start(userId, 'user@example.com'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.userMfaTotp.upsert).not.toHaveBeenCalled();
  });

  it('activates MFA and audits enrollment without the code or secret', async () => {
    prisma.userMfaTotp.findUnique.mockResolvedValue({
      ...encrypted,
      secretCiphertext: encrypted.ciphertext,
      secretIv: encrypted.iv,
      secretAuthTag: encrypted.authTag,
      enabledAt: null,
    });

    await service.confirm(userId, '123456', { ipAddress: '127.0.0.1' });

    const updateCalls = prisma.userMfaTotp.updateMany.mock
      .calls as unknown as Array<
      [
        {
          where: { userId: string; enabledAt: null };
          data: { enabledAt: Date; lastUsedTimeStep: bigint };
        },
      ]
    >;
    const updateCall = updateCalls[0]?.[0];

    expect(updateCall).toMatchObject({
      where: { userId, enabledAt: null },
      data: {
        lastUsedTimeStep: 123n,
      },
    });
    expect(updateCall?.data.enabledAt).toBeInstanceOf(Date);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        eventType: 'mfa_enrolled',
        actorId: userId,
        userId,
        result: 'SUCCESS',
        metadata: { factor: 'totp' },
        ipAddress: '127.0.0.1',
      },
    });
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
      '123456',
    );
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
      'JBSWY3DPEHPK3PXP',
    );
  });

  it('keeps MFA disabled and safely audits an invalid first code', async () => {
    prisma.userMfaTotp.findUnique.mockResolvedValue({
      secretCiphertext: encrypted.ciphertext,
      secretIv: encrypted.iv,
      secretAuthTag: encrypted.authTag,
      enabledAt: null,
    });
    totpService.validateToken.mockReturnValue(null);

    await expect(
      service.confirm(userId, '000000', { ipAddress: '127.0.0.1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.userMfaTotp.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        eventType: 'mfa_failed',
        userId,
        result: 'FAILED',
        metadata: { reason: 'enrollment_code_rejected' },
        ipAddress: '127.0.0.1',
      },
    });
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
      '000000',
    );
  });
});
