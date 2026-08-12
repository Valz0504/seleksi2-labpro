import { randomBytes } from 'node:crypto';
import { hashSecret } from './secret';

const OPAQUE_TOKEN_BYTES = 32;

export function generateOpaqueToken(): string {
  return randomBytes(OPAQUE_TOKEN_BYTES).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return hashSecret(token);
}
