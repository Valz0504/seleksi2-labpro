export class NonRetryableEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableEventError';
  }
}

export function safeErrorMessage(error: unknown): string {
  const errorCode =
    error instanceof Error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined;
  const message =
    error instanceof Error
      ? error.message.trim() || errorCode || error.name
      : 'Unknown event processing error';

  return message
    .replace(/(amqps?:\/\/)[^@\s]+@/gi, '$1[redacted]@')
    .replace(/(https?:\/\/)[^@\s]+@/gi, '$1[redacted]@')
    .slice(0, 500);
}
