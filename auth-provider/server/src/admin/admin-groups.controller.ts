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
import type { AdminRequest } from './admin-request';
import { requireAdminActor } from './admin-request';
import { AdminGroupsService } from './admin-groups.service';
import { AdminGuard } from './admin.guard';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Controller('admin/groups')
@UseGuards(AdminGuard)
export class AdminGroupsController {
  constructor(private readonly groupsService: AdminGroupsService) {}

  @Get()
  listGroups() {
    return this.groupsService.listGroups();
  }

  @Get(':groupId')
  getGroup(@Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.groupsService.getGroup(groupId);
  }

  @Post()
  createGroup(@Body() input: CreateGroupDto, @Req() request: AdminRequest) {
    return this.groupsService.createGroup(input, requireAdminActor(request));
  }

  @Patch(':groupId')
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
  deleteGroup(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Req() request: AdminRequest,
  ): Promise<void> {
    return this.groupsService.deleteGroup(groupId, requireAdminActor(request));
  }
}
