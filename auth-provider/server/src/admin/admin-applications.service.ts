import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { generateOpaqueToken } from '../common/security/opaque-token';
import { hashSecret } from '../common/security/secret';
import { PrismaService } from '../database/prisma.service';
import type { AdminActor } from './admin-request';
import { AdminRevocationService } from './admin-revocation.service';
import type { CreateApplicationDto } from './dto/create-application.dto';
import type { CreatePolicyDto } from './dto/create-policy.dto';
import type { CreateRedirectUriDto } from './dto/create-redirect-uri.dto';
import type { UpdateApplicationDto } from './dto/update-application.dto';

const APPLICATION_SELECT = {
  id: true,
  name: true,
  clientId: true,
  status: true,
  launchUrl: true,
  logoutNotificationUrl: true,
  createdAt: true,
  updatedAt: true,
  redirectUris: {
    select: {
      id: true,
      redirectUri: true,
      createdAt: true,
    },
    orderBy: { redirectUri: 'asc' as const },
  },
  groupPolicies: {
    select: {
      id: true,
      effect: true,
      createdAt: true,
      group: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
    },
    orderBy: { group: { name: 'asc' as const } },
  },
} as const;

@Injectable()
export class AdminApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revocationService: AdminRevocationService,
  ) {}

  listApplications() {
    return this.prisma.application.findMany({
      select: APPLICATION_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async getApplication(applicationId: string) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: APPLICATION_SELECT,
    });

    if (!application) {
      throw this.applicationNotFound();
    }

    return application;
  }

  async createApplication(input: CreateApplicationDto, actor: AdminActor) {
    const name = input.name.trim();
    const clientId = input.clientId.trim();
    const clientSecret = input.clientSecret ?? generateOpaqueToken();

    if (!name) {
      throw this.invalidRequest('Nama aplikasi tidak boleh kosong');
    }

    const existingApplication = await this.prisma.application.findUnique({
      where: { clientId },
      select: { id: true },
    });

    if (existingApplication) {
      throw new ConflictException({
        error: {
          code: 'CLIENT_ID_ALREADY_EXISTS',
          message: 'clientId sudah digunakan aplikasi lain',
        },
      });
    }

    return this.prisma.$transaction(async (transaction) => {
      const application = await transaction.application.create({
        data: {
          name,
          clientId,
          clientSecretHash: hashSecret(clientSecret),
          launchUrl: input.launchUrl,
          logoutNotificationUrl: input.logoutNotificationUrl,
          redirectUris: {
            create: input.redirectUris.map((redirectUri) => ({ redirectUri })),
          },
        },
        select: APPLICATION_SELECT,
      });

      await transaction.auditLog.create({
        data: {
          eventType: 'ApplicationChanged',
          actorId: actor.userId,
          applicationId: application.id,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: {
            action: 'CREATED',
            clientId: application.clientId,
            redirectUriCount: application.redirectUris.length,
          },
          ipAddress: actor.ipAddress,
        },
      });

      return { ...application, clientSecret };
    });
  }

  async updateApplication(
    applicationId: string,
    input: UpdateApplicationDto,
    actor: AdminActor,
  ) {
    const currentApplication = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, status: true },
    });

    if (!currentApplication) {
      throw this.applicationNotFound();
    }

    const name = input.name?.trim();

    if (name === '') {
      throw this.invalidRequest('Nama aplikasi tidak boleh kosong');
    }
    if (
      name === undefined &&
      input.status === undefined &&
      input.launchUrl === undefined &&
      input.logoutNotificationUrl === undefined
    ) {
      throw this.invalidRequest('Tidak ada data aplikasi yang diperbarui');
    }

    const now = new Date();

    return this.prisma.$transaction(async (transaction) => {
      const application = await transaction.application.update({
        where: { id: applicationId },
        data: {
          name,
          status: input.status,
          launchUrl: input.launchUrl,
          logoutNotificationUrl: input.logoutNotificationUrl,
        },
        select: APPLICATION_SELECT,
      });

      if (
        currentApplication.status === 'ACTIVE' &&
        input.status === 'INACTIVE'
      ) {
        await transaction.accessToken.updateMany({
          where: {
            applicationId,
            status: 'ACTIVE',
            revokedAt: null,
          },
          data: { status: 'REVOKED', revokedAt: now },
        });
      }

      await transaction.auditLog.create({
        data: {
          eventType: 'ApplicationChanged',
          actorId: actor.userId,
          applicationId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: {
            action: 'UPDATED',
            fields: [
              ...(name !== undefined ? ['name'] : []),
              ...(input.status !== undefined ? ['status'] : []),
              ...(input.launchUrl !== undefined ? ['launchUrl'] : []),
              ...(input.logoutNotificationUrl !== undefined
                ? ['logoutNotificationUrl']
                : []),
            ],
          },
          ipAddress: actor.ipAddress,
        },
      });

      return application;
    });
  }

  async rotateClientSecret(applicationId: string, actor: AdminActor) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, clientId: true },
    });

    if (!application) {
      throw this.applicationNotFound();
    }

    const clientSecret = generateOpaqueToken();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.application.update({
        where: { id: applicationId },
        data: { clientSecretHash: hashSecret(clientSecret) },
        select: { id: true },
      });
      await transaction.auditLog.create({
        data: {
          eventType: 'ApplicationChanged',
          actorId: actor.userId,
          applicationId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: {
            action: 'CLIENT_SECRET_ROTATED',
            clientId: application.clientId,
          },
          ipAddress: actor.ipAddress,
        },
      });
    });

    return { clientId: application.clientId, clientSecret };
  }

  async addRedirectUri(
    applicationId: string,
    input: CreateRedirectUriDto,
    actor: AdminActor,
  ) {
    if (!this.isSupportedRedirectUri(input.redirectUri)) {
      throw this.invalidRequest(
        'Redirect URI harus berupa URL HTTP/HTTPS tanpa credential atau fragment',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const lockedApplications = await transaction.$queryRaw<
        Array<{ id: string }>
      >`SELECT "id" FROM "applications" WHERE "id" = ${applicationId}::uuid FOR UPDATE`;

      if (lockedApplications.length === 0) {
        throw this.applicationNotFound();
      }

      const [existingRedirectUri, redirectUriCount] = await Promise.all([
        transaction.applicationRedirectUri.findUnique({
          where: {
            applicationId_redirectUri: {
              applicationId,
              redirectUri: input.redirectUri,
            },
          },
          select: { id: true },
        }),
        transaction.applicationRedirectUri.count({ where: { applicationId } }),
      ]);

      if (existingRedirectUri) {
        throw new ConflictException({
          error: {
            code: 'REDIRECT_URI_ALREADY_EXISTS',
            message: 'Redirect URI sudah terdaftar untuk aplikasi ini',
          },
        });
      }
      if (redirectUriCount >= 20) {
        throw new BadRequestException({
          error: {
            code: 'REDIRECT_URI_LIMIT_REACHED',
            message: 'Aplikasi hanya dapat memiliki maksimal 20 redirect URI',
          },
        });
      }

      const redirectUri = await transaction.applicationRedirectUri.create({
        data: { applicationId, redirectUri: input.redirectUri },
        select: { id: true, redirectUri: true, createdAt: true },
      });

      await transaction.auditLog.create({
        data: {
          eventType: 'ApplicationChanged',
          actorId: actor.userId,
          applicationId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: {
            action: 'REDIRECT_URI_ADDED',
            redirectUri: input.redirectUri,
          },
          ipAddress: actor.ipAddress,
        },
      });

      return redirectUri;
    });
  }

  async removeRedirectUri(
    applicationId: string,
    redirectUriId: string,
    actor: AdminActor,
  ): Promise<void> {
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      const lockedApplications = await transaction.$queryRaw<
        Array<{ id: string }>
      >`SELECT "id" FROM "applications" WHERE "id" = ${applicationId}::uuid FOR UPDATE`;

      if (lockedApplications.length === 0) {
        throw this.applicationNotFound();
      }

      const application = await transaction.application.findUnique({
        where: { id: applicationId },
        select: {
          id: true,
          redirectUris: {
            select: { id: true, redirectUri: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!application) {
        throw this.applicationNotFound();
      }

      const redirectUri = application.redirectUris.find(
        ({ id }) => id === redirectUriId,
      );

      if (!redirectUri) {
        throw new NotFoundException({
          error: {
            code: 'REDIRECT_URI_NOT_FOUND',
            message: 'Redirect URI tidak ditemukan untuk aplikasi ini',
          },
        });
      }
      if (application.redirectUris.length === 1) {
        throw new BadRequestException({
          error: {
            code: 'REDIRECT_URI_MINIMUM_REQUIRED',
            message: 'Aplikasi harus memiliki setidaknya satu redirect URI',
          },
        });
      }

      await transaction.applicationRedirectUri.delete({
        where: { id: redirectUriId },
      });
      const invalidatedAuthorizationCodes =
        await transaction.authorizationCode.updateMany({
          where: {
            applicationId,
            redirectUri: redirectUri.redirectUri,
            usedAt: null,
          },
          data: { usedAt: now },
        });
      await transaction.auditLog.create({
        data: {
          eventType: 'ApplicationChanged',
          actorId: actor.userId,
          applicationId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: {
            action: 'REDIRECT_URI_REMOVED',
            redirectUri: redirectUri.redirectUri,
            invalidatedAuthorizationCodeCount:
              invalidatedAuthorizationCodes.count,
          },
          ipAddress: actor.ipAddress,
        },
      });
    });
  }

  async addPolicy(
    applicationId: string,
    input: CreatePolicyDto,
    actor: AdminActor,
  ) {
    const [application, group, existingPolicy] = await Promise.all([
      this.prisma.application.findUnique({
        where: { id: applicationId },
        select: { id: true },
      }),
      this.prisma.group.findUnique({
        where: { id: input.groupId },
        select: { id: true, name: true },
      }),
      this.prisma.applicationGroupPolicy.findUnique({
        where: {
          applicationId_groupId_effect: {
            applicationId,
            groupId: input.groupId,
            effect: 'ALLOW',
          },
        },
        select: { id: true },
      }),
    ]);

    if (!application) {
      throw this.applicationNotFound();
    }
    if (!group) {
      throw new NotFoundException({
        error: { code: 'GROUP_NOT_FOUND', message: 'Group tidak ditemukan' },
      });
    }
    if (existingPolicy) {
      throw new ConflictException({
        error: {
          code: 'POLICY_ALREADY_EXISTS',
          message: 'Policy ALLOW untuk group dan aplikasi sudah ada',
        },
      });
    }

    return this.prisma.$transaction(async (transaction) => {
      const policy = await transaction.applicationGroupPolicy.create({
        data: {
          applicationId,
          groupId: input.groupId,
          effect: 'ALLOW',
        },
        select: {
          id: true,
          effect: true,
          createdAt: true,
          group: {
            select: { id: true, name: true, description: true },
          },
        },
      });

      await transaction.auditLog.create({
        data: {
          eventType: 'PolicyChanged',
          actorId: actor.userId,
          applicationId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: {
            action: 'CREATED',
            policyId: policy.id,
            groupId: input.groupId,
            groupName: group.name,
            effect: 'ALLOW',
          },
          ipAddress: actor.ipAddress,
        },
      });

      return policy;
    });
  }

  async removePolicy(
    applicationId: string,
    policyId: string,
    actor: AdminActor,
  ): Promise<void> {
    const policy = await this.prisma.applicationGroupPolicy.findFirst({
      where: { id: policyId, applicationId },
      select: {
        id: true,
        groupId: true,
        group: {
          select: {
            name: true,
            userGroups: { select: { userId: true } },
          },
        },
      },
    });

    if (!policy) {
      throw new NotFoundException({
        error: {
          code: 'POLICY_NOT_FOUND',
          message: 'Policy tidak ditemukan untuk aplikasi ini',
        },
      });
    }

    const candidateUserIds = policy.group.userGroups.map(
      ({ userId }) => userId,
    );
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.applicationGroupPolicy.delete({
        where: { id: policy.id },
      });
      const revokedUserIds =
        await this.revocationService.revokeUsersWhoLostAccess(
          transaction,
          candidateUserIds,
          [applicationId],
          now,
        );

      await transaction.auditLog.create({
        data: {
          eventType: 'PolicyChanged',
          actorId: actor.userId,
          applicationId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: {
            action: 'DELETED',
            policyId,
            groupId: policy.groupId,
            groupName: policy.group.name,
            revokedUserCount: revokedUserIds.length,
          },
          ipAddress: actor.ipAddress,
        },
      });
    });
  }

  private applicationNotFound(): NotFoundException {
    return new NotFoundException({
      error: {
        code: 'APPLICATION_NOT_FOUND',
        message: 'Aplikasi tidak ditemukan',
      },
    });
  }

  private invalidRequest(message: string): BadRequestException {
    return new BadRequestException({
      error: { code: 'INVALID_ADMIN_REQUEST', message },
    });
  }

  private isSupportedRedirectUri(value: string): boolean {
    try {
      const redirectUri = new URL(value);

      return (
        (redirectUri.protocol === 'http:' ||
          redirectUri.protocol === 'https:') &&
        redirectUri.username === '' &&
        redirectUri.password === '' &&
        redirectUri.hash === ''
      );
    } catch {
      return false;
    }
  }
}
