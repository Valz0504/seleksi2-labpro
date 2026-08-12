import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { UserInfoError } from './userinfo.error';
import { UserInfoService } from './userinfo.service';

@Controller()
export class UserInfoController {
  constructor(private readonly userInfoService: UserInfoService) {}

  @Get('userinfo')
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
