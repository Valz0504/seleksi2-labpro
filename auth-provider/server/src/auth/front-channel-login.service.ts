import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const AUTH_SERVER_BASE_URL = 'http://auth-server.internal';

export type LoginPageError = 'invalid_credentials';

@Injectable()
export class FrontChannelLoginService {
  constructor(private readonly configService: ConfigService) {}

  requireSafeReturnTo(value: string): string {
    if (!value.startsWith('/') || value.startsWith('//')) {
      throw this.invalidReturnToException();
    }

    try {
      const returnToUrl = new URL(value, AUTH_SERVER_BASE_URL);

      if (
        returnToUrl.origin !== AUTH_SERVER_BASE_URL ||
        returnToUrl.pathname !== '/authorize' ||
        returnToUrl.hash !== ''
      ) {
        throw this.invalidReturnToException();
      }

      return `${returnToUrl.pathname}${returnToUrl.search}`;
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw this.invalidReturnToException();
    }
  }

  buildLoginPageUrl(returnTo: string, error?: LoginPageError): string {
    const safeReturnTo = this.requireSafeReturnTo(returnTo);
    const loginPageUrl = new URL(
      this.configService.getOrThrow<string>('AUTH_LOGIN_URL'),
    );

    loginPageUrl.searchParams.set('return_to', safeReturnTo);

    if (error) {
      loginPageUrl.searchParams.set('error', error);
    } else {
      loginPageUrl.searchParams.delete('error');
    }

    return loginPageUrl.toString();
  }

  private invalidReturnToException(): BadRequestException {
    return new BadRequestException({
      error: {
        code: 'INVALID_LOGIN_CONTINUATION',
        message: 'Tujuan lanjutan login tidak valid',
      },
    });
  }
}
