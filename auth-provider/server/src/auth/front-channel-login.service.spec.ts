import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FrontChannelLoginService } from './front-channel-login.service';

describe('FrontChannelLoginService', () => {
  const service = new FrontChannelLoginService(
    new ConfigService({
      AUTH_LOGIN_URL: 'http://localhost:3000/login',
      CONTROL_PANEL_ADMIN_LOGIN_URL: 'http://localhost:3000/admin/login',
      CONTROL_PANEL_ADMIN_DASHBOARD_URL: 'http://localhost:3000/admin',
    }),
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

  it('builds fixed admin login and dashboard destinations', () => {
    const loginPageUrl = new URL(
      service.buildAdminLoginPageUrl('invalid_credentials'),
    );

    expect(loginPageUrl.origin + loginPageUrl.pathname).toBe(
      'http://localhost:3000/admin/login',
    );
    expect(loginPageUrl.searchParams.get('error')).toBe('invalid_credentials');
    expect(service.getAdminDashboardUrl()).toBe('http://localhost:3000/admin');
  });

  it('accepts only the exact public Auth Provider UI origin', () => {
    expect(service.isPublicUiOrigin('http://localhost:3000')).toBe(true);

    for (const origin of [
      undefined,
      'http://localhost:3001',
      'https://localhost:3000',
      'http://localhost:3000.evil.example',
      'not-a-url',
    ]) {
      expect(service.isPublicUiOrigin(origin)).toBe(false);
    }
  });

  it('builds a fixed public home destination with an optional safe notice', () => {
    expect(service.buildPublicHomeUrl()).toBe('http://localhost:3000/');
    expect(service.buildPublicHomeUrl('sso_logged_out')).toBe(
      'http://localhost:3000/?session_notice=sso_logged_out',
    );
  });
});
