import { createHash } from 'node:crypto';

export type EventType = 'SessionRevoked' | 'PasswordChanged' | 'AccessPolicyChanged';

export const REVOCATION_EVENT_TYPES: readonly EventType[] = [
  'SessionRevoked',
  'PasswordChanged',
  'AccessPolicyChanged',
];

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

const REVOCATION_EVENT_FIELDS = new Set([
  'eventId',
  'eventType',
  'userId',
  'centralSessionId',
  'applicationId',
  'reason',
  'occurredAt',
  'metadata',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_PATTERN = /^[a-z][a-z0-9_]{0,99}$/;

export class RevocationEventValidationError extends Error {
  constructor() {
    super('Invalid revocation event');
    this.name = 'RevocationEventValidationError';
  }
}

function invalidEvent(): never {
  throw new RevocationEventValidationError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 10) {
    return false;
  }

  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item, depth + 1));
  }

  if (isRecord(value)) {
    return Object.values(value).every((item) => isJsonValue(item, depth + 1));
  }

  return false;
}

function readUuid(value: unknown, nullable = false): string | null {
  if (nullable && value === null) {
    return null;
  }

  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    return invalidEvent();
  }

  return value.toLowerCase();
}

function readOccurredAt(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  ) {
    return invalidEvent();
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return invalidEvent();
  }

  return timestamp.toISOString();
}

export function parseRevocationEvent(value: unknown): RevocationEvent {
  if (!isRecord(value)) {
    return invalidEvent();
  }

  const keys = Object.keys(value);

  if (
    keys.length !== REVOCATION_EVENT_FIELDS.size ||
    keys.some((key) => !REVOCATION_EVENT_FIELDS.has(key))
  ) {
    return invalidEvent();
  }

  if (
    typeof value.eventType !== 'string' ||
    !REVOCATION_EVENT_TYPES.includes(value.eventType as EventType) ||
    typeof value.reason !== 'string' ||
    value.reason !== value.reason.trim() ||
    !REASON_PATTERN.test(value.reason) ||
    !isRecord(value.metadata) ||
    !isJsonValue(value.metadata)
  ) {
    return invalidEvent();
  }

  const event: RevocationEvent = {
    eventId: readUuid(value.eventId) as string,
    eventType: value.eventType as EventType,
    userId: readUuid(value.userId) as string,
    centralSessionId: readUuid(value.centralSessionId, true),
    applicationId: readUuid(value.applicationId, true),
    reason: value.reason,
    occurredAt: readOccurredAt(value.occurredAt),
    metadata: value.metadata,
  };

  if (
    (event.eventType === 'SessionRevoked' &&
      (event.centralSessionId === null || event.applicationId !== null)) ||
    (event.eventType === 'PasswordChanged' &&
      (event.centralSessionId !== null || event.applicationId !== null)) ||
    (event.eventType === 'AccessPolicyChanged' &&
      (event.centralSessionId !== null || event.applicationId === null))
  ) {
    return invalidEvent();
  }

  return event;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;

  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

export function fingerprintRevocationEvent(event: RevocationEvent): string {
  return createHash('sha256').update(canonicalJson(event), 'utf8').digest('hex');
}

export interface StandardError {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}
