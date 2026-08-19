import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminApplicationsController } from './admin-applications.controller';
import { AdminApplicationsService } from './admin-applications.service';
import { AdminGroupsController } from './admin-groups.controller';
import { AdminGroupsService } from './admin-groups.service';
import { AdminRevocationService } from './admin-revocation.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminUsersController,
    AdminGroupsController,
    AdminApplicationsController,
  ],
  providers: [
    AdminGuard,
    AdminRevocationService,
    AdminUsersService,
    AdminGroupsService,
    AdminApplicationsService,
  ],
})
export class AdminModule {}
