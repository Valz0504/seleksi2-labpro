import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  const validEnvironment = {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/auth_provider',
    SSO_COOKIE_SECRET: 'a-secure-cookie-secret-with-at-least-32-characters',
    AUTH_LOGIN_URL: 'http://localhost:3000/login',
  };

  it('applies safe development defaults for session and OAuth lifetimes', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      SSO_COOKIE_NAME: 'sso_session',
      SSO_COOKIE_SECURE: false,
      SSO_SESSION_TTL_SECONDS: 28_800,
      AUTHORIZATION_CODE_TTL_SECONDS: 300,
      ACCESS_TOKEN_TTL_SECONDS: 900,
    });
  });

  it('rejects a short cookie signing secret', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        SSO_COOKIE_SECRET: 'too-short',
      }),
    ).toThrow('SSO_COOKIE_SECRET must contain at least 32 characters');
  });

  it('rejects invalid TTL and boolean values', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        SSO_SESSION_TTL_SECONDS: '0',
      }),
    ).toThrow('SSO_SESSION_TTL_SECONDS must be a positive integer');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        SSO_COOKIE_SECURE: 'yes',
      }),
    ).toThrow('SSO_COOKIE_SECURE must be either true or false');
  });

  it('rejects an invalid or credential-bearing login page URL', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AUTH_LOGIN_URL: 'javascript:alert(1)',
      }),
    ).toThrow('AUTH_LOGIN_URL must be a valid HTTP(S) URL');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AUTH_LOGIN_URL: 'https://user:password@example.com/login',
      }),
    ).toThrow('AUTH_LOGIN_URL must be a valid HTTP(S) URL');
  });
});
