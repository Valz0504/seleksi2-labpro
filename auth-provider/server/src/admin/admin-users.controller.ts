import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AdminRequest } from './admin-request';
import { requireAdminActor } from './admin-request';
import { AdminUsersService } from './admin-users.service';
import { AdminGuard } from './admin.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('admin/users')
@UseGuards(AdminGuard)
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  listUsers() {
    return this.usersService.listUsers();
  }

  @Get(':userId')
  getUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.usersService.getUser(userId);
  }

  @Post()
  createUser(@Body() input: CreateUserDto, @Req() request: AdminRequest) {
    return this.usersService.createUser(input, requireAdminActor(request));
  }

  @Patch(':userId')
  updateUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: UpdateUserDto,
    @Req() request: AdminRequest,
  ) {
    return this.usersService.updateUser(
      userId,
      input,
      requireAdminActor(request),
    );
  }

  @Patch(':userId/status')
  updateStatus(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: UpdateUserStatusDto,
    @Req() request: AdminRequest,
  ) {
    return this.usersService.updateStatus(
      userId,
      input,
      requireAdminActor(request),
    );
  }

  @Put(':userId/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  updatePassword(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: UpdateUserPasswordDto,
    @Req() request: AdminRequest,
  ): Promise<void> {
    return this.usersService.updatePassword(
      userId,
      input,
      requireAdminActor(request),
    );
  }

  @Post(':userId/groups/:groupId')
  addGroupMembership(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Req() request: AdminRequest,
  ) {
    return this.usersService.addGroupMembership(
      userId,
      groupId,
      requireAdminActor(request),
    );
  }

  @Delete(':userId/groups/:groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeGroupMembership(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Req() request: AdminRequest,
  ): Promise<void> {
    return this.usersService.removeGroupMembership(
      userId,
      groupId,
      requireAdminActor(request),
    );
  }
}
