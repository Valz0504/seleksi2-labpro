const DEFAULT_SSO_COOKIE_NAME = 'sso_session';
const DEFAULT_SSO_SESSION_TTL_SECONDS = 8 * 60 * 60;
const DEFAULT_AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

function requireHttpUrl(
  environment: Record<string, unknown>,
  name: string,
): string {
  const value = requireString(environment, name);

  try {
    const url = new URL(value);

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username !== '' ||
      url.password !== '' ||
      url.hash !== ''
    ) {
      throw new Error();
    }

    return url.toString();
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL`);
  }
}

function requireString(
  environment: Record<string, unknown>,
  name: string,
): string {
  const value = environment[name];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be defined`);
  }

  return value;
}

function parsePositiveInteger(
  value: unknown,
  name: string,
  fallback: number,
): number {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsedValue = Number(value);

  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsedValue;
}

function parseBoolean(
  value: unknown,
  name: string,
  fallback: boolean,
): boolean {
  if (value === undefined || value === '') {
    return fallback;
  }

  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  throw new Error(`${name} must be either true or false`);
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  const databaseUrl = requireString(environment, 'DATABASE_URL');
  const cookieSecret = requireString(environment, 'SSO_COOKIE_SECRET');
  const authLoginUrl = requireHttpUrl(environment, 'AUTH_LOGIN_URL');
  const controlPanelAdminLoginUrl = requireHttpUrl(
    environment,
    'CONTROL_PANEL_ADMIN_LOGIN_URL',
  );
  const controlPanelAdminDashboardUrl = requireHttpUrl(
    environment,
    'CONTROL_PANEL_ADMIN_DASHBOARD_URL',
  );
  const cookieName =
    typeof environment['SSO_COOKIE_NAME'] === 'string' &&
    environment['SSO_COOKIE_NAME'].length > 0
      ? environment['SSO_COOKIE_NAME']
      : DEFAULT_SSO_COOKIE_NAME;

  if (cookieSecret.length < 32) {
    throw new Error('SSO_COOKIE_SECRET must contain at least 32 characters');
  }

  if (!/^[A-Za-z0-9_-]+$/.test(cookieName)) {
    throw new Error(
      'SSO_COOKIE_NAME may only contain letters, numbers, underscores, and hyphens',
    );
  }

  return {
    ...environment,
    DATABASE_URL: databaseUrl,
    AUTH_LOGIN_URL: authLoginUrl,
    CONTROL_PANEL_ADMIN_LOGIN_URL: controlPanelAdminLoginUrl,
    CONTROL_PANEL_ADMIN_DASHBOARD_URL: controlPanelAdminDashboardUrl,
    SSO_COOKIE_SECRET: cookieSecret,
    SSO_COOKIE_NAME: cookieName,
    SSO_COOKIE_SECURE: parseBoolean(
      environment['SSO_COOKIE_SECURE'],
      'SSO_COOKIE_SECURE',
      false,
    ),
    SSO_SESSION_TTL_SECONDS: parsePositiveInteger(
      environment['SSO_SESSION_TTL_SECONDS'],
      'SSO_SESSION_TTL_SECONDS',
      DEFAULT_SSO_SESSION_TTL_SECONDS,
    ),
    AUTHORIZATION_CODE_TTL_SECONDS: parsePositiveInteger(
      environment['AUTHORIZATION_CODE_TTL_SECONDS'],
      'AUTHORIZATION_CODE_TTL_SECONDS',
      DEFAULT_AUTHORIZATION_CODE_TTL_SECONDS,
    ),
    ACCESS_TOKEN_TTL_SECONDS: parsePositiveInteger(
      environment['ACCESS_TOKEN_TTL_SECONDS'],
      'ACCESS_TOKEN_TTL_SECONDS',
      DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
    ),
  };
}
