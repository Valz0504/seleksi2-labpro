import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyPassword } from '../common/security/password';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MfaRecoveryCodeService } from './mfa-recovery-code.service';
import { MfaSecretCryptoService } from './mfa-secret-crypto.service';
import { TotpService } from './totp.service';

interface VerifiedMfaReauthentication {
  acceptedTimeStep: bigint | null;
  recoveryCodeId: string | null;
}

class MfaManagementRaceError extends Error {}

@Injectable()
export class MfaManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secretCryptoService: MfaSecretCryptoService,
    private readonly recoveryCodeService: MfaRecoveryCodeService,
    private readonly totpService: TotpService,
  ) {}

  async regenerateRecoveryCodes(
    userId: string,
    password: string,
    code: string,
    context: RequestContext,
  ): Promise<{ recoveryCodes: string[] }> {
    const factor = await this.verifyReauthentication(userId, password, code);
    const now = new Date();
    const generated = this.recoveryCodeService.generate(userId);

    try {
      await this.prisma.$transaction(async (transaction) => {
        await this.claimFactor(transaction, userId, factor, now);
        await transaction.mfaRecoveryCode.deleteMany({ where: { userId } });
        await transaction.mfaRecoveryCode.createMany({
          data: generated.codeHashes.map((codeHash) => ({ userId, codeHash })),
        });
        await transaction.auditLog.create({
          data: {
            eventType: 'mfa_recovery_regenerated',
            actorId: userId,
            userId,
            result: 'SUCCESS',
            metadata: {
              factor: factor.recoveryCodeId === null ? 'totp' : 'recovery_code',
            },
            ipAddress: context.ipAddress,
          },
        });
      });
    } catch (error: unknown) {
      if (!(error instanceof MfaManagementRaceError)) {
        throw error;
      }

      throw this.invalidReauthenticationException();
    }

    return { recoveryCodes: generated.rawCodes };
  }

  async disable(
    userId: string,
    password: string,
    code: string,
    context: RequestContext,
  ): Promise<void> {
    const factor = await this.verifyReauthentication(userId, password, code);
    const now = new Date();

    try {
      await this.prisma.$transaction(async (transaction) => {
        await this.claimFactor(transaction, userId, factor, now);
        await transaction.mfaRecoveryCode.deleteMany({ where: { userId } });
        const removed = await transaction.userMfaTotp.deleteMany({
          where: { userId, enabledAt: { not: null } },
        });

        if (removed.count !== 1) {
          throw new MfaManagementRaceError();
        }

        await transaction.mfaLoginChallenge.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: now },
        });
        await transaction.auditLog.create({
          data: {
            eventType: 'mfa_disabled',
            actorId: userId,
            userId,
            result: 'SUCCESS',
            metadata: { method: 'self_service' },
            ipAddress: context.ipAddress,
          },
        });
      });
    } catch (error: unknown) {
      if (!(error instanceof MfaManagementRaceError)) {
        throw error;
      }

      throw this.invalidReauthenticationException();
    }
  }

  private async verifyReauthentication(
    userId: string,
    password: string,
    code: string,
  ): Promise<VerifiedMfaReauthentication> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        passwordHash: true,
        status: true,
        mfaTotp: {
          select: {
            secretCiphertext: true,
            secretIv: true,
            secretAuthTag: true,
            enabledAt: true,
            lastUsedTimeStep: true,
          },
        },
      },
    });

    if (!user || user.status !== 'ACTIVE' || user.mfaTotp?.enabledAt == null) {
      throw this.notEnabledException();
    }

    if (!(await verifyPassword(user.passwordHash, password))) {
      throw this.invalidReauthenticationException();
    }

    if (/^\d{6}$/.test(code)) {
      let acceptedTimeStep: bigint | null = null;

      try {
        const secret = this.secretCryptoService.decrypt(
          {
            ciphertext: Buffer.from(user.mfaTotp.secretCiphertext),
            iv: Buffer.from(user.mfaTotp.secretIv),
            authTag: Buffer.from(user.mfaTotp.secretAuthTag),
          },
          userId,
        );
        acceptedTimeStep = this.totpService.validateToken(
          secret,
          code,
          Date.now(),
        );
      } catch {
        acceptedTimeStep = null;
      }

      if (
        acceptedTimeStep === null ||
        (user.mfaTotp.lastUsedTimeStep !== null &&
          acceptedTimeStep <= user.mfaTotp.lastUsedTimeStep)
      ) {
        throw this.invalidReauthenticationException();
      }

      return { acceptedTimeStep, recoveryCodeId: null };
    }

    const codeHash = this.recoveryCodeService.hash(userId, code);
    const recoveryCode = codeHash
      ? await this.prisma.mfaRecoveryCode.findFirst({
          where: { userId, codeHash, usedAt: null },
          select: { id: true },
        })
      : null;

    if (!recoveryCode) {
      throw this.invalidReauthenticationException();
    }

    return { acceptedTimeStep: null, recoveryCodeId: recoveryCode.id };
  }

  private async claimFactor(
    transaction: Prisma.TransactionClient,
    userId: string,
    factor: VerifiedMfaReauthentication,
    now: Date,
  ): Promise<void> {
    const claimed =
      factor.recoveryCodeId !== null
        ? await transaction.mfaRecoveryCode.updateMany({
            where: {
              id: factor.recoveryCodeId,
              userId,
              usedAt: null,
            },
            data: { usedAt: now },
          })
        : await transaction.userMfaTotp.updateMany({
            where: {
              userId,
              enabledAt: { not: null },
              OR: [
                { lastUsedTimeStep: null },
                {
                  lastUsedTimeStep: {
                    lt: factor.acceptedTimeStep as bigint,
                  },
                },
              ],
            },
            data: { lastUsedTimeStep: factor.acceptedTimeStep as bigint },
          });

    if (claimed.count !== 1) {
      throw new MfaManagementRaceError();
    }
  }

  private invalidReauthenticationException(): UnauthorizedException {
    return new UnauthorizedException({
      error: {
        code: 'MFA_REAUTHENTICATION_FAILED',
        message: 'Password atau kode MFA tidak valid',
      },
    });
  }

  private notEnabledException(): ConflictException {
    return new ConflictException({
      error: {
        code: 'MFA_NOT_ENABLED',
        message: 'MFA belum aktif untuk akun ini',
      },
    });
  }
}
