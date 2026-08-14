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
    application: { create: jest.fn(), update: jest.fn() },
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
    transaction.application.update.mockResolvedValue(applicationRecord);
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
