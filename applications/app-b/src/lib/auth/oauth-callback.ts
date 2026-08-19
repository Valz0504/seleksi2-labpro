import { timingSafeEqual } from 'node:crypto';
import type { RelyingApplicationConfig } from '../config/environment';

const AUTHORIZATION_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const OPAQUE_ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PROVIDER_RESPONSE_BYTES = 16 * 1024;
const PROVIDER_REQUEST_TIMEOUT_MS = 5_000;

export interface OAuthTokenResponse {
  accessToken: string;
  expiresIn: number;
}

export interface OAuthUserInfo {
  externalUserId: string;
  name: string;
  email: string;
  groups: string[];
  centralSessionId: string;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error('Provider returned a non-JSON response');
  }

  const body = await response.text();

  if (Buffer.byteLength(body, 'utf8') > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new Error('Provider response exceeded the accepted size');
  }

  const parsed: unknown = JSON.parse(body);

  if (!isRecord(parsed)) {
    throw new Error('Provider returned an invalid JSON object');
  }

  return parsed;
}

export function readAuthorizationCode(
  searchParams: URLSearchParams,
  expectedState: string,
): string | null {
  const states = searchParams.getAll('state');
  const codes = searchParams.getAll('code');

  if (
    states.length !== 1 ||
    codes.length !== 1 ||
    searchParams.has('error') ||
    !states[0] ||
    !codes[0] ||
    !constantTimeEqual(states[0], expectedState) ||
    !AUTHORIZATION_CODE_PATTERN.test(codes[0])
  ) {
    return null;
  }

  return codes[0];
}

export async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
  config: RelyingApplicationConfig,
  fetchImplementation: typeof fetch = fetch,
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  });
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`, 'utf8').toString(
    'base64',
  );
  const response = await fetchImplementation(config.tokenUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
  });

  if (response.status !== 200) {
    throw new Error('Authorization code exchange failed');
  }

  const payload = await readJsonObject(response);

  if (
    typeof payload['access_token'] !== 'string' ||
    !OPAQUE_ACCESS_TOKEN_PATTERN.test(payload['access_token']) ||
    payload['token_type'] !== 'Bearer' ||
    !Number.isSafeInteger(payload['expires_in']) ||
    (payload['expires_in'] as number) <= 0 ||
    typeof payload['scope'] !== 'string' ||
    !payload['scope'].split(' ').includes('profile')
  ) {
    throw new Error('Authorization server returned an invalid token response');
  }

  return {
    accessToken: payload['access_token'],
    expiresIn: payload['expires_in'] as number,
  };
}

export async function fetchUserInfo(
  accessToken: string,
  config: RelyingApplicationConfig,
  fetchImplementation: typeof fetch = fetch,
): Promise<OAuthUserInfo> {
  const response = await fetchImplementation(config.userInfoUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
  });

  if (response.status !== 200) {
    throw new Error('User information request failed');
  }

  const payload = await readJsonObject(response);
  const groups = payload['groups'];

  if (
    typeof payload['sub'] !== 'string' ||
    !UUID_PATTERN.test(payload['sub']) ||
    typeof payload['name'] !== 'string' ||
    payload['name'].length < 1 ||
    payload['name'].length > 200 ||
    typeof payload['email'] !== 'string' ||
    payload['email'].length < 3 ||
    payload['email'].length > 320 ||
    !payload['email'].includes('@') ||
    !Array.isArray(groups) ||
    groups.length > 100 ||
    !groups.every(
      (group): group is string =>
        typeof group === 'string' && group.length > 0 && group.length <= 100,
    ) ||
    payload['aud'] !== config.clientId ||
    payload['client_id'] !== config.clientId ||
    typeof payload['central_session_id'] !== 'string' ||
    !UUID_PATTERN.test(payload['central_session_id']) ||
    typeof payload['scope'] !== 'string' ||
    !payload['scope'].split(' ').includes('profile')
  ) {
    throw new Error('Authorization server returned invalid user information');
  }

  return {
    externalUserId: payload['sub'],
    name: payload['name'],
    email: payload['email'],
    groups,
    centralSessionId: payload['central_session_id'],
  };
}
