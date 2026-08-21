import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CONTROL_PANEL_ADMIN_GROUP_NAME } from './control-panel-access.constants';
import { ControlPanelAccessService } from './control-panel-access.service';

describe('ControlPanelAccessService', () => {
  const prisma = {
    user: { count: jest.fn() },
  };
  const userId = '11111111-1111-4111-8111-111111111111';
  let service: ControlPanelAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ControlPanelAccessService(prisma as unknown as PrismaService);
  });

  it('grants access only to an active member of the protected group', async () => {
    prisma.user.count.mockResolvedValue(1);

    await expect(service.canAccess(userId)).resolves.toBe(true);
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        id: userId,
        status: 'ACTIVE',
        userGroups: {
          some: { group: { name: CONTROL_PANEL_ADMIN_GROUP_NAME } },
        },
      },
    });
  });

  it('denies access when no active membership matches', async () => {
    prisma.user.count.mockResolvedValue(0);

    await expect(service.canAccess(userId)).resolves.toBe(false);
  });

  it('prevents removal of the last active Control Panel administrator', async () => {
    prisma.user.count.mockResolvedValue(0);

    await expect(
      service.assertAnotherActiveAdministratorExists(userId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
