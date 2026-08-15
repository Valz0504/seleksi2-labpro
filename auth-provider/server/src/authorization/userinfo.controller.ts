import { Controller, Get, Req, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { UserInfoError } from './userinfo.error';
import { UserInfoService } from './userinfo.service';

@Controller()
@ApiTags('User information')
export class UserInfoController {
  constructor(private readonly userInfoService: UserInfoService) {}

  @Get('userinfo')
  @ApiOperation({
    summary: 'Return the audience-bound profile for an opaque access token',
    description:
      'Revalidates token status/expiry/scope, user, application audience, central session, and current group policy before returning identity data.',
  })
  @ApiBearerAuth('accessToken')
  @ApiOkResponse({
    description: 'Profile obtained from the Auth Provider.',
    schema: {
      example: {
        sub: '11111111-1111-4111-8111-111111111111',
        name: 'Example User',
        email: 'user@example.com',
        groups: ['app-a-users'],
        aud: 'app-a',
        client_id: 'app-a',
        central_session_id: '22222222-2222-4222-8222-222222222222',
        scope: 'profile',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description:
      'Generic invalid_token response. Internal revocation or policy details are not disclosed.',
  })
  async getProfile(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    response.set({
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    });

    try {
      const profile = await this.userInfoService.getProfile(
        request.get('authorization'),
      );

      response.status(200).json({
        sub: profile.sub,
        name: profile.name,
        email: profile.email,
        groups: profile.groups,
        aud: profile.aud,
        client_id: profile.clientId,
        central_session_id: profile.centralSessionId,
        scope: profile.scope,
      });
    } catch (error: unknown) {
      if (!(error instanceof UserInfoError)) {
        throw error;
      }

      response.set(
        'WWW-Authenticate',
        'Bearer realm="userinfo", error="invalid_token"',
      );
      response.status(error.statusCode).json({
        error: error.code,
        error_description: error.message,
      });
    }
  }
}
