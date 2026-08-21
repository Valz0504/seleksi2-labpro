import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

@Injectable()
export class MfaChallengeCookieService {
  constructor(private readonly configService: ConfigService) {}

  read(request: Request): string | null {
    const value = request.signedCookies?.[this.getCookieName()] as unknown;

    return typeof value === 'string' ? value : null;
  }

  write(response: Response, challengeToken: string): void {
    const ttlSeconds = this.configService.getOrThrow<number>(
      'MFA_CHALLENGE_TTL_SECONDS',
    );

    response.cookie(this.getCookieName(), challengeToken, {
      ...this.getBaseCookieOptions(),
      maxAge: ttlSeconds * 1000,
    });
  }

  clear(response: Response): void {
    response.clearCookie(this.getCookieName(), this.getBaseCookieOptions());
  }

  private getCookieName(): string {
    return this.configService.getOrThrow<string>('MFA_CHALLENGE_COOKIE_NAME');
  }

  private getBaseCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      path: '/auth/login/mfa',
      sameSite: 'lax',
      secure: this.configService.getOrThrow<boolean>('SSO_COOKIE_SECURE'),
      signed: true,
    };
  }
}
