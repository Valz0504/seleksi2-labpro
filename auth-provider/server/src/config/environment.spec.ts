import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  const validEnvironment = {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/auth_provider',
    SSO_COOKIE_SECRET: 'a-secure-cookie-secret-with-at-least-32-characters',
    MFA_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
    AUTH_LOGIN_URL: 'http://localhost:3000/login',
    CONTROL_PANEL_ADMIN_LOGIN_URL: 'http://localhost:3000/admin/login',
    CONTROL_PANEL_ADMIN_DASHBOARD_URL: 'http://localhost:3000/admin',
    RABBITMQ_URL: 'amqp://user:password@localhost:5672',
  };

  it('applies safe development defaults for session and OAuth lifetimes', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      SSO_COOKIE_NAME: 'sso_session',
      MFA_CHALLENGE_COOKIE_NAME: 'mfa_challenge',
      MFA_CHALLENGE_TTL_SECONDS: 300,
      MFA_CHALLENGE_MAX_ATTEMPTS: 5,
      SSO_COOKIE_SECURE: false,
      SSO_SESSION_TTL_SECONDS: 28_800,
      AUTHORIZATION_CODE_TTL_SECONDS: 300,
      ACCESS_TOKEN_TTL_SECONDS: 900,
      OUTBOX_PUBLISHER_ENABLED: true,
      RABBITMQ_CONNECTION_TIMEOUT_MS: 5_000,
      RABBITMQ_HEARTBEAT_SECONDS: 10,
      RABBITMQ_PUBLISH_CONFIRM_TIMEOUT_MS: 10_000,
      OUTBOX_PUBLISH_INTERVAL_MS: 1_000,
      OUTBOX_PUBLISH_BATCH_SIZE: 50,
      OUTBOX_PUBLISH_LEASE_MS: 30_000,
      OUTBOX_PUBLISH_RETRY_BASE_MS: 1_000,
      OUTBOX_PUBLISH_RETRY_MAX_MS: 60_000,
      SHUTDOWN_TIMEOUT_MS: 10_000,
      SWAGGER_ENABLED: true,
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

  it('requires a 32-byte hexadecimal MFA encryption key', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        MFA_ENCRYPTION_KEY: 'not-a-32-byte-hex-key',
      }),
    ).toThrow(
      'MFA_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters',
    );
  });

  it('keeps the pending MFA cookie separate from the central-session cookie', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        MFA_CHALLENGE_COOKIE_NAME: 'sso_session',
      }),
    ).toThrow('MFA_CHALLENGE_COOKIE_NAME must differ from SSO_COOKIE_NAME');
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
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        SWAGGER_ENABLED: 'yes',
      }),
    ).toThrow('SWAGGER_ENABLED must be either true or false');
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

  it('requires a valid AMQP URL while the outbox publisher is enabled', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        RABBITMQ_URL: 'https://localhost:15672',
      }),
    ).toThrow('RABBITMQ_URL must be a valid AMQP(S) URL');
    expect(() => {
      const withoutRabbitMq: Record<string, unknown> = {
        ...validEnvironment,
      };

      delete withoutRabbitMq['RABBITMQ_URL'];

      validateEnvironment(withoutRabbitMq);
    }).toThrow('RABBITMQ_URL must be defined');
  });

  it('allows RabbitMQ to be omitted when the outbox publisher is disabled', () => {
    const withoutRabbitMq: Record<string, unknown> = { ...validEnvironment };

    delete withoutRabbitMq['RABBITMQ_URL'];

    expect(
      validateEnvironment({
        ...withoutRabbitMq,
        OUTBOX_PUBLISHER_ENABLED: 'false',
      }),
    ).toMatchObject({
      OUTBOX_PUBLISHER_ENABLED: false,
      RABBITMQ_URL: undefined,
    });
  });

  it('rejects invalid outbox publisher numeric configuration', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        OUTBOX_PUBLISH_BATCH_SIZE: '0',
      }),
    ).toThrow('OUTBOX_PUBLISH_BATCH_SIZE must be a positive integer');
  });

  it('rejects an invalid graceful shutdown timeout', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        SHUTDOWN_TIMEOUT_MS: '0',
      }),
    ).toThrow('SHUTDOWN_TIMEOUT_MS must be a positive integer');
  });
});
