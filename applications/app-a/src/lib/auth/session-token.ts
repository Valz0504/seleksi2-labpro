import { createHash, randomBytes } from 'node:crypto';

const LOCAL_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateLocalSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashLocalSessionToken(token: string): string {
  return createHash('sha256').update(token, 'ascii').digest('hex');
}

export function isLocalSessionToken(token: string): boolean {
  return LOCAL_SESSION_TOKEN_PATTERN.test(token);
}
