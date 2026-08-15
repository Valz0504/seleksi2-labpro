export interface RelyingApplicationEnvironmentNames {
  applicationName: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  launchUrl: string;
}

export interface RelyingApplicationConfig {
  applicationName: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  launchUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
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

  const clientSecret = requireBoundedString(environment, names.clientSecret, 16, 1024);
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
    redirectUri: redirectUri.toString(),
    launchUrl: launchUrl.toString(),
    authorizeUrl: new URL('/authorize', publicAuthServerUrl).toString(),
    tokenUrl: new URL('/token', internalAuthServerUrl).toString(),
    userInfoUrl: new URL('/userinfo', internalAuthServerUrl).toString(),
  };
}
