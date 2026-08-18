function requireString(
  environment: Record<string, unknown>,
  name: string,
): string {
  const value = environment[name];

  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(`${name} must be defined without surrounding whitespace`);
  }

  return value;
}

function parseUrl(
  environment: Record<string, unknown>,
  name: string,
  protocols: readonly string[],
): string {
  const value = requireString(environment, name);

  try {
    const url = new URL(value);

    if (!protocols.includes(url.protocol) || url.hostname.length === 0) {
      throw new Error();
    }

    return url.toString();
  } catch {
    throw new Error(`${name} must be a valid ${protocols.join(' or ')} URL`);
  }
}

function parseConsumerEnabled(value: unknown): boolean {
  if (value === undefined || value === '') {
    return true;
  }

  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  throw new Error('SYNC_WORKER_CONSUMER_ENABLED must be either true or false');
}

function parsePositiveInteger(
  value: unknown,
  name: string,
  fallback: number,
): number {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function parseOptionalHostname(value: unknown): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    !/^[A-Za-z0-9.-]+$/.test(value)
  ) {
    throw new Error(
      'SYNC_WORKER_LOGOUT_HOST_OVERRIDE must be a hostname without scheme or port',
    );
  }

  return value.toLowerCase();
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  const consumerEnabled = parseConsumerEnabled(
    environment['SYNC_WORKER_CONSUMER_ENABLED'],
  );
  const databaseUrl = parseUrl(environment, 'DATABASE_URL', [
    'postgresql:',
    'postgres:',
  ]);
  const rabbitMqUrl = consumerEnabled
    ? parseUrl(environment, 'RABBITMQ_URL', ['amqp:', 'amqps:'])
    : environment['RABBITMQ_URL'];
  const internalServiceSecret = consumerEnabled
    ? requireString(environment, 'INTERNAL_SERVICE_SECRET')
    : environment['INTERNAL_SERVICE_SECRET'];
  const retryBaseMs = parsePositiveInteger(
    environment['DELIVERY_RETRY_BASE_MS'],
    'DELIVERY_RETRY_BASE_MS',
    1_000,
  );
  const retryMaxMs = parsePositiveInteger(
    environment['DELIVERY_RETRY_MAX_MS'],
    'DELIVERY_RETRY_MAX_MS',
    60_000,
  );

  if (
    consumerEnabled &&
    typeof internalServiceSecret === 'string' &&
    (internalServiceSecret.length < 16 ||
      internalServiceSecret.length > 1_024 ||
      !/^[\x21-\x7e]+$/.test(internalServiceSecret))
  ) {
    throw new Error(
      'INTERNAL_SERVICE_SECRET must contain 16-1024 visible ASCII characters',
    );
  }

  if (retryBaseMs > retryMaxMs) {
    throw new Error(
      'DELIVERY_RETRY_BASE_MS must not exceed DELIVERY_RETRY_MAX_MS',
    );
  }

  return {
    ...environment,
    DATABASE_URL: databaseUrl,
    RABBITMQ_URL: rabbitMqUrl,
    INTERNAL_SERVICE_SECRET: internalServiceSecret,
    SYNC_WORKER_CONSUMER_ENABLED: consumerEnabled,
    DELIVERY_RETRY_MAX_ATTEMPTS: parsePositiveInteger(
      environment['DELIVERY_RETRY_MAX_ATTEMPTS'],
      'DELIVERY_RETRY_MAX_ATTEMPTS',
      5,
    ),
    DELIVERY_RETRY_BASE_MS: retryBaseMs,
    DELIVERY_RETRY_MAX_MS: retryMaxMs,
    SYNC_WORKER_LOGOUT_HOST_OVERRIDE: parseOptionalHostname(
      environment['SYNC_WORKER_LOGOUT_HOST_OVERRIDE'],
    ),
  };
}
