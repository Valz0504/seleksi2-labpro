import {
  parseRevocationEvent,
  RevocationEventValidationError,
  type RevocationEvent,
} from '@seleksi/shared';
import type { Message } from 'amqplib';
import { MAX_REVOCATION_MESSAGE_BYTES } from './event-processing.constants';
import { NonRetryableEventError } from './event-processing.errors';

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export function parseRevocationMessage(message: Message): RevocationEvent {
  if (
    message.properties.contentType !== 'application/json' ||
    message.content.byteLength === 0 ||
    message.content.byteLength > MAX_REVOCATION_MESSAGE_BYTES
  ) {
    throw new NonRetryableEventError('Invalid revocation message envelope');
  }

  let rawEvent: unknown;

  try {
    rawEvent = JSON.parse(utf8Decoder.decode(message.content)) as unknown;
  } catch {
    throw new NonRetryableEventError('Invalid revocation message JSON');
  }

  let event: RevocationEvent;

  try {
    event = parseRevocationEvent(rawEvent);
  } catch (error) {
    if (error instanceof RevocationEventValidationError) {
      throw new NonRetryableEventError('Invalid revocation event payload');
    }

    throw error;
  }

  if (
    message.properties.messageId !== event.eventId ||
    message.properties.type !== event.eventType
  ) {
    throw new NonRetryableEventError(
      'RabbitMQ properties do not match the revocation event',
    );
  }

  return event;
}
