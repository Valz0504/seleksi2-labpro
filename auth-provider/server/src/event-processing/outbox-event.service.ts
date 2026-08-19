import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { RevocationEvent } from '@seleksi/shared';
import { Prisma } from '../generated/prisma/client';

export type NewRevocationEvent = Omit<
  RevocationEvent,
  'eventId' | 'occurredAt' | 'metadata'
> & {
  occurredAt: Date;
  metadata?: RevocationEvent['metadata'];
};

@Injectable()
export class OutboxEventService {
  async enqueue(
    transaction: Prisma.TransactionClient,
    input: NewRevocationEvent,
  ): Promise<RevocationEvent> {
    const [event] = await this.enqueueMany(transaction, [input]);

    if (!event) {
      throw new Error('Outbox event was not created');
    }

    return event;
  }

  async enqueueMany(
    transaction: Prisma.TransactionClient,
    inputs: NewRevocationEvent[],
  ): Promise<RevocationEvent[]> {
    if (inputs.length === 0) {
      return [];
    }

    const events = inputs.map<RevocationEvent>((input) => ({
      eventId: randomUUID(),
      eventType: input.eventType,
      userId: input.userId,
      centralSessionId: input.centralSessionId,
      applicationId: input.applicationId,
      reason: input.reason,
      occurredAt: input.occurredAt.toISOString(),
      metadata: input.metadata ?? {},
    }));
    const rows: Prisma.OutboxEventCreateManyInput[] = events.map((event) => ({
      id: event.eventId,
      eventType: event.eventType,
      userId: event.userId,
      centralSessionId: event.centralSessionId,
      applicationId: event.applicationId,
      payload: event as unknown as Prisma.InputJsonValue,
    }));

    await transaction.outboxEvent.createMany({ data: rows });

    return events;
  }
}
