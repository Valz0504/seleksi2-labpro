import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  parseRevocationEvent,
  RevocationEventValidationError,
  type RevocationEvent,
  type StandardError,
} from '@seleksi/shared';
import { getRelyingApplicationConfig } from '@/src/lib/config/server';
import {
  processInternalLogoutEvent,
  ProcessedEventConflictError,
} from '@/src/lib/internal/logout-processor';
import { isInternalServiceAuthorized } from '@/src/lib/internal/service-auth';

export const runtime = 'nodejs';

const MAX_PAYLOAD_BYTES = 16 * 1024;

class RequestPayloadError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly safeMessage: string,
  ) {
    super(code);
  }
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
  additionalHeaders?: Record<string, string>,
): NextResponse<StandardError> {
  return NextResponse.json(
    { error: { code, message, requestId } },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        ...additionalHeaders,
      },
    },
  );
}

function reportProcessingFailure(requestId: string, error: unknown): void {
  const diagnostics =
    typeof error === 'object' && error !== null
      ? {
          name: 'name' in error && typeof error.name === 'string' ? error.name : 'Error',
          code: 'code' in error && typeof error.code === 'string' ? error.code : undefined,
        }
      : { name: 'UnknownError', code: undefined };

  console.error(
    `Internal logout processing failed (${diagnostics.name}:${diagnostics.code ?? 'NO_CODE'}) [${requestId}]`,
  );
}

async function readJsonPayload(request: Request): Promise<unknown> {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();

  if (mediaType !== 'application/json') {
    throw new RequestPayloadError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Content-Type harus application/json',
    );
  }

  const declaredLength = request.headers.get('content-length');

  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > MAX_PAYLOAD_BYTES
  ) {
    throw new RequestPayloadError(413, 'PAYLOAD_TOO_LARGE', 'Payload event terlalu besar');
  }

  const reader = request.body?.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunks: string[] = [];
  let receivedBytes = 0;

  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        receivedBytes += value.byteLength;

        if (receivedBytes > MAX_PAYLOAD_BYTES) {
          try {
            await reader.cancel();
          } catch {
            // The size error remains authoritative if the peer already closed the stream.
          }

          throw new RequestPayloadError(413, 'PAYLOAD_TOO_LARGE', 'Payload event terlalu besar');
        }

        chunks.push(decoder.decode(value, { stream: true }));
      }

      chunks.push(decoder.decode());
    } catch (error) {
      if (error instanceof RequestPayloadError) {
        throw error;
      }

      throw new RequestPayloadError(400, 'INVALID_EVENT', 'Payload event tidak valid');
    } finally {
      reader.releaseLock();
    }
  }

  const body = chunks.join('');

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new RequestPayloadError(400, 'INVALID_EVENT', 'Payload event tidak valid');
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  const config = getRelyingApplicationConfig();

  if (
    !isInternalServiceAuthorized(request.headers.get('authorization'), config.internalServiceSecret)
  ) {
    return errorResponse(
      401,
      'INVALID_INTERNAL_CREDENTIAL',
      'Kredensial service tidak valid',
      requestId,
      { 'WWW-Authenticate': 'Bearer realm="internal"' },
    );
  }

  let rawEvent: unknown;

  try {
    rawEvent = await readJsonPayload(request);
  } catch (error) {
    if (error instanceof RequestPayloadError) {
      return errorResponse(error.status, error.code, error.safeMessage, requestId);
    }

    return errorResponse(400, 'INVALID_EVENT', 'Payload event tidak valid', requestId);
  }

  let event: RevocationEvent;

  try {
    event = parseRevocationEvent(rawEvent);
  } catch (error) {
    if (error instanceof RevocationEventValidationError) {
      return errorResponse(400, 'INVALID_EVENT', 'Payload event tidak valid', requestId);
    }

    return errorResponse(400, 'INVALID_EVENT', 'Payload event tidak valid', requestId);
  }

  try {
    await processInternalLogoutEvent(event);

    return NextResponse.json(
      { status: 'processed', eventId: event.eventId },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
      },
    );
  } catch (error) {
    if (error instanceof ProcessedEventConflictError) {
      return errorResponse(
        409,
        'EVENT_ID_CONFLICT',
        'Event ID sudah digunakan untuk payload lain',
        requestId,
      );
    }

    reportProcessingFailure(requestId, error);

    return errorResponse(
      503,
      'INTERNAL_LOGOUT_UNAVAILABLE',
      'Event logout belum dapat diproses',
      requestId,
    );
  }
}
