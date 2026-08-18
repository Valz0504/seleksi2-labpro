import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  const validEnvironment = {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/auth_provider',
    RABBITMQ_URL: 'amqp://worker:secret@localhost:5672',
    INTERNAL_SERVICE_SECRET: 'a-secure-internal-service-secret',
  };

  it('applies safe worker defaults', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      SYNC_WORKER_CONSUMER_ENABLED: true,
      SYNC_WORKER_LOGOUT_HOST_OVERRIDE: undefined,
    });
  });

  it('requires database, RabbitMQ, and service credentials when enabled', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, DATABASE_URL: undefined }),
    ).toThrow('DATABASE_URL must be defined');
    expect(() =>
      validateEnvironment({ ...validEnvironment, RABBITMQ_URL: undefined }),
    ).toThrow('RABBITMQ_URL must be defined');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        INTERNAL_SERVICE_SECRET: 'short',
      }),
    ).toThrow('INTERNAL_SERVICE_SECRET must contain 16-1024');
  });

  it('allows RabbitMQ and service credentials to be omitted when disabled', () => {
    expect(
      validateEnvironment({
        DATABASE_URL: validEnvironment.DATABASE_URL,
        SYNC_WORKER_CONSUMER_ENABLED: 'false',
      }),
    ).toMatchObject({
      SYNC_WORKER_CONSUMER_ENABLED: false,
      RABBITMQ_URL: undefined,
      INTERNAL_SERVICE_SECRET: undefined,
    });
  });

  it('rejects invalid URL and boolean configuration', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        RABBITMQ_URL: 'http://localhost:15672',
      }),
    ).toThrow('RABBITMQ_URL must be a valid amqp: or amqps: URL');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        SYNC_WORKER_CONSUMER_ENABLED: 'yes',
      }),
    ).toThrow('SYNC_WORKER_CONSUMER_ENABLED must be either true or false');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        SYNC_WORKER_LOGOUT_HOST_OVERRIDE: 'http://localhost:3002',
      }),
    ).toThrow(
      'SYNC_WORKER_LOGOUT_HOST_OVERRIDE must be a hostname without scheme or port',
    );
  });

  it('normalizes a host-development logout hostname override', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        SYNC_WORKER_LOGOUT_HOST_OVERRIDE: 'LOCALHOST',
      }),
    ).toMatchObject({ SYNC_WORKER_LOGOUT_HOST_OVERRIDE: 'localhost' });
  });
});
