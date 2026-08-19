import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RevocationEvent } from '@seleksi/shared';
import { WORKER_RUNTIME } from './event-processing.constants';

export interface LogoutNotificationTarget {
  id: string;
  logoutNotificationUrl: string;
}

function parseLogoutNotificationUrl(
  value: string,
  hostnameOverride?: string,
): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('Application logout notification URL is invalid');
  }

  const invalid =
    !['http:', 'https:'].includes(url.protocol) ||
    Boolean(url.username || url.password || url.search || url.hash) ||
    url.pathname !== '/internal/logout';

  if (invalid) {
    throw new Error('Application logout notification URL is invalid');
  }

  if (hostnameOverride) {
    url.hostname = hostnameOverride;
  }

  return url.toString();
}

function requestFailureMessage(error: unknown): string {
  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  ) {
    return 'Internal logout request timed out';
  }

  const cause = error instanceof Error ? error.cause : undefined;
  const errorCode =
    cause &&
    typeof cause === 'object' &&
    'code' in cause &&
    typeof cause.code === 'string'
      ? cause.code
      : undefined;

  return errorCode
    ? `Internal logout request failed (${errorCode})`
    : 'Internal logout request failed';
}

@Injectable()
export class InternalLogoutClientService {
  private readonly serviceSecret: string;
  private readonly hostnameOverride?: string;

  constructor(configService: ConfigService) {
    this.serviceSecret =
      configService.get<string>('INTERNAL_SERVICE_SECRET') ?? '';
    this.hostnameOverride = configService.get<string>(
      'SYNC_WORKER_LOGOUT_HOST_OVERRIDE',
    );
  }

  async deliver(
    target: LogoutNotificationTarget,
    event: RevocationEvent,
  ): Promise<void> {
    const url = parseLogoutNotificationUrl(
      target.logoutNotificationUrl,
      this.hostnameOverride,
    );

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.serviceSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(WORKER_RUNTIME.internalLogoutTimeoutMs),
      });
    } catch (error) {
      throw new Error(requestFailureMessage(error));
    }

    if (!response.ok) {
      throw new Error(
        `Internal logout endpoint returned HTTP ${response.status}`,
      );
    }
  }
}
