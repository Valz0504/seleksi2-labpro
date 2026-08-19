function requireHttpUrl(name: string, fallback: string): URL {
  const value = process.env[name] ?? fallback;

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

    return url;
  } catch {
    throw new Error(`${name} harus berupa URL HTTP(S) yang valid`);
  }
}

export function buildPublicAuthServerUrl(path: string): string {
  return new URL(
    path,
    requireHttpUrl('AUTH_SERVER_PUBLIC_URL', 'http://localhost:3001'),
  ).toString();
}

export function buildInternalAuthServerUrl(path: string): string {
  return new URL(
    path,
    requireHttpUrl('AUTH_SERVER_INTERNAL_URL', 'http://localhost:3001'),
  ).toString();
}
