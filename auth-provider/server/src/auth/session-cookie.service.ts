import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

@Injectable()
export class SessionCookieService {
  constructor(private readonly configService: ConfigService) {}

  read(request: Request): string | null {
    const cookieName = this.getCookieName();
    const cookieValue = request.signedCookies?.[cookieName] as unknown;

    return typeof cookieValue === 'string' ? cookieValue : null;
  }

  write(response: Response, sessionToken: string): void {
    const ttlSeconds = this.configService.getOrThrow<number>(
      'SSO_SESSION_TTL_SECONDS',
    );

    response.cookie(this.getCookieName(), sessionToken, {
      ...this.getBaseCookieOptions(),
      maxAge: ttlSeconds * 1000,
    });
  }

  clear(response: Response): void {
    response.clearCookie(this.getCookieName(), this.getBaseCookieOptions());
  }

  private getCookieName(): string {
    return this.configService.getOrThrow<string>('SSO_COOKIE_NAME');
  }

  private getBaseCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: this.configService.getOrThrow<boolean>('SSO_COOKIE_SECURE'),
      signed: true,
    };
  }
}
