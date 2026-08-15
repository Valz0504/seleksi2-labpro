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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AdminRequest } from './admin-request';
import { requireAdminActor } from './admin-request';
import { AdminApplicationsService } from './admin-applications.service';
import { AdminGuard } from './admin.guard';
import { CreateApplicationDto } from './dto/create-application.dto';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { CreateRedirectUriDto } from './dto/create-redirect-uri.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@Controller('admin/applications')
@UseGuards(AdminGuard)
export class AdminApplicationsController {
  constructor(private readonly applicationsService: AdminApplicationsService) {}

  @Get()
  listApplications() {
    return this.applicationsService.listApplications();
  }

  @Get(':applicationId')
  getApplication(@Param('applicationId', ParseUUIDPipe) applicationId: string) {
    return this.applicationsService.getApplication(applicationId);
  }

  @Post()
  createApplication(
    @Body() input: CreateApplicationDto,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.disableSensitiveResponseCaching(response);

    return this.applicationsService.createApplication(
      input,
      requireAdminActor(request),
    );
  }

  @Patch(':applicationId')
  updateApplication(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() input: UpdateApplicationDto,
    @Req() request: AdminRequest,
  ) {
    return this.applicationsService.updateApplication(
      applicationId,
      input,
      requireAdminActor(request),
    );
  }

  @Post(':applicationId/rotate-secret')
  rotateClientSecret(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.disableSensitiveResponseCaching(response);

    return this.applicationsService.rotateClientSecret(
      applicationId,
      requireAdminActor(request),
    );
  }

  @Post(':applicationId/redirect-uris')
  addRedirectUri(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() input: CreateRedirectUriDto,
    @Req() request: AdminRequest,
  ) {
    return this.applicationsService.addRedirectUri(
      applicationId,
      input,
      requireAdminActor(request),
    );
  }

  @Delete(':applicationId/redirect-uris/:redirectUriId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeRedirectUri(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('redirectUriId', ParseUUIDPipe) redirectUriId: string,
    @Req() request: AdminRequest,
  ): Promise<void> {
    return this.applicationsService.removeRedirectUri(
      applicationId,
      redirectUriId,
      requireAdminActor(request),
    );
  }

  @Post(':applicationId/policies')
  addPolicy(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() input: CreatePolicyDto,
    @Req() request: AdminRequest,
  ) {
    return this.applicationsService.addPolicy(
      applicationId,
      input,
      requireAdminActor(request),
    );
  }

  @Delete(':applicationId/policies/:policyId')
  @HttpCode(HttpStatus.OK)
  removePolicy(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Req() request: AdminRequest,
  ): Promise<{ revokedUserCount: number }> {
    return this.applicationsService.removePolicy(
      applicationId,
      policyId,
      requireAdminActor(request),
    );
  }

  private disableSensitiveResponseCaching(response: Response): void {
    response.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  }
}
