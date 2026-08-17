export const REVOCATION_MESSAGING = {
  exchange: 'auth-provider.revocations',
  exchangeType: 'direct',
  queue: 'sync-worker.revocations',
  routingKey: 'revocation',
  deadLetterExchange: 'auth-provider.revocations.dlx',
  deadLetterQueue: 'sync-worker.revocations.dlq',
  deadLetterRoutingKey: 'revocation.failed',
} as const;
