import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  Body,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { MfaCodeDto } from '../auth/dto/mfa-code.dto';
import { SessionCookieService } from '../auth/session-cookie.service';
import { MfaEnrollmentService } from './mfa-enrollment.service';
import { MfaManagementService } from './mfa-management.service';
import { MfaReauthenticationDto } from './dto/mfa-reauthentication.dto';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
};

@Controller('auth/mfa')
@ApiTags('Multi-Factor Authentication')
@ApiCookieAuth('centralSession')
export class MfaController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionCookieService: SessionCookieService,
    private readonly enrollmentService: MfaEnrollmentService,
    private readonly managementService: MfaManagementService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Read MFA status for the current user' })
  @ApiOkResponse({ description: 'Safe MFA enrollment status.' })
  @ApiUnauthorizedResponse({ description: 'A central session is required.' })
  async getStatus(@Req() request: Request) {
    const session = await this.getCurrentSession(request);

    return this.enrollmentService.getStatus(session.user.id);
  }

  @Post('enroll/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start or restart TOTP enrollment' })
  @ApiOkResponse({
    description:
      'Returns a one-time provisioning URI, manual key, and QR data URL. MFA is not active yet.',
  })
  @ApiConflictResponse({ description: 'MFA is already active.' })
  @ApiUnauthorizedResponse({ description: 'A central session is required.' })
  async startEnrollment(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.getCurrentSession(request);

    response.set(NO_STORE_HEADERS);

    return this.enrollmentService.start(session.user.id, session.user.email);
  }

  @Post('enroll/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm the first TOTP code and enable MFA' })
  @ApiOkResponse({ description: 'MFA is now active for the current user.' })
  @ApiBadRequestResponse({ description: 'The TOTP code is invalid.' })
  @ApiConflictResponse({
    description: 'Enrollment has not started or MFA is already active.',
  })
  @ApiUnauthorizedResponse({ description: 'A central session is required.' })
  async confirmEnrollment(
    @Body() mfaCodeDto: MfaCodeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.getCurrentSession(request);

    const result = await this.enrollmentService.confirm(
      session.user.id,
      mfaCodeDto.code,
      {
        ipAddress: request.ip?.slice(0, 45),
        userAgent: request.get('user-agent'),
      },
    );
    response.set(NO_STORE_HEADERS);

    return { enabled: true, recoveryCodes: result.recoveryCodes };
  }

  @Post('recovery/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Replace every recovery code after reauthentication',
  })
  @ApiOkResponse({
    description:
      'Returns replacement recovery codes once. Old codes are invalid.',
  })
  @ApiConflictResponse({ description: 'MFA is not active.' })
  @ApiUnauthorizedResponse({
    description: 'A central session or the reauthentication input is invalid.',
  })
  async regenerateRecoveryCodes(
    @Body() input: MfaReauthenticationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.getCurrentSession(request);
    const result = await this.managementService.regenerateRecoveryCodes(
      session.user.id,
      input.password,
      input.code,
      {
        ipAddress: request.ip?.slice(0, 45),
        userAgent: request.get('user-agent'),
      },
    );
    response.set(NO_STORE_HEADERS);

    return result;
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Disable MFA after password and factor reauthentication',
  })
  @ApiNoContentResponse({
    description: 'MFA and every recovery code were removed.',
  })
  @ApiConflictResponse({ description: 'MFA is not active.' })
  @ApiUnauthorizedResponse({
    description: 'A central session or the reauthentication input is invalid.',
  })
  async disableMfa(
    @Body() input: MfaReauthenticationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const session = await this.getCurrentSession(request);
    await this.managementService.disable(
      session.user.id,
      input.password,
      input.code,
      {
        ipAddress: request.ip?.slice(0, 45),
        userAgent: request.get('user-agent'),
      },
    );
    response.set(NO_STORE_HEADERS);
  }

  private async getCurrentSession(request: Request) {
    const sessionToken = this.sessionCookieService.read(request);

    if (!sessionToken) {
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_SESSION',
          message: 'Central session tidak ditemukan',
        },
      });
    }

    return this.authService.getCurrentSession(sessionToken);
  }
}
