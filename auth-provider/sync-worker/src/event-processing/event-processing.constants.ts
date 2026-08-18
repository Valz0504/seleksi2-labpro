export const REVOCATION_MESSAGING = {
  exchange: 'auth-provider.revocations',
  exchangeType: 'direct',
  queue: 'sync-worker.revocations',
  routingKey: 'revocation',
  deadLetterExchange: 'auth-provider.revocations.dlx',
  deadLetterQueue: 'sync-worker.revocations.dlq',
  deadLetterRoutingKey: 'revocation.failed',
} as const;

export const MAX_REVOCATION_MESSAGE_BYTES = 16 * 1_024;

export const WORKER_RUNTIME = {
  connectionTimeoutMs: 5_000,
  heartbeatSeconds: 10,
  prefetchCount: 10,
  reconnectDelayMs: 1_000,
  internalLogoutTimeoutMs: 5_000,
  retryPollIntervalMs: 1_000,
  retryBatchSize: 50,
  processingLeaseMs: 30_000,
  deadLetterConfirmTimeoutMs: 10_000,
} as const;
