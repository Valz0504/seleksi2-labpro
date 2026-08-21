import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CONTROL_PANEL_ADMIN_GROUP_NAME } from './control-panel-access.constants';

@Injectable()
export class ControlPanelAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async canAccess(userId: string): Promise<boolean> {
    const matchingUsers = await this.prisma.user.count({
      where: {
        id: userId,
        status: 'ACTIVE',
        userGroups: {
          some: { group: { name: CONTROL_PANEL_ADMIN_GROUP_NAME } },
        },
      },
    });

    return matchingUsers === 1;
  }

  async assertAnotherActiveAdministratorExists(userId: string): Promise<void> {
    const otherActiveAdministrators = await this.prisma.user.count({
      where: {
        id: { not: userId },
        status: 'ACTIVE',
        userGroups: {
          some: { group: { name: CONTROL_PANEL_ADMIN_GROUP_NAME } },
        },
      },
    });

    if (otherActiveAdministrators === 0) {
      throw new BadRequestException({
        error: {
          code: 'LAST_CONTROL_PANEL_ADMIN',
          message: 'Akses administrator aktif terakhir tidak dapat dihapus',
        },
      });
    }
  }
}
