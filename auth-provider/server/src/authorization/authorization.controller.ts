import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { FrontChannelLoginService } from '../auth/front-channel-login.service';
import { SessionCookieService } from '../auth/session-cookie.service';
import { AuthorizationRequestError } from './authorization-request.error';
import { AuthorizationService } from './authorization.service';

@Controller()
@ApiTags('Authorization')
export class AuthorizationController {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly frontChannelLoginService: FrontChannelLoginService,
    private readonly sessionCookieService: SessionCookieService,
  ) {}

  @Get('authorize')
  @ApiOperation({
    summary: 'Authorize an application using central session and group policy',
    description:
      'Browser-facing endpoint. A missing central session redirects to the SSO login UI. Success redirects only to an exact registered callback URI with a short-lived one-time code and the original state.',
  })
  @ApiQuery({
    name: 'client_id',
    description: 'Registered OAuth client identifier.',
    example: 'app-a',
  })
  @ApiQuery({
    name: 'redirect_uri',
    description: 'Exact registered HTTP(S) callback URI.',
    example: 'http://localhost:3002/auth/callback',
  })
  @ApiQuery({
    name: 'response_type',
    enum: ['code'],
    example: 'code',
  })
  @ApiQuery({
    name: 'state',
    description:
      'Application-generated CSRF binding value, at least 16 characters.',
    example: 'example-state-123456789',
    minLength: 16,
  })
  @ApiQuery({
    name: 'code_challenge',
    description: 'Base64URL SHA-256 digest of the PKCE code verifier.',
    example: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    minLength: 43,
    maxLength: 43,
  })
  @ApiQuery({
    name: 'code_challenge_method',
    enum: ['S256'],
    example: 'S256',
  })
  @ApiResponse({
    status: 302,
    description:
      'Redirects to login, to a trusted OAuth error callback, or to the trusted callback with code and state.',
  })
  @ApiBadRequestResponse({
    description:
      'The client or redirect URI cannot be trusted, so the error is returned locally as JSON.',
  })
  async authorize(
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const result = await this.authorizationService.authorize(
        {
          clientId: query['client_id'],
          redirectUri: query['redirect_uri'],
          responseType: query['response_type'],
          state: query['state'],
          codeChallenge: query['code_challenge'],
          codeChallengeMethod: query['code_challenge_method'],
        },
        this.sessionCookieService.read(request),
        { ipAddress: request.ip?.slice(0, 45) },
      );

      response.redirect(result.redirectUrl);
    } catch (error: unknown) {
      if (!(error instanceof AuthorizationRequestError)) {
        throw error;
      }

      if (error.code === 'login_required') {
        response.redirect(
          this.frontChannelLoginService.buildLoginPageUrl(request.originalUrl),
        );
        return;
      }

      const errorRedirectUrl = error.redirectUrl;

      if (errorRedirectUrl) {
        response.redirect(errorRedirectUrl);
        return;
      }

      response.status(error.statusCode).json({
        error: {
          code: 'INVALID_AUTHORIZATION_REQUEST',
          message: error.message,
        },
      });
    }
  }
}
