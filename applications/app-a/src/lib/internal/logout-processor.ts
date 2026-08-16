import 'server-only';

import { fingerprintRevocationEvent, type RevocationEvent } from '@seleksi/shared';
import { getLocalDatabase } from '../database/client';
import { createInternalLogoutPlan } from './logout-plan';

export type InternalLogoutProcessingState = 'PROCESSED' | 'REPLAYED';

export class ProcessedEventConflictError extends Error {
  constructor() {
    super('Processed event payload conflict');
    this.name = 'ProcessedEventConflictError';
  }
}

function isUniqueConstraintError(error: unknown): error is { code: 'P2002' } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function assertMatchingEvent(
  existing: { eventType: string; payloadHash: string | null },
  event: RevocationEvent,
  payloadHash: string,
): void {
  if (
    existing.eventType !== event.eventType ||
    (existing.payloadHash !== null && existing.payloadHash !== payloadHash)
  ) {
    throw new ProcessedEventConflictError();
  }
}

function processingResult(revokedSessionCount: number): string {
  return revokedSessionCount === 0
    ? 'Tidak ada local session aktif yang perlu dicabut'
    : `${revokedSessionCount} local session dicabut`;
}

export async function processInternalLogoutEvent(
  event: RevocationEvent,
  now = new Date(),
): Promise<InternalLogoutProcessingState> {
  const database = getLocalDatabase();
  const payloadHash = fingerprintRevocationEvent(event);
  const plan = createInternalLogoutPlan(event);

  try {
    return await database.$transaction<InternalLogoutProcessingState>(async (transaction) => {
      const existing = await transaction.processedEvent.findUnique({
        where: { eventId: event.eventId },
        select: { eventType: true, payloadHash: true },
      });

      if (existing) {
        assertMatchingEvent(existing, event, payloadHash);
        return 'REPLAYED';
      }

      await transaction.processedEvent.create({
        data: {
          eventId: event.eventId,
          eventType: event.eventType,
          payloadHash,
          processedAt: now,
          result: 'processing',
        },
      });

      const revokedSessions = await transaction.localSession.updateManyAndReturn({
        where: {
          externalUserId: plan.externalUserId,
          ...(plan.centralSessionId ? { centralSessionId: plan.centralSessionId } : {}),
          status: 'ACTIVE',
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          status: 'REVOKED',
          revokedAt: now,
          revokeReason: plan.revokeReason,
        },
        select: { id: true, externalUserId: true },
      });

      if (revokedSessions.length > 0) {
        await transaction.activityLog.createMany({
          data: revokedSessions.map((session) => ({
            eventType: event.eventType,
            result: 'SUCCESS',
            message: plan.activityMessage,
            externalUserId: session.externalUserId,
            localSessionId: session.id,
            requestId: event.eventId,
            metadata: {
              source: 'back_channel',
              reason: plan.revokeReason,
              occurredAt: event.occurredAt,
            },
          })),
        });
      }

      await transaction.processedEvent.update({
        where: { eventId: event.eventId },
        data: { result: processingResult(revokedSessions.length) },
      });

      return 'PROCESSED';
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const existing = await database.processedEvent.findUnique({
      where: { eventId: event.eventId },
      select: { eventType: true, payloadHash: true },
    });

    if (!existing) {
      throw error;
    }

    assertMatchingEvent(existing, event, payloadHash);
    return 'REPLAYED';
  }
}
