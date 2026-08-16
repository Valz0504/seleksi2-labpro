export type LocalSessionLifecycleState = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

interface LocalSessionStateInput {
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  expiresAt: Date;
  revokedAt: Date | null;
}

export function classifyLocalSession(
  session: LocalSessionStateInput,
  now: Date,
): LocalSessionLifecycleState {
  if (session.status === 'REVOKED' || session.revokedAt !== null) {
    return 'REVOKED';
  }

  if (session.status === 'EXPIRED' || session.expiresAt <= now) {
    return 'EXPIRED';
  }

  return 'ACTIVE';
}
