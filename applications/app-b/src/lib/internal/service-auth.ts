import { createHash, timingSafeEqual } from 'node:crypto';

function digestSecret(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function isInternalServiceAuthorized(
  authorizationHeader: string | null,
  expectedSecret: string,
): boolean {
  const match = authorizationHeader?.match(/^Bearer ([\x21-\x7e]+)$/i);

  if (!match) {
    return false;
  }

  return timingSafeEqual(digestSecret(match[1]), digestSecret(expectedSecret));
}
