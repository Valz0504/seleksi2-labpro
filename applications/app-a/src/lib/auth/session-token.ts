import { createHash, randomBytes } from 'node:crypto';

export function generateLocalSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashLocalSessionToken(token: string): string {
  return createHash('sha256').update(token, 'ascii').digest('hex');
}
