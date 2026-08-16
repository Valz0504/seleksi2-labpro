import type { RevocationEvent } from '@seleksi/shared';

export interface InternalLogoutPlan {
  externalUserId: string;
  centralSessionId?: string;
  revokeReason: string;
  activityMessage: string;
}

export function createInternalLogoutPlan(event: RevocationEvent): InternalLogoutPlan {
  if (event.eventType === 'SessionRevoked') {
    return {
      externalUserId: event.userId,
      centralSessionId: event.centralSessionId ?? undefined,
      revokeReason: event.reason,
      activityMessage: 'Local session dicabut setelah central session direvoke',
    };
  }

  if (event.eventType === 'PasswordChanged') {
    return {
      externalUserId: event.userId,
      revokeReason: 'password_changed',
      activityMessage: 'Local session dicabut setelah password user berubah',
    };
  }

  return {
    externalUserId: event.userId,
    revokeReason: 'access_policy_changed',
    activityMessage: 'Local session dicabut setelah akses aplikasi berubah',
  };
}
