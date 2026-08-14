import { BadRequestException, ConflictException } from '@nestjs/common';
import { verifySecret } from '../common/security/secret';
import { PrismaService } from '../database/prisma.service';
import { AdminApplicationsService } from './admin-applications.service';
import type { AdminActor } from './admin-request';
import { AdminRevocationService } from './admin-revocation.service';

describe('AdminApplicationsService', () => {
  const actor: AdminActor = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  };
  const applicationId = '11111111-1111-4111-8111-111111111111';
  const applicationRecord = {
    id: applicationId,
    name: 'Managed App',
    clientId: 'managed-app',
    status: 'ACTIVE',
    launchUrl: 'http://localhost:4000',
    logoutNotificationUrl: 'http://localhost:4000/internal/logout',
    createdAt: new Date(),
    updatedAt: new Date(),
    redirectUris: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        redirectUri: 'http://localhost:4000/auth/callback',
        createdAt: new Date(),
      },
    ],
    groupPolicies: [],
  };
  const transaction = {
    $queryRaw: jest.fn(),
    application: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    applicationRedirectUri: {
      count: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
    },
    authorizationCode: { updateMany: jest.fn() },
    accessToken: { updateMany: jest.fn() },
    applicationGroupPolicy: {
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
    ssoSession: { updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    application: { findUnique: jest.fn() },
    applicationGroupPolicy: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const revocationService = {
    revokeUsersWhoLostAccess: jest.fn(),
  };
  let service: AdminApplicationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.application.create.mockResolvedValue(applicationRecord);
    transaction.$queryRaw.mockResolvedValue([{ id: applicationId }]);
    transaction.application.findUnique.mockResolvedValue(applicationRecord);
    transaction.application.update.mockResolvedValue(applicationRecord);
    transaction.applicationRedirectUri.count.mockResolvedValue(1);
    transaction.applicationRedirectUri.create.mockResolvedValue(
      applicationRecord.redirectUris[0],
    );
    transaction.applicationRedirectUri.delete.mockResolvedValue({});
    transaction.applicationRedirectUri.findUnique.mockResolvedValue(null);
    transaction.authorizationCode.updateMany.mockResolvedValue({ count: 1 });
    transaction.accessToken.updateMany.mockResolvedValue({ count: 1 });
    transaction.auditLog.create.mockResolvedValue({});
    transaction.applicationGroupPolicy.delete.mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    revocationService.revokeUsersWhoLostAccess.mockResolvedValue([]);
    service = new AdminApplicationsService(
      prisma as unknown as PrismaService,
      revocationService as unknown as AdminRevocationService,
    );
  });

  it('generates a client secret, stores only its hash, and returns it once', async () => {
    prisma.application.findUnique.mockResolvedValue(null);

    const result = await service.createApplication(
      {
        name: 'Managed App',
        clientId: 'managed-app',
        redirectUris: ['http://localhost:4000/auth/callback'],
        launchUrl: 'http://localhost:4000',
        logoutNotificationUrl: 'http://localhost:4000/internal/logout',
      },
      actor,
    );
    const createCalls = transaction.application.create.mock
      .calls as unknown as Array<[{ data: { clientSecretHash: string } }]>;
    const createInput = createCalls[0][0];

    expect(result.clientSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createInput.data.clientSecretHash).not.toBe(result.clientSecret);
    expect(
      verifySecret(result.clientSecret, createInput.data.clientSecretHash),
    ).toBe(true);
    expect(
      JSON.stringify(transaction.auditLog.create.mock.calls),
    ).not.toContain(result.clientSecret);
  });

  it('revokes active audience tokens when an application is deactivated', async () => {
    prisma.application.findUnique.mockResolvedValue({
      id: applicationId,
      status: 'ACTIVE',
    });
    transaction.application.update.mockResolvedValue({
      ...applicationRecord,
      status: 'INACTIVE',
    });

    await service.updateApplication(
      applicationId,
      { status: 'INACTIVE' },
      actor,
    );

    const tokenUpdateCalls = transaction.accessToken.updateMany.mock
      .calls as unknown as Array<
      [
        {
          where: {
            applicationId: string;
            status: string;
            revokedAt: null;
          };
          data: { status: string; revokedAt: Date };
        },
      ]
    >;
    expect(tokenUpdateCalls[0]?.[0]).toMatchObject({
      where: { applicationId, status: 'ACTIVE', revokedAt: null },
      data: { status: 'REVOKED' },
    });
    expect(transaction.ssoSession.updateMany).not.toHaveBeenCalled();
  });

  it('adds an exact redirect URI while holding the application lock', async () => {
    const redirectUri = 'http://localhost:4001/auth/callback';
    transaction.applicationRedirectUri.create.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      redirectUri,
      createdAt: new Date(),
    });

    const result = await service.addRedirectUri(
      applicationId,
      { redirectUri },
      actor,
    );

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.applicationRedirectUri.create).toHaveBeenCalledWith({
      data: { applicationId, redirectUri },
      select: { id: true, redirectUri: true, createdAt: true },
    });
    expect(result.redirectUri).toBe(redirectUri);
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: { action: 'REDIRECT_URI_ADDED', redirectUri },
        }) as unknown,
      }),
    );
  });

  it('rejects a duplicate redirect URI without creating another record', async () => {
    transaction.applicationRedirectUri.findUnique.mockResolvedValue({
      id: applicationRecord.redirectUris[0].id,
    });

    await expect(
      service.addRedirectUri(
        applicationId,
        { redirectUri: applicationRecord.redirectUris[0].redirectUri },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.applicationRedirectUri.create).not.toHaveBeenCalled();
  });

  it('rejects redirect URIs containing credentials or fragments', async () => {
    await expect(
      service.addRedirectUri(
        applicationId,
        { redirectUri: 'https://user:secret@example.com/callback#fragment' },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
  });

  it('keeps at least one redirect URI for every application', async () => {
    await expect(
      service.removeRedirectUri(
        applicationId,
        applicationRecord.redirectUris[0].id,
        actor,
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'REDIRECT_URI_MINIMUM_REQUIRED',
        },
      },
    });
    expect(transaction.applicationRedirectUri.delete).not.toHaveBeenCalled();
    expect(transaction.authorizationCode.updateMany).not.toHaveBeenCalled();
  });

  it('invalidates unused authorization codes when a redirect URI is removed', async () => {
    const removedRedirectUri = applicationRecord.redirectUris[0];
    transaction.application.findUnique.mockResolvedValue({
      ...applicationRecord,
      redirectUris: [
        removedRedirectUri,
        {
          id: '66666666-6666-4666-8666-666666666666',
          redirectUri: 'http://localhost:4001/auth/callback',
          createdAt: new Date(),
        },
      ],
    });

    await service.removeRedirectUri(
      applicationId,
      removedRedirectUri.id,
      actor,
    );

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.applicationRedirectUri.delete).toHaveBeenCalledWith({
      where: { id: removedRedirectUri.id },
    });
    expect(transaction.authorizationCode.updateMany).toHaveBeenCalledWith({
      where: {
        applicationId,
        redirectUri: removedRedirectUri.redirectUri,
        usedAt: null,
      },
      data: { usedAt: expect.any(Date) as unknown },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: {
            action: 'REDIRECT_URI_REMOVED',
            redirectUri: removedRedirectUri.redirectUri,
            invalidatedAuthorizationCodeCount: 1,
          },
        }) as unknown,
      }),
    );
  });

  it('revokes users who lose their final policy path after policy removal', async () => {
    const policyId = '33333333-3333-4333-8333-333333333333';
    prisma.applicationGroupPolicy.findFirst.mockResolvedValue({
      id: policyId,
      groupId: '44444444-4444-4444-8444-444444444444',
      group: {
        name: 'managed-group',
        userGroups: [{ userId: 'managed-user' }],
      },
    });
    revocationService.revokeUsersWhoLostAccess.mockResolvedValue([
      'managed-user',
    ]);

    await service.removePolicy(applicationId, policyId, actor);

    const revocationCalls = revocationService.revokeUsersWhoLostAccess.mock
      .calls as unknown as Array<
      [typeof transaction, string[], string[], Date]
    >;
    expect(revocationCalls[0]?.slice(0, 3)).toEqual([
      transaction,
      ['managed-user'],
      [applicationId],
    ]);
    expect(revocationCalls[0]?.[3]).toBeInstanceOf(Date);

    const auditCalls = transaction.auditLog.create.mock
      .calls as unknown as Array<
      [
        {
          data: {
            eventType: string;
            metadata: { revokedUserCount: number };
          };
        },
      ]
    >;
    expect(auditCalls[0]?.[0].data).toMatchObject({
      eventType: 'PolicyChanged',
      metadata: { revokedUserCount: 1 },
    });
  });
});
