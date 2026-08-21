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
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
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
@ApiTags('Admin users')
@ApiCookieAuth('centralSession')
@ApiUnauthorizedResponse({ description: 'Central session is invalid.' })
@ApiForbiddenResponse({
  description:
    'The authenticated user is not a member of the Control Panel administrator group.',
})
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users and their group memberships' })
  @ApiOkResponse({
    description:
      'Safe user records ordered by name and email. Password hashes are never selected.',
  })
  listUsers() {
    return this.usersService.listUsers();
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Read one user and their group memberships' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiOkResponse({ description: 'Safe user detail.' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND.' })
  getUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.usersService.getUser(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create an active user account' })
  @ApiCreatedResponse({
    description: 'User created with an Argon2id password hash.',
  })
  @ApiBadRequestResponse({ description: 'Invalid user data.' })
  @ApiConflictResponse({ description: 'EMAIL_ALREADY_EXISTS.' })
  createUser(@Body() input: CreateUserDto, @Req() request: AdminRequest) {
    return this.usersService.createUser(input, requireAdminActor(request));
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Update a user name and/or email' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiOkResponse({ description: 'Updated safe user detail.' })
  @ApiBadRequestResponse({ description: 'No valid fields were supplied.' })
  @ApiConflictResponse({ description: 'EMAIL_ALREADY_EXISTS.' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND.' })
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
  @ApiOperation({
    summary: 'Activate or deactivate a user',
    description:
      'Deactivation revokes every active central session and access token owned by the user. Reactivation never restores old credentials.',
  })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiOkResponse({ description: 'Updated safe user detail.' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND.' })
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
  @ApiOperation({
    summary: 'Replace a user password and revoke their security state',
  })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiNoContentResponse({
    description:
      'Password changed; all active central sessions and access tokens were revoked.',
  })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND.' })
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
  @ApiOperation({ summary: 'Add a user to a group' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiCreatedResponse({ description: 'Group membership created.' })
  @ApiConflictResponse({ description: 'MEMBERSHIP_ALREADY_EXISTS.' })
  @ApiNotFoundResponse({
    description: 'USER_NOT_FOUND or GROUP_NOT_FOUND.',
  })
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
  @ApiOperation({
    summary: 'Remove a user from a group',
    description:
      'If this removes the final ALLOW path to an application, the user central sessions and active access tokens are revoked.',
  })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Group membership removed.' })
  @ApiNotFoundResponse({ description: 'MEMBERSHIP_NOT_FOUND.' })
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
