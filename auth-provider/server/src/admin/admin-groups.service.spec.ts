import { PrismaService } from '../database/prisma.service';
import type { AdminActor } from './admin-request';
import { AdminGroupsService } from './admin-groups.service';
import { AdminRevocationService } from './admin-revocation.service';
import { CONTROL_PANEL_ADMIN_GROUP_NAME } from '../auth/control-panel-access.constants';
import { BadRequestException } from '@nestjs/common';

describe('AdminGroupsService', () => {
  const actor: AdminActor = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  };
  const groupId = '11111111-1111-4111-8111-111111111111';
  const transaction = {
    userGroup: { deleteMany: jest.fn() },
    applicationGroupPolicy: { deleteMany: jest.fn() },
    group: { delete: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    group: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const revocationService = {
    revokeUsersWhoLostAccess: jest.fn(),
  };
  let service: AdminGroupsService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.userGroup.deleteMany.mockResolvedValue({ count: 1 });
    transaction.applicationGroupPolicy.deleteMany.mockResolvedValue({
      count: 1,
    });
    transaction.group.delete.mockResolvedValue({});
    transaction.auditLog.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    revocationService.revokeUsersWhoLostAccess.mockResolvedValue([
      'managed-user',
    ]);
    service = new AdminGroupsService(
      prisma as unknown as PrismaService,
      revocationService as unknown as AdminRevocationService,
    );
  });

  it('hard-deletes group relations and revokes users who lose application access', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: groupId,
      name: 'obsolete-group',
      userGroups: [{ userId: 'managed-user' }],
      policies: [{ applicationId: 'managed-application' }],
    });

    await service.deleteGroup(groupId, actor);

    expect(transaction.userGroup.deleteMany).toHaveBeenCalledWith({
      where: { groupId },
    });
    expect(transaction.applicationGroupPolicy.deleteMany).toHaveBeenCalledWith({
      where: { groupId },
    });
    expect(transaction.group.delete).toHaveBeenCalledWith({
      where: { id: groupId },
    });
    expect(revocationService.revokeUsersWhoLostAccess).toHaveBeenCalledWith(
      transaction,
      ['managed-user'],
      ['managed-application'],
      expect.any(Date),
    );
  });

  it('does not delete the protected Control Panel group', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: groupId,
      name: CONTROL_PANEL_ADMIN_GROUP_NAME,
      userGroups: [],
      policies: [],
    });

    await expect(service.deleteGroup(groupId, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not rename the protected Control Panel group', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: groupId,
      name: CONTROL_PANEL_ADMIN_GROUP_NAME,
    });

    await expect(
      service.updateGroup(groupId, { name: 'renamed-admins' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
