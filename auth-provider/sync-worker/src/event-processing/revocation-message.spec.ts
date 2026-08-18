import type { Message } from 'amqplib';
import { NonRetryableEventError } from './event-processing.errors';
import { parseRevocationMessage } from './revocation-message';

describe('parseRevocationMessage', () => {
  const event = {
    eventId: '11111111-1111-4111-8111-111111111111',
    eventType: 'SessionRevoked',
    userId: '22222222-2222-4222-8222-222222222222',
    centralSessionId: '33333333-3333-4333-8333-333333333333',
    applicationId: null,
    reason: 'sso_logout',
    occurredAt: '2026-08-17T08:00:00.000Z',
    metadata: {},
  } as const;

  function message(
    body: unknown = event,
    properties: Record<string, unknown> = {},
  ): Message {
    return {
      content: Buffer.from(JSON.stringify(body), 'utf8'),
      properties: {
        contentType: 'application/json',
        messageId: event.eventId,
        type: event.eventType,
        ...properties,
      },
    } as Message;
  }

  it('parses a shared revocation event with matching AMQP properties', () => {
    expect(parseRevocationMessage(message())).toEqual(event);
  });

  it('rejects malformed payloads and non-JSON envelopes', () => {
    expect(() =>
      parseRevocationMessage(message({ ...event, userId: 'invalid' })),
    ).toThrow(NonRetryableEventError);
    expect(() =>
      parseRevocationMessage(
        message(event, { contentType: 'application/octet-stream' }),
      ),
    ).toThrow('Invalid revocation message envelope');
  });

  it('rejects mismatched message identity properties', () => {
    expect(() =>
      parseRevocationMessage(
        message(event, { messageId: crypto.randomUUID() }),
      ),
    ).toThrow('RabbitMQ properties do not match');
    expect(() =>
      parseRevocationMessage(message(event, { type: 'PasswordChanged' })),
    ).toThrow('RabbitMQ properties do not match');
  });
});
