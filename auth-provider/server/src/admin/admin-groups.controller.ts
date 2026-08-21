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
import { AdminGroupsService } from './admin-groups.service';
import { AdminGuard } from './admin.guard';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Controller('admin/groups')
@UseGuards(AdminGuard)
@ApiTags('Admin groups')
@ApiCookieAuth('centralSession')
@ApiUnauthorizedResponse({ description: 'Central session is invalid.' })
@ApiForbiddenResponse({
  description:
    'The authenticated user is not a member of the Control Panel administrator group.',
})
export class AdminGroupsController {
  constructor(private readonly groupsService: AdminGroupsService) {}

  @Get()
  @ApiOperation({ summary: 'List groups, members, and application policies' })
  @ApiOkResponse({ description: 'Groups ordered by name with safe relations.' })
  listGroups() {
    return this.groupsService.listGroups();
  }

  @Get(':groupId')
  @ApiOperation({ summary: 'Read one group with members and policies' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiOkResponse({ description: 'Group detail.' })
  @ApiNotFoundResponse({ description: 'GROUP_NOT_FOUND.' })
  getGroup(@Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.groupsService.getGroup(groupId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a group' })
  @ApiCreatedResponse({ description: 'Group created.' })
  @ApiBadRequestResponse({ description: 'Invalid group data.' })
  @ApiConflictResponse({ description: 'GROUP_NAME_ALREADY_EXISTS.' })
  createGroup(@Body() input: CreateGroupDto, @Req() request: AdminRequest) {
    return this.groupsService.createGroup(input, requireAdminActor(request));
  }

  @Patch(':groupId')
  @ApiOperation({ summary: 'Update a group name and/or description' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiOkResponse({ description: 'Updated group detail.' })
  @ApiBadRequestResponse({ description: 'No valid fields were supplied.' })
  @ApiConflictResponse({ description: 'GROUP_NAME_ALREADY_EXISTS.' })
  @ApiNotFoundResponse({ description: 'GROUP_NOT_FOUND.' })
  updateGroup(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() input: UpdateGroupDto,
    @Req() request: AdminRequest,
  ) {
    return this.groupsService.updateGroup(
      groupId,
      input,
      requireAdminActor(request),
    );
  }

  @Delete(':groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a group and evaluate access loss',
    description:
      'Hard-deletes memberships and policies, then revokes users who have no remaining ALLOW path to an affected application.',
  })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Group and its relations deleted.' })
  @ApiNotFoundResponse({ description: 'GROUP_NOT_FOUND.' })
  deleteGroup(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Req() request: AdminRequest,
  ): Promise<void> {
    return this.groupsService.deleteGroup(groupId, requireAdminActor(request));
  }
}
