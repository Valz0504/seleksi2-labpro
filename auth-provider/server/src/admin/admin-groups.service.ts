import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AdminActor } from './admin-request';
import { AdminRevocationService } from './admin-revocation.service';
import type { CreateGroupDto } from './dto/create-group.dto';
import type { UpdateGroupDto } from './dto/update-group.dto';

const GROUP_SELECT = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  userGroups: {
    select: {
      id: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
        },
      },
    },
    orderBy: { user: { name: 'asc' as const } },
  },
  policies: {
    select: {
      id: true,
      effect: true,
      createdAt: true,
      application: {
        select: {
          id: true,
          name: true,
          clientId: true,
          status: true,
        },
      },
    },
    orderBy: { application: { name: 'asc' as const } },
  },
} as const;

@Injectable()
export class AdminGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revocationService: AdminRevocationService,
  ) {}

  listGroups() {
    return this.prisma.group.findMany({
      select: GROUP_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async getGroup(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: GROUP_SELECT,
    });

    if (!group) {
      throw this.groupNotFound();
    }

    return group;
  }

  async createGroup(input: CreateGroupDto, actor: AdminActor) {
    const name = input.name.trim();
    const description = this.normalizeDescription(input.description);

    if (!name) {
      throw this.invalidRequest('Nama group tidak boleh kosong');
    }

    await this.assertNameAvailable(name);

    return this.prisma.$transaction(async (transaction) => {
      const group = await transaction.group.create({
        data: { name, description },
        select: GROUP_SELECT,
      });

      await transaction.auditLog.create({
        data: {
          eventType: 'GroupChanged',
          actorId: actor.userId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: {
            action: 'CREATED',
            groupId: group.id,
            groupName: group.name,
          },
          ipAddress: actor.ipAddress,
        },
      });

      return group;
    });
  }

  async updateGroup(groupId: string, input: UpdateGroupDto, actor: AdminActor) {
    const currentGroup = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true },
    });

    if (!currentGroup) {
      throw this.groupNotFound();
    }

    const name = input.name?.trim();
    const description =
      input.description === undefined
        ? undefined
        : this.normalizeDescription(input.description);

    if (name === '') {
      throw this.invalidRequest('Nama group tidak boleh kosong');
    }
    if (name === undefined && description === undefined) {
      throw this.invalidRequest('Tidak ada data group yang diperbarui');
    }
    if (name && name !== currentGroup.name) {
      await this.assertNameAvailable(name, groupId);
    }

    return this.prisma.$transaction(async (transaction) => {
      const group = await transaction.group.update({
        where: { id: groupId },
        data: { name, description },
        select: GROUP_SELECT,
      });

      await transaction.auditLog.create({
        data: {
          eventType: 'GroupChanged',
          actorId: actor.userId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: {
            action: 'UPDATED',
            groupId,
            fields: [
              ...(name !== undefined ? ['name'] : []),
              ...(description !== undefined ? ['description'] : []),
            ],
          },
          ipAddress: actor.ipAddress,
        },
      });

      return group;
    });
  }

  async deleteGroup(groupId: string, actor: AdminActor): Promise<void> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        name: true,
        userGroups: { select: { userId: true } },
        policies: { select: { applicationId: true } },
      },
    });

    if (!group) {
      throw this.groupNotFound();
    }

    const userIds = group.userGroups.map(({ userId }) => userId);
    const applicationIds = group.policies.map(
      ({ applicationId }) => applicationId,
    );
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.userGroup.deleteMany({ where: { groupId } });
      await transaction.applicationGroupPolicy.deleteMany({
        where: { groupId },
      });
      await transaction.group.delete({ where: { id: groupId } });

      const revokedUserIds =
        await this.revocationService.revokeUsersWhoLostAccess(
          transaction,
          userIds,
          applicationIds,
          now,
        );

      await transaction.auditLog.create({
        data: {
          eventType: 'GroupChanged',
          actorId: actor.userId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: {
            action: 'DELETED',
            groupId,
            groupName: group.name,
            revokedUserCount: revokedUserIds.length,
          },
          ipAddress: actor.ipAddress,
        },
      });
    });
  }

  private async assertNameAvailable(
    name: string,
    excludedGroupId?: string,
  ): Promise<void> {
    const existingGroup = await this.prisma.group.findUnique({
      where: { name },
      select: { id: true },
    });

    if (existingGroup && existingGroup.id !== excludedGroupId) {
      throw new ConflictException({
        error: {
          code: 'GROUP_NAME_ALREADY_EXISTS',
          message: 'Nama group sudah digunakan',
        },
      });
    }
  }

  private normalizeDescription(
    value: string | null | undefined,
  ): string | null {
    const description = value?.trim();
    return description ? description : null;
  }

  private groupNotFound(): NotFoundException {
    return new NotFoundException({
      error: { code: 'GROUP_NOT_FOUND', message: 'Group tidak ditemukan' },
    });
  }

  private invalidRequest(message: string): BadRequestException {
    return new BadRequestException({
      error: { code: 'INVALID_ADMIN_REQUEST', message },
    });
  }
}
