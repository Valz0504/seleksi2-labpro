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
@ApiTags('Admin applications')
@ApiCookieAuth('centralSession')
@ApiUnauthorizedResponse({ description: 'Central session is invalid.' })
@ApiForbiddenResponse({
  description:
    'The authenticated user is not a member of the Control Panel administrator group.',
})
export class AdminApplicationsController {
  constructor(private readonly applicationsService: AdminApplicationsService) {}

  @Get()
  @ApiOperation({
    summary: 'List applications, exact redirect URIs, and ALLOW policies',
  })
  @ApiOkResponse({
    description:
      'Safe application records. Client secret hashes are never selected.',
  })
  listApplications() {
    return this.applicationsService.listApplications();
  }

  @Get(':applicationId')
  @ApiOperation({
    summary: 'Read one application with redirect URIs and policies',
  })
  @ApiParam({ name: 'applicationId', format: 'uuid' })
  @ApiOkResponse({ description: 'Safe application detail.' })
  @ApiNotFoundResponse({ description: 'APPLICATION_NOT_FOUND.' })
  getApplication(@Param('applicationId', ParseUUIDPipe) applicationId: string) {
    return this.applicationsService.getApplication(applicationId);
  }

  @Post()
  @ApiOperation({
    summary: 'Register a confidential application',
    description:
      'Creates the client, exact redirect URI allowlist, and a generated or supplied client secret hash. The raw secret is returned once in a no-store response.',
  })
  @ApiCreatedResponse({
    description:
      'Application created. Save the one-time clientSecret immediately.',
  })
  @ApiBadRequestResponse({ description: 'Invalid application configuration.' })
  @ApiConflictResponse({ description: 'CLIENT_ID_ALREADY_EXISTS.' })
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
  @ApiOperation({
    summary: 'Update application metadata or status',
    description:
      'Deactivation blocks new authorization/token exchange and revokes active access tokens for this application without revoking central sessions.',
  })
  @ApiParam({ name: 'applicationId', format: 'uuid' })
  @ApiOkResponse({ description: 'Updated safe application detail.' })
  @ApiBadRequestResponse({ description: 'No valid fields were supplied.' })
  @ApiNotFoundResponse({ description: 'APPLICATION_NOT_FOUND.' })
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
  @ApiOperation({
    summary: 'Rotate the confidential client secret',
    description:
      'Atomically replaces the stored hash. The raw replacement secret is returned once and never written to audit metadata.',
  })
  @ApiParam({ name: 'applicationId', format: 'uuid' })
  @ApiCreatedResponse({
    description:
      'Secret rotated. Save the one-time clientSecret and update the application backend environment.',
  })
  @ApiNotFoundResponse({ description: 'APPLICATION_NOT_FOUND.' })
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
  @ApiOperation({ summary: 'Add an exact redirect URI' })
  @ApiParam({ name: 'applicationId', format: 'uuid' })
  @ApiCreatedResponse({ description: 'Exact redirect URI added.' })
  @ApiBadRequestResponse({
    description: 'Invalid URL or REDIRECT_URI_LIMIT_REACHED.',
  })
  @ApiConflictResponse({ description: 'REDIRECT_URI_ALREADY_EXISTS.' })
  @ApiNotFoundResponse({ description: 'APPLICATION_NOT_FOUND.' })
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
  @ApiOperation({
    summary: 'Remove an exact redirect URI',
    description:
      'Keeps at least one URI and invalidates unused authorization codes bound to the removed application/URI pair.',
  })
  @ApiParam({ name: 'applicationId', format: 'uuid' })
  @ApiParam({ name: 'redirectUriId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Redirect URI removed.' })
  @ApiBadRequestResponse({ description: 'REDIRECT_URI_MINIMUM_REQUIRED.' })
  @ApiNotFoundResponse({
    description: 'APPLICATION_NOT_FOUND or REDIRECT_URI_NOT_FOUND.',
  })
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
  @ApiOperation({ summary: 'Allow a group to access an application' })
  @ApiParam({ name: 'applicationId', format: 'uuid' })
  @ApiCreatedResponse({ description: 'ALLOW policy created.' })
  @ApiConflictResponse({ description: 'POLICY_ALREADY_EXISTS.' })
  @ApiNotFoundResponse({
    description: 'APPLICATION_NOT_FOUND or GROUP_NOT_FOUND.',
  })
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
  @ApiOperation({
    summary: 'Remove an ALLOW policy and revoke users who lose access',
    description:
      'Evaluates every group member after deletion. Users with another ALLOW path remain active.',
  })
  @ApiParam({ name: 'applicationId', format: 'uuid' })
  @ApiParam({ name: 'policyId', format: 'uuid' })
  @ApiOkResponse({
    description:
      'Policy removed with the number of users whose security state was revoked.',
    schema: { example: { revokedUserCount: 1 } },
  })
  @ApiNotFoundResponse({
    description: 'APPLICATION_NOT_FOUND or POLICY_NOT_FOUND.',
  })
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
