import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { FrontChannelLoginService } from '../auth/front-channel-login.service';
import { SessionCookieService } from '../auth/session-cookie.service';
import { AuthorizationRequestError } from './authorization-request.error';
import { AuthorizationService } from './authorization.service';

@Controller()
export class AuthorizationController {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly frontChannelLoginService: FrontChannelLoginService,
    private readonly sessionCookieService: SessionCookieService,
  ) {}

  @Get('authorize')
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
