export interface RelyingApplicationEnvironmentNames {
  applicationName: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  launchUrl: string;
  oauthTransactionCookieName: string;
  localSessionCookieName: string;
}

export interface RelyingApplicationConfig {
  applicationName: string;
  clientId: string;
  clientSecret: string;
  internalServiceSecret: string;
  redirectUri: string;
  launchUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  oauthTransactionCookieName: string;
  oauthTransactionCookieSecure: boolean;
  localSessionCookieName: string;
  localSessionCookieSecure: boolean;
  localSessionTtlSeconds: number;
}

type Environment = Readonly<Record<string, string | undefined>>;

function requireBoundedString(
  environment: Environment,
  name: string,
  minimumLength: number,
  maximumLength: number,
): string {
  const value = environment[name];

  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    value.length < minimumLength ||
    value.length > maximumLength
  ) {
    throw new Error(
      `${name} harus berisi ${minimumLength}-${maximumLength} karakter tanpa whitespace di awal atau akhir`,
    );
  }

  return value;
}

function requireBaseHttpUrl(environment: Environment, name: string, fallback?: string): URL {
  const value = environment[name] ?? fallback;

  try {
    if (!value) {
      throw new Error();
    }

    const url = new URL(value);

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username !== '' ||
      url.password !== '' ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      throw new Error();
    }

    return url;
  } catch {
    throw new Error(`${name} harus berupa base URL HTTP(S) yang valid`);
  }
}

function requireRedirectUri(environment: Environment, name: string, launchUrl: URL): URL {
  const value = environment[name];

  try {
    if (!value) {
      throw new Error();
    }

    const url = new URL(value);

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username !== '' ||
      url.password !== '' ||
      url.origin !== launchUrl.origin ||
      url.pathname !== '/auth/callback' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      throw new Error();
    }

    return url;
  } catch {
    throw new Error(`${name} harus exact callback /auth/callback pada origin application`);
  }
}

function readBoundedInteger(
  environment: Environment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const rawValue = environment[name];

  if (rawValue === undefined) {
    return fallback;
  }

  if (!/^[1-9][0-9]*$/.test(rawValue)) {
    throw new Error(`${name} harus berupa bilangan bulat positif`);
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} harus berada pada rentang ${minimum}-${maximum} detik`);
  }

  return value;
}

export function validateRelyingApplicationEnvironment(
  environment: Environment,
  names: RelyingApplicationEnvironmentNames,
): RelyingApplicationConfig {
  const clientId = requireBoundedString(environment, names.clientId, 1, 100);

  if (!/^[A-Za-z0-9._-]+$/.test(clientId)) {
    throw new Error(
      `${names.clientId} hanya boleh berisi huruf, angka, titik, underscore, dan hyphen`,
    );
  }

  if (!/^[A-Za-z0-9_-]{1,64}$/.test(names.oauthTransactionCookieName)) {
    throw new Error(
      'oauthTransactionCookieName hanya boleh berisi huruf, angka, underscore, dan hyphen',
    );
  }

  if (!/^[A-Za-z0-9_-]{1,64}$/.test(names.localSessionCookieName)) {
    throw new Error(
      'localSessionCookieName hanya boleh berisi huruf, angka, underscore, dan hyphen',
    );
  }

  const clientSecret = requireBoundedString(environment, names.clientSecret, 16, 1024);
  const internalServiceSecret = requireBoundedString(
    environment,
    'INTERNAL_SERVICE_SECRET',
    16,
    1024,
  );

  if (!/^[\x21-\x7e]+$/.test(internalServiceSecret)) {
    throw new Error('INTERNAL_SERVICE_SECRET harus berupa opaque secret tanpa whitespace');
  }

  const launchUrl = requireBaseHttpUrl(environment, names.launchUrl);
  const redirectUri = requireRedirectUri(environment, names.redirectUri, launchUrl);
  const publicAuthServerUrl = requireBaseHttpUrl(environment, 'AUTH_SERVER_PUBLIC_URL');
  const internalAuthServerUrl = requireBaseHttpUrl(
    environment,
    'AUTH_SERVER_INTERNAL_URL',
    publicAuthServerUrl.toString(),
  );

  return {
    applicationName: names.applicationName,
    clientId,
    clientSecret,
    internalServiceSecret,
    redirectUri: redirectUri.toString(),
    launchUrl: launchUrl.toString(),
    authorizeUrl: new URL('/authorize', publicAuthServerUrl).toString(),
    tokenUrl: new URL('/token', internalAuthServerUrl).toString(),
    userInfoUrl: new URL('/userinfo', internalAuthServerUrl).toString(),
    oauthTransactionCookieName: names.oauthTransactionCookieName,
    oauthTransactionCookieSecure: launchUrl.protocol === 'https:',
    localSessionCookieName: names.localSessionCookieName,
    localSessionCookieSecure: launchUrl.protocol === 'https:',
    localSessionTtlSeconds: readBoundedInteger(
      environment,
      'LOCAL_SESSION_TTL_SECONDS',
      8 * 60 * 60,
      5 * 60,
      24 * 60 * 60,
    ),
  };
}
