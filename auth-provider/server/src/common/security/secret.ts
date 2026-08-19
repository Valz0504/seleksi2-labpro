import { createHash, timingSafeEqual } from 'node:crypto';

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function verifySecret(secret: string, expectedHash: string): boolean {
  const actualHashBuffer = Buffer.from(hashSecret(secret), 'hex');
  const expectedHashBuffer = Buffer.from(expectedHash, 'hex');

  return (
    expectedHashBuffer.length === actualHashBuffer.length &&
    timingSafeEqual(actualHashBuffer, expectedHashBuffer)
  );
}
