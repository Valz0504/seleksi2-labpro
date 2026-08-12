import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TokenRequestError } from './token-request.error';
import { TokenService } from './token.service';

@Controller()
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Post('token')
  async exchange(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    response.set({
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    });

    try {
      if (!request.is('application/x-www-form-urlencoded')) {
        throw new TokenRequestError(
          'invalid_request',
          'Content-Type harus application/x-www-form-urlencoded',
        );
      }

      const result = await this.tokenService.exchange(
        {
          grantType: body['grant_type'],
          code: body['code'],
          redirectUri: body['redirect_uri'],
          codeVerifier: body['code_verifier'],
        },
        request.get('authorization'),
        { ipAddress: request.ip?.slice(0, 45) },
      );

      response.status(200).json({
        access_token: result.accessToken,
        token_type: result.tokenType,
        expires_in: result.expiresIn,
        scope: result.scope,
      });
    } catch (error: unknown) {
      if (!(error instanceof TokenRequestError)) {
        throw error;
      }

      if (error.code === 'invalid_client') {
        response.set('WWW-Authenticate', 'Basic realm="token"');
      }

      response.status(error.statusCode).json({
        error: error.code,
        error_description: error.message,
      });
    }
  }
}
