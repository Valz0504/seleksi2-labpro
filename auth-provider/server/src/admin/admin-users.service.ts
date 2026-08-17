import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashPassword } from '../common/security/password';
import { PrismaService } from '../database/prisma.service';
import type { AdminActor } from './admin-request';
import { AdminRevocationService } from './admin-revocation.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import type { UpdateUserStatusDto } from './dto/update-user-status.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  userGroups: {
    select: {
      id: true,
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
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revocationService: AdminRevocationService,
  ) {}

  listUsers() {
    return this.prisma.user.findMany({
      select: USER_SELECT,
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });

    if (!user) {
      throw this.userNotFound();
    }

    return user;
  }

  async createUser(input: CreateUserDto, actor: AdminActor) {
    const name = input.name.trim();
    const email = this.normalizeEmail(input.email);

    if (!name) {
      throw this.invalidRequest('Nama user tidak boleh kosong');
    }

    await this.assertEmailAvailable(email);
    const passwordHash = await hashPassword(input.password);

    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          name,
          email,
          passwordHash,
        },
        select: USER_SELECT,
      });

      await transaction.auditLog.create({
        data: {
          eventType: 'UserCreated',
          actorId: actor.userId,
          userId: user.id,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: { email: user.email, status: user.status },
          ipAddress: actor.ipAddress,
        },
      });

      return user;
    });
  }

  async updateUser(userId: string, input: UpdateUserDto, actor: AdminActor) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!currentUser) {
      throw this.userNotFound();
    }

    const name = input.name?.trim();
    const email = input.email ? this.normalizeEmail(input.email) : undefined;

    if (name === '') {
      throw this.invalidRequest('Nama user tidak boleh kosong');
    }
    if (name === undefined && email === undefined) {
      throw this.invalidRequest('Tidak ada data user yang diperbarui');
    }
    if (email && email !== currentUser.email) {
      await this.assertEmailAvailable(email, userId);
    }

    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id: userId },
        data: { name, email },
        select: USER_SELECT,
      });

      await transaction.auditLog.create({
        data: {
          eventType: 'UserChanged',
          actorId: actor.userId,
          userId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: {
            fields: [
              ...(name !== undefined ? ['name'] : []),
              ...(email !== undefined ? ['email'] : []),
            ],
          },
          ipAddress: actor.ipAddress,
        },
      });

      return user;
    });
  }

  async updateStatus(
    userId: string,
    input: UpdateUserStatusDto,
    actor: AdminActor,
  ) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!currentUser) {
      throw this.userNotFound();
    }
    if (currentUser.status === input.status) {
      return this.getUser(userId);
    }

    const now = new Date();

    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id: userId },
        data: { status: input.status },
        select: USER_SELECT,
      });

      if (input.status === 'INACTIVE') {
        await this.revocationService.revokeUsersForDeactivation(
          transaction,
          [userId],
          now,
        );
      }

      await transaction.auditLog.create({
        data: {
          eventType: 'UserChanged',
          actorId: actor.userId,
          userId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: {
            field: 'status',
            previousStatus: currentUser.status,
            status: input.status,
          },
          ipAddress: actor.ipAddress,
        },
      });

      return user;
    });
  }

  async updatePassword(
    userId: string,
    input: UpdateUserPasswordDto,
    actor: AdminActor,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw this.userNotFound();
    }

    const passwordHash = await hashPassword(input.password);
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: { passwordHash },
        select: { id: true },
      });
      await this.revocationService.revokeUsersForPasswordChange(
        transaction,
        [userId],
        now,
      );
      await transaction.auditLog.create({
        data: {
          eventType: 'PasswordChanged',
          actorId: actor.userId,
          userId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: { sessionsRevoked: true },
          ipAddress: actor.ipAddress,
        },
      });
    });
  }

  async addGroupMembership(userId: string, groupId: string, actor: AdminActor) {
    const [user, group, existingMembership] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      }),
      this.prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true, name: true },
      }),
      this.prisma.userGroup.findUnique({
        where: { userId_groupId: { userId, groupId } },
        select: { id: true },
      }),
    ]);

    if (!user) {
      throw this.userNotFound();
    }
    if (!group) {
      throw this.groupNotFound();
    }
    if (existingMembership) {
      throw new ConflictException({
        error: {
          code: 'MEMBERSHIP_ALREADY_EXISTS',
          message: 'User sudah menjadi anggota group tersebut',
        },
      });
    }

    return this.prisma.$transaction(async (transaction) => {
      const membership = await transaction.userGroup.create({
        data: { userId, groupId },
        select: {
          id: true,
          createdAt: true,
          group: {
            select: { id: true, name: true, description: true },
          },
        },
      });

      await transaction.auditLog.create({
        data: {
          eventType: 'GroupChanged',
          actorId: actor.userId,
          userId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: {
            action: 'USER_ADDED',
            groupId,
            groupName: group.name,
          },
          ipAddress: actor.ipAddress,
        },
      });

      return membership;
    });
  }

  async removeGroupMembership(
    userId: string,
    groupId: string,
    actor: AdminActor,
  ): Promise<void> {
    const membership = await this.prisma.userGroup.findUnique({
      where: { userId_groupId: { userId, groupId } },
      select: {
        id: true,
        group: {
          select: {
            name: true,
            policies: { select: { applicationId: true } },
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException({
        error: {
          code: 'MEMBERSHIP_NOT_FOUND',
          message: 'Keanggotaan group tidak ditemukan',
        },
      });
    }

    const now = new Date();
    const applicationIds = membership.group.policies.map(
      ({ applicationId }) => applicationId,
    );

    await this.prisma.$transaction(async (transaction) => {
      await transaction.userGroup.delete({ where: { id: membership.id } });
      const revokedUserIds =
        await this.revocationService.revokeUsersWhoLostAccess(
          transaction,
          [userId],
          applicationIds,
          now,
        );

      await transaction.auditLog.create({
        data: {
          eventType: 'GroupChanged',
          actorId: actor.userId,
          userId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: {
            action: 'USER_REMOVED',
            groupId,
            groupName: membership.group.name,
            accessLost: revokedUserIds.includes(userId),
          },
          ipAddress: actor.ipAddress,
        },
      });
    });
  }

  private async assertEmailAvailable(
    email: string,
    excludedUserId?: string,
  ): Promise<void> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser && existingUser.id !== excludedUserId) {
      throw new ConflictException({
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'Email sudah digunakan oleh user lain',
        },
      });
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private userNotFound(): NotFoundException {
    return new NotFoundException({
      error: { code: 'USER_NOT_FOUND', message: 'User tidak ditemukan' },
    });
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
