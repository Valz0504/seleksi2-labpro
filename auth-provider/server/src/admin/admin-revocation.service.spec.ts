import { AdminRevocationService } from './admin-revocation.service';

describe('AdminRevocationService', () => {
  const transaction = {
    applicationGroupPolicy: { findFirst: jest.fn() },
    ssoSession: { updateMany: jest.fn() },
    accessToken: { updateMany: jest.fn() },
  };
  const now = new Date();
  let service: AdminRevocationService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.ssoSession.updateMany.mockResolvedValue({ count: 1 });
    transaction.accessToken.updateMany.mockResolvedValue({ count: 1 });
    service = new AdminRevocationService();
  });

  it('revokes active central sessions before active access tokens', async () => {
    const callOrder: string[] = [];
    transaction.ssoSession.updateMany.mockImplementation(() => {
      callOrder.push('session');
      return Promise.resolve({ count: 1 });
    });
    transaction.accessToken.updateMany.mockImplementation(() => {
      callOrder.push('token');
      return Promise.resolve({ count: 1 });
    });

    await service.revokeUsers(
      transaction as never,
      ['user-a', 'user-a'],
      'password_changed',
      now,
    );

    expect(callOrder).toEqual(['session', 'token']);
    const sessionUpdateCalls = transaction.ssoSession.updateMany.mock
      .calls as unknown as Array<
      [
        {
          where: { userId: { in: string[] } };
          data: { status: string; revokeReason: string };
        },
      ]
    >;
    expect(sessionUpdateCalls[0]?.[0]).toMatchObject({
      where: { userId: { in: ['user-a'] } },
      data: { status: 'REVOKED', revokeReason: 'password_changed' },
    });
  });

  it('only revokes users who have no remaining ALLOW policy path', async () => {
    transaction.applicationGroupPolicy.findFirst
      .mockResolvedValueOnce({ id: 'remaining-policy' })
      .mockResolvedValueOnce(null);

    const revoked = await service.revokeUsersWhoLostAccess(
      transaction as never,
      ['still-allowed-user', 'denied-user'],
      ['application-a'],
      now,
    );

    expect(revoked).toEqual(['denied-user']);
    const sessionUpdateCalls = transaction.ssoSession.updateMany.mock
      .calls as unknown as Array<[{ where: { userId: { in: string[] } } }]>;
    expect(sessionUpdateCalls[0]?.[0].where.userId.in).toEqual(['denied-user']);
  });

  it('does not issue database updates when no user loses access', async () => {
    transaction.applicationGroupPolicy.findFirst.mockResolvedValue({
      id: 'remaining-policy',
    });

    await expect(
      service.revokeUsersWhoLostAccess(
        transaction as never,
        ['still-allowed-user'],
        ['application-a'],
        now,
      ),
    ).resolves.toEqual([]);
    expect(transaction.ssoSession.updateMany).not.toHaveBeenCalled();
    expect(transaction.accessToken.updateMany).not.toHaveBeenCalled();
  });
});
