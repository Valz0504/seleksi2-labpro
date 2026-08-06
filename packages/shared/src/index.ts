export type EventType = 'SessionRevoked' | 'PasswordChanged' | 'AccessPolicyChanged';

export interface RevocationEvent {
  eventId: string;
  eventType: EventType;
  userId: string;
  centralSessionId: string | null;
  applicationId: string | null;
  reason: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface StandardError {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}
