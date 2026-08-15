import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { BrowserLoginDto } from './dto/browser-login.dto';
import { LoginDto } from './dto/login.dto';
import { FrontChannelLoginService } from './front-channel-login.service';
import { SessionCookieService } from './session-cookie.service';

@Controller('auth')
@ApiTags('Authentication')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly frontChannelLoginService: FrontChannelLoginService,
    private readonly sessionCookieService: SessionCookieService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate user credentials and create a central session',
  })
  @ApiOkResponse({
    description:
      'Central session created. The raw session token is only returned in the signed HttpOnly cookie.',
    schema: {
      example: {
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Example User',
          email: 'user@example.com',
          role: 'USER',
        },
        session: {
          id: '22222222-2222-4222-8222-222222222222',
          status: 'ACTIVE',
          createdAt: '2026-08-15T08:00:00.000Z',
          expiresAt: '2026-08-15T16:00:00.000Z',
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'The request body is malformed.' })
  @ApiUnauthorizedResponse({
    description:
      'Generic credential failure for an unknown, inactive, or mismatched account.',
  })
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      loginDto.email,
      loginDto.password,
      {
        ipAddress: request.ip?.slice(0, 45),
        userAgent: request.get('user-agent'),
      },
    );

    this.sessionCookieService.write(response, result.sessionToken);

    return {
      user: result.user,
      session: result.session,
    };
  }

  @Post('login/continue')
  @ApiOperation({
    summary: 'Login from the browser SSO form and resume /authorize',
  })
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiBody({ type: BrowserLoginDto })
  @ApiResponse({
    status: HttpStatus.SEE_OTHER,
    description:
      'Redirects to the validated /authorize continuation, or back to the login UI with a generic error.',
  })
  @ApiBadRequestResponse({
    description: 'The form or authorization continuation is unsafe.',
  })
  async continueLogin(
    @Body() browserLoginDto: BrowserLoginDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const returnTo = this.frontChannelLoginService.requireSafeReturnTo(
      browserLoginDto.returnTo,
    );

    try {
      const result = await this.authService.login(
        browserLoginDto.email,
        browserLoginDto.password,
        {
          ipAddress: request.ip?.slice(0, 45),
          userAgent: request.get('user-agent'),
        },
      );

      this.sessionCookieService.write(response, result.sessionToken);
      response.redirect(HttpStatus.SEE_OTHER, returnTo);
    } catch (error: unknown) {
      if (!(error instanceof UnauthorizedException)) {
        throw error;
      }

      response.redirect(
        HttpStatus.SEE_OTHER,
        this.frontChannelLoginService.buildLoginPageUrl(
          returnTo,
          'invalid_credentials',
        ),
      );
    }
  }

  @Post('login/admin')
  @ApiOperation({
    summary: 'Login an administrator through the Control Panel form',
  })
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: HttpStatus.SEE_OTHER,
    description:
      'Redirects an administrator to the dashboard, or returns to the login UI with a generic error.',
  })
  async loginAdmin(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const result = await this.authService.login(
        loginDto.email,
        loginDto.password,
        {
          ipAddress: request.ip?.slice(0, 45),
          userAgent: request.get('user-agent'),
        },
        { requiredRole: 'ADMIN' },
      );

      this.sessionCookieService.write(response, result.sessionToken);
      response.redirect(
        HttpStatus.SEE_OTHER,
        this.frontChannelLoginService.getAdminDashboardUrl(),
      );
    } catch (error: unknown) {
      if (!(error instanceof UnauthorizedException)) {
        throw error;
      }

      response.redirect(
        HttpStatus.SEE_OTHER,
        this.frontChannelLoginService.buildAdminLoginPageUrl(
          'invalid_credentials',
        ),
      );
    }
  }

  @Get('session')
  @ApiOperation({ summary: 'Read and refresh the current central session' })
  @ApiCookieAuth('centralSession')
  @ApiOkResponse({
    description: 'Current safe user profile and central-session metadata.',
  })
  @ApiUnauthorizedResponse({
    description: 'The central-session cookie is absent, expired, or revoked.',
  })
  getCurrentSession(@Req() request: Request) {
    const sessionToken = this.requireSessionToken(request);

    return this.authService.getCurrentSession(sessionToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Perform SSO logout and revoke the current central session',
  })
  @ApiCookieAuth('centralSession')
  @ApiNoContentResponse({
    description:
      'Logout is idempotent. The cookie is cleared and known session/token state is revoked.',
  })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.clearCurrentSession(request, response);
  }

  @Post('logout/admin')
  @ApiOperation({
    summary: 'Logout from the Control Panel and return to admin login',
  })
  @ApiCookieAuth('centralSession')
  @ApiResponse({
    status: HttpStatus.SEE_OTHER,
    description:
      'The central session is revoked, its cookie cleared, and the browser redirected to admin login.',
  })
  async logoutAdmin(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.clearCurrentSession(request, response);
    response.redirect(
      HttpStatus.SEE_OTHER,
      this.frontChannelLoginService.buildAdminLoginPageUrl(),
    );
  }

  private requireSessionToken(request: Request): string {
    const sessionToken = this.sessionCookieService.read(request);

    if (!sessionToken) {
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_SESSION',
          message: 'Central session tidak ditemukan',
        },
      });
    }

    return sessionToken;
  }

  private async clearCurrentSession(
    request: Request,
    response: Response,
  ): Promise<void> {
    const sessionToken = this.sessionCookieService.read(request);

    if (sessionToken) {
      await this.authService.logout(sessionToken, {
        ipAddress: request.ip?.slice(0, 45),
      });
    }

    this.sessionCookieService.clear(response);
  }
}
