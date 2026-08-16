import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { RelyingApplicationConfig } from '../config/environment';

export const OAUTH_TRANSACTION_TTL_SECONDS = 10 * 60;

const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const ENVELOPE_VERSION = 'v1';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const ALLOWED_CLOCK_SKEW_MS = 30_000;

export interface OAuthLoginTransaction {
  state: string;
  codeVerifier: string;
  issuedAt: number;
}

export interface OAuthLoginInitiation {
  authorizationUrl: string;
  cookieValue: string;
}

function deriveEncryptionKey(config: RelyingApplicationConfig): Buffer {
  return createHash('sha256')
    .update('relying-application-oauth-transaction-v1\0', 'utf8')
    .update(config.clientId, 'utf8')
    .update('\0', 'utf8')
    .update(config.clientSecret, 'utf8')
    .digest();
}

function createAdditionalAuthenticatedData(clientId: string): Buffer {
  return Buffer.from(`${ENVELOPE_VERSION}:${clientId}`, 'utf8');
}

function sealTransaction(
  transaction: OAuthLoginTransaction,
  config: RelyingApplicationConfig,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveEncryptionKey(config), iv);
  cipher.setAAD(createAdditionalAuthenticatedData(config.clientId));

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(transaction), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    authTag.toString('base64url'),
  ].join('.');
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Invalid base64url segment');
  }

  const decoded = Buffer.from(value, 'base64url');

  if (decoded.toString('base64url') !== value) {
    throw new Error('Non-canonical base64url segment');
  }

  return decoded;
}

function isTransactionPayload(value: unknown): value is OAuthLoginTransaction {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate['state'] === 'string' &&
    STATE_PATTERN.test(candidate['state']) &&
    typeof candidate['codeVerifier'] === 'string' &&
    PKCE_VERIFIER_PATTERN.test(candidate['codeVerifier']) &&
    typeof candidate['issuedAt'] === 'number' &&
    Number.isSafeInteger(candidate['issuedAt'])
  );
}

export function createOAuthLoginInitiation(
  config: RelyingApplicationConfig,
  now = new Date(),
): OAuthLoginInitiation {
  const state = randomBytes(32).toString('base64url');
  const codeVerifier = randomBytes(64).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
  const cookieValue = sealTransaction({ state, codeVerifier, issuedAt: now.getTime() }, config);
  const authorizationUrl = new URL(config.authorizeUrl);
  authorizationUrl.searchParams.set('client_id', config.clientId);
  authorizationUrl.searchParams.set('redirect_uri', config.redirectUri);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('code_challenge', codeChallenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');

  return {
    authorizationUrl: authorizationUrl.toString(),
    cookieValue,
  };
}

export function readOAuthLoginTransaction(
  cookieValue: string,
  config: RelyingApplicationConfig,
  now = new Date(),
): OAuthLoginTransaction | null {
  try {
    const [version, encodedIv, encodedCiphertext, encodedAuthTag, extra] = cookieValue.split('.');

    if (
      version !== ENVELOPE_VERSION ||
      !encodedIv ||
      !encodedCiphertext ||
      !encodedAuthTag ||
      extra !== undefined
    ) {
      return null;
    }

    const iv = decodeBase64Url(encodedIv);
    const ciphertext = decodeBase64Url(encodedCiphertext);
    const authTag = decodeBase64Url(encodedAuthTag);

    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      return null;
    }

    const decipher = createDecipheriv('aes-256-gcm', deriveEncryptionKey(config), iv);
    decipher.setAAD(createAdditionalAuthenticatedData(config.clientId));
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      'utf8',
    );
    const parsed: unknown = JSON.parse(plaintext);

    if (!isTransactionPayload(parsed)) {
      return null;
    }

    const ageMs = now.getTime() - parsed.issuedAt;

    if (ageMs < -ALLOWED_CLOCK_SKEW_MS || ageMs > OAUTH_TRANSACTION_TTL_SECONDS * 1000) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
