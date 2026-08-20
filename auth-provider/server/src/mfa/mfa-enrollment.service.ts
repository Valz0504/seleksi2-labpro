import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import QRCode from 'qrcode';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { MfaSecretCryptoService } from './mfa-secret-crypto.service';
import { TotpService } from './totp.service';

export interface MfaStatus {
  enabled: boolean;
  enrollmentPending: boolean;
}

export interface StartedMfaEnrollment {
  manualKey: string;
  provisioningUri: string;
  qrCodeDataUrl: string;
}

@Injectable()
export class MfaEnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secretCryptoService: MfaSecretCryptoService,
    private readonly totpService: TotpService,
  ) {}

  async getStatus(userId: string): Promise<MfaStatus> {
    const mfa = await this.prisma.userMfaTotp.findUnique({
      where: { userId },
      select: { enabledAt: true },
    });

    return {
      enabled: mfa?.enabledAt != null,
      enrollmentPending: mfa !== null && mfa.enabledAt === null,
    };
  }

  async start(userId: string, email: string): Promise<StartedMfaEnrollment> {
    const secret = this.totpService.generateSecret();
    const encrypted = this.secretCryptoService.encrypt(secret, userId);
    const secretCiphertext = new Uint8Array(encrypted.ciphertext);
    const secretIv = new Uint8Array(encrypted.iv);
    const secretAuthTag = new Uint8Array(encrypted.authTag);

    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.userMfaTotp.findUnique({
        where: { userId },
        select: { enabledAt: true },
      });

      if (existing?.enabledAt != null) {
        throw this.alreadyEnabledException();
      }

      await transaction.userMfaTotp.upsert({
        where: { userId },
        create: {
          userId,
          secretCiphertext,
          secretIv,
          secretAuthTag,
        },
        update: {
          secretCiphertext,
          secretIv,
          secretAuthTag,
          lastUsedTimeStep: null,
        },
      });
    });

    const provisioningUri = this.totpService.buildProvisioningUri(
      email,
      secret,
    );
    const qrCodeDataUrl = await QRCode.toDataURL(provisioningUri, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
    });

    return { manualKey: secret, provisioningUri, qrCodeDataUrl };
  }

  async confirm(
    userId: string,
    code: string,
    context: RequestContext,
  ): Promise<void> {
    const now = new Date();
    const enrollment = await this.prisma.userMfaTotp.findUnique({
      where: { userId },
      select: {
        secretCiphertext: true,
        secretIv: true,
        secretAuthTag: true,
        enabledAt: true,
      },
    });

    if (!enrollment || enrollment.enabledAt !== null) {
      throw this.notPendingException();
    }

    let acceptedTimeStep: bigint | null = null;

    try {
      const secret = this.secretCryptoService.decrypt(
        {
          ciphertext: Buffer.from(enrollment.secretCiphertext),
          iv: Buffer.from(enrollment.secretIv),
          authTag: Buffer.from(enrollment.secretAuthTag),
        },
        userId,
      );
      acceptedTimeStep = this.totpService.validateToken(
        secret,
        code,
        now.getTime(),
      );
    } catch {
      acceptedTimeStep = null;
    }

    if (acceptedTimeStep === null) {
      await this.auditFailedConfirmation(userId, context);
      throw this.invalidCodeException();
    }

    await this.prisma.$transaction(async (transaction) => {
      const activated = await transaction.userMfaTotp.updateMany({
        where: { userId, enabledAt: null },
        data: {
          enabledAt: now,
          lastUsedTimeStep: acceptedTimeStep,
        },
      });

      if (activated.count !== 1) {
        throw this.notPendingException();
      }

      await transaction.auditLog.create({
        data: {
          eventType: 'mfa_enrolled',
          actorId: userId,
          userId,
          result: 'SUCCESS',
          metadata: { factor: 'totp' },
          ipAddress: context.ipAddress,
        },
      });
    });
  }

  private async auditFailedConfirmation(
    userId: string,
    context: RequestContext,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        eventType: 'mfa_failed',
        userId,
        result: 'FAILED',
        metadata: { reason: 'enrollment_code_rejected' },
        ipAddress: context.ipAddress,
      },
    });
  }

  private alreadyEnabledException(): ConflictException {
    return new ConflictException({
      error: {
        code: 'MFA_ALREADY_ENABLED',
        message: 'MFA sudah aktif untuk akun ini',
      },
    });
  }

  private notPendingException(): ConflictException {
    return new ConflictException({
      error: {
        code: 'MFA_ENROLLMENT_NOT_PENDING',
        message: 'Enrollment MFA belum dimulai atau sudah selesai',
      },
    });
  }

  private invalidCodeException(): BadRequestException {
    return new BadRequestException({
      error: {
        code: 'MFA_ENROLLMENT_CODE_INVALID',
        message: 'Kode authenticator tidak valid',
      },
    });
  }
}
