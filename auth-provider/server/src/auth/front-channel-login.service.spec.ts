import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FrontChannelLoginService } from './front-channel-login.service';

describe('FrontChannelLoginService', () => {
  const service = new FrontChannelLoginService(
    new ConfigService({ AUTH_LOGIN_URL: 'http://localhost:3000/login' }),
  );
  const returnTo =
    '/authorize?client_id=app-a&redirect_uri=http%3A%2F%2Flocalhost%3A3002%2Fauth%2Fcallback';

  it('accepts only a relative continuation to /authorize', () => {
    expect(service.requireSafeReturnTo(returnTo)).toBe(returnTo);

    for (const unsafeReturnTo of [
      'https://attacker.example/authorize',
      '//attacker.example/authorize',
      '/\\attacker.example/authorize',
      '/admin',
      '/authorize#fragment',
    ]) {
      expect(() => service.requireSafeReturnTo(unsafeReturnTo)).toThrow(
        BadRequestException,
      );
    }
  });

  it('builds the login page URL without losing the authorization request', () => {
    const loginPageUrl = new URL(service.buildLoginPageUrl(returnTo));

    expect(loginPageUrl.origin + loginPageUrl.pathname).toBe(
      'http://localhost:3000/login',
    );
    expect(loginPageUrl.searchParams.get('return_to')).toBe(returnTo);
    expect(loginPageUrl.searchParams.has('error')).toBe(false);
  });

  it('adds only a generic credential error to the login page URL', () => {
    const loginPageUrl = new URL(
      service.buildLoginPageUrl(returnTo, 'invalid_credentials'),
    );

    expect(loginPageUrl.searchParams.get('error')).toBe('invalid_credentials');
    expect(loginPageUrl.toString()).not.toContain('password');
  });
});
