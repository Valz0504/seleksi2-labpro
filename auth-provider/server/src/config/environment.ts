const DEFAULT_SSO_COOKIE_NAME = 'sso_session';
const DEFAULT_SSO_SESSION_TTL_SECONDS = 8 * 60 * 60;
const DEFAULT_AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_OUTBOX_PUBLISH_INTERVAL_MS = 1_000;
const DEFAULT_OUTBOX_PUBLISH_BATCH_SIZE = 50;
const DEFAULT_OUTBOX_PUBLISH_LEASE_MS = 30_000;
const DEFAULT_OUTBOX_PUBLISH_RETRY_BASE_MS = 1_000;
const DEFAULT_OUTBOX_PUBLISH_RETRY_MAX_MS = 60_000;
const DEFAULT_RABBITMQ_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_RABBITMQ_HEARTBEAT_SECONDS = 10;
const DEFAULT_RABBITMQ_PUBLISH_CONFIRM_TIMEOUT_MS = 10_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

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

function requireAmqpUrl(
  environment: Record<string, unknown>,
  name: string,
): string {
  const value = requireString(environment, name);

  try {
    const url = new URL(value);

    if (
      (url.protocol !== 'amqp:' && url.protocol !== 'amqps:') ||
      url.hostname.length === 0 ||
      url.hash !== ''
    ) {
      throw new Error();
    }

    return url.toString();
  } catch {
    throw new Error(`${name} must be a valid AMQP(S) URL`);
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
  const outboxPublisherEnabled = parseBoolean(
    environment['OUTBOX_PUBLISHER_ENABLED'],
    'OUTBOX_PUBLISHER_ENABLED',
    true,
  );
  const rabbitMqUrl = outboxPublisherEnabled
    ? requireAmqpUrl(environment, 'RABBITMQ_URL')
    : environment['RABBITMQ_URL'];
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
    OUTBOX_PUBLISHER_ENABLED: outboxPublisherEnabled,
    RABBITMQ_URL: rabbitMqUrl,
    RABBITMQ_CONNECTION_TIMEOUT_MS: parsePositiveInteger(
      environment['RABBITMQ_CONNECTION_TIMEOUT_MS'],
      'RABBITMQ_CONNECTION_TIMEOUT_MS',
      DEFAULT_RABBITMQ_CONNECTION_TIMEOUT_MS,
    ),
    RABBITMQ_HEARTBEAT_SECONDS: parsePositiveInteger(
      environment['RABBITMQ_HEARTBEAT_SECONDS'],
      'RABBITMQ_HEARTBEAT_SECONDS',
      DEFAULT_RABBITMQ_HEARTBEAT_SECONDS,
    ),
    RABBITMQ_PUBLISH_CONFIRM_TIMEOUT_MS: parsePositiveInteger(
      environment['RABBITMQ_PUBLISH_CONFIRM_TIMEOUT_MS'],
      'RABBITMQ_PUBLISH_CONFIRM_TIMEOUT_MS',
      DEFAULT_RABBITMQ_PUBLISH_CONFIRM_TIMEOUT_MS,
    ),
    OUTBOX_PUBLISH_INTERVAL_MS: parsePositiveInteger(
      environment['OUTBOX_PUBLISH_INTERVAL_MS'],
      'OUTBOX_PUBLISH_INTERVAL_MS',
      DEFAULT_OUTBOX_PUBLISH_INTERVAL_MS,
    ),
    OUTBOX_PUBLISH_BATCH_SIZE: parsePositiveInteger(
      environment['OUTBOX_PUBLISH_BATCH_SIZE'],
      'OUTBOX_PUBLISH_BATCH_SIZE',
      DEFAULT_OUTBOX_PUBLISH_BATCH_SIZE,
    ),
    OUTBOX_PUBLISH_LEASE_MS: parsePositiveInteger(
      environment['OUTBOX_PUBLISH_LEASE_MS'],
      'OUTBOX_PUBLISH_LEASE_MS',
      DEFAULT_OUTBOX_PUBLISH_LEASE_MS,
    ),
    OUTBOX_PUBLISH_RETRY_BASE_MS: parsePositiveInteger(
      environment['OUTBOX_PUBLISH_RETRY_BASE_MS'],
      'OUTBOX_PUBLISH_RETRY_BASE_MS',
      DEFAULT_OUTBOX_PUBLISH_RETRY_BASE_MS,
    ),
    OUTBOX_PUBLISH_RETRY_MAX_MS: parsePositiveInteger(
      environment['OUTBOX_PUBLISH_RETRY_MAX_MS'],
      'OUTBOX_PUBLISH_RETRY_MAX_MS',
      DEFAULT_OUTBOX_PUBLISH_RETRY_MAX_MS,
    ),
    SHUTDOWN_TIMEOUT_MS: parsePositiveInteger(
      environment['SHUTDOWN_TIMEOUT_MS'],
      'SHUTDOWN_TIMEOUT_MS',
      DEFAULT_SHUTDOWN_TIMEOUT_MS,
    ),
    SWAGGER_ENABLED: parseBoolean(
      environment['SWAGGER_ENABLED'],
      'SWAGGER_ENABLED',
      true,
    ),
  };
}
