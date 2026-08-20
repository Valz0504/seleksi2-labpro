import { createHash } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { hashPassword } from './../src/common/security/password';
import { hashSecret } from './../src/common/security/secret';
import { PrismaService } from './../src/database/prisma.service';
import { RabbitMqPublisherService } from './../src/event-processing/rabbitmq-publisher.service';
import { MfaSecretCryptoService } from './../src/mfa/mfa-secret-crypto.service';
import { MfaRecoveryCodeService } from './../src/mfa/mfa-recovery-code.service';
import { TotpService } from './../src/mfa/totp.service';
import { ShutdownStateService } from './../src/shutdown/shutdown-state.service';

describe('AppController (e2e)', () => {
  type OpenApiDocument = {
    openapi: string;
    info: { title: string };
    paths: Record<string, Record<string, unknown>>;
    components?: {
      securitySchemes?: Record<string, unknown>;
      schemas?: Record<
        string,
        { properties?: Record<string, Record<string, unknown>> }
      >;
    };
  };

  const applicationId = '33333333-3333-4333-8333-333333333333';
  const applicationRedirectUri = 'http://localhost:3002/auth/callback';
  const clientSecret = 'e2e-client-secret';
  const validState = 'random-state-with-enough-entropy';
  const validCodeVerifier = 'v'.repeat(43);
  const validCodeChallenge = createHash('sha256')
    .update(validCodeVerifier, 'ascii')
    .digest('base64url');
  let app: INestApplication<App>;
  let agent: ReturnType<typeof request.agent>;
  let persistedAuthorizationCode:
    | {
        id: string;
        codeHash: string;
        userId: string;
        applicationId: string;
        ssoSessionId: string;
        redirectUri: string;
        codeChallenge: string;
        codeChallengeMethod: 'S256';
        expiresAt: Date;
        usedAt: Date | null;
      }
    | undefined;
  let persistedAccessToken:
    | {
        id: string;
        tokenHash: string;
        userId: string;
        applicationId: string;
        ssoSessionId: string;
        scopes: string[];
        status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
        issuedAt: Date;
        expiresAt: Date;
        revokedAt: Date | null;
      }
    | undefined;
  let persistedSession:
    | {
        id: string;
        userId: string;
        sessionTokenHash: string;
        status: 'ACTIVE' | 'REVOKED';
        createdAt: Date;
        expiresAt: Date;
        lastActivityAt: Date | null;
        revokedAt: Date | null;
      }
    | undefined;
  let currentMfaRecord:
    | {
        secretCiphertext: Uint8Array;
        secretIv: Uint8Array;
        secretAuthTag: Uint8Array;
        enabledAt: Date | null;
        lastUsedTimeStep: bigint | null;
      }
    | undefined;
  let persistedMfaChallenge:
    | {
        id: string;
        tokenHash: string;
        userId: string;
        intent: 'API' | 'OAUTH' | 'ADMIN';
        returnTo: string | null;
        attemptCount: number;
        expiresAt: Date;
        usedAt: Date | null;
      }
    | undefined;
  let currentRecoveryCodes: Array<{
    id: string;
    userId: string;
    codeHash: string;
    usedAt: Date | null;
  }> = [];
  const activeUser = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Admin',
    email: 'admin@example.com',
    passwordHash: '',
    status: 'ACTIVE' as const,
    role: 'ADMIN' as const,
  };
  let currentRole: 'ADMIN' | 'USER' = 'ADMIN';
  const adminUserListRecord = () => ({
    id: activeUser.id,
    name: activeUser.name,
    email: activeUser.email,
    status: activeUser.status,
    role: currentRole,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    userGroups: [],
  });
  const prisma = {
    $queryRaw: jest.fn(),
    $disconnect: jest.fn(),
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    ssoSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    accessToken: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    application: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    group: {
      findMany: jest.fn(),
    },
    applicationGroupPolicy: {
      findFirst: jest.fn(),
    },
    authorizationCode: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    mfaLoginChallenge: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    mfaRecoveryCode: {
      count: jest.fn(),
      findFirst: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    userMfaTotp: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
      groupBy: jest.fn(),
    },
    outboxEvent: {
      createMany: jest.fn(),
      groupBy: jest.fn(),
    },
    eventDelivery: {
      groupBy: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const rabbitMqPublisher = {
    checkReadiness: jest.fn(),
    getQueueMetrics: jest.fn(),
    close: jest.fn(),
  };
  const findAuditEvent = (eventType: string) => {
    const calls = prisma.auditLog.create.mock.calls as unknown as Array<
      [
        {
          data: {
            eventType: string;
            userId?: string;
            sessionId?: string;
            result: string;
            metadata?: unknown;
          };
        },
      ]
    >;

    return calls
      .map(([input]) => input.data)
      .find((event) => {
        return event.eventType === eventType;
      });
  };
  const findLatestAuditEvent = (eventType: string) => {
    const calls = prisma.auditLog.create.mock.calls as unknown as Array<
      [{ data: { eventType: string; metadata?: unknown } }]
    >;

    return calls
      .map(([input]) => input.data)
      .findLast((event) => event.eventType === eventType);
  };
  const getPersistedMfaChallenge = () => persistedMfaChallenge;
  const getCurrentMfaRecord = () => currentMfaRecord;
  const findOutboxEvent = (eventType: string) => {
    const calls = prisma.outboxEvent.createMany.mock.calls as unknown as Array<
      [
        {
          data: Array<{
            id: string;
            eventType: string;
            payload: {
              eventId: string;
              eventType: string;
              userId: string;
              centralSessionId: string | null;
              applicationId: string | null;
              reason: string;
              occurredAt: string;
              metadata: Record<string, unknown>;
            };
          }>;
        },
      ]
    >;

    return calls
      .flatMap(([input]) => input.data)
      .find((event) => event.eventType === eventType);
  };
  const enableCurrentUserMfa = (): string => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = app
      .get(MfaSecretCryptoService)
      .encrypt(secret, activeUser.id);

    currentMfaRecord = {
      secretCiphertext: encrypted.ciphertext,
      secretIv: encrypted.iv,
      secretAuthTag: encrypted.authTag,
      enabledAt: new Date(),
      lastUsedTimeStep: null,
    };

    return secret;
  };

  beforeAll(async () => {
    prisma.$queryRaw.mockResolvedValue([{ result: 1 }]);
    rabbitMqPublisher.checkReadiness.mockResolvedValue(undefined);
    activeUser.passwordHash = await hashPassword('correct-password');
    prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { email?: string; id?: string } }) =>
        Promise.resolve(
          where.email === activeUser.email || where.id === activeUser.id
            ? {
                ...activeUser,
                role: currentRole,
                mfaTotp: currentMfaRecord
                  ? { enabledAt: currentMfaRecord.enabledAt }
                  : null,
              }
            : null,
        ),
    );
    prisma.user.findMany.mockImplementation(() =>
      Promise.resolve([adminUserListRecord()]),
    );
    prisma.ssoSession.create.mockImplementation(
      ({
        data,
      }: {
        data: {
          userId: string;
          sessionTokenHash: string;
          expiresAt: Date;
          lastActivityAt: Date;
        };
      }) => {
        persistedSession = {
          id: '22222222-2222-4222-8222-222222222222',
          userId: data.userId,
          sessionTokenHash: data.sessionTokenHash,
          status: 'ACTIVE',
          createdAt: new Date(),
          expiresAt: data.expiresAt,
          lastActivityAt: data.lastActivityAt,
          revokedAt: null,
        };

        return Promise.resolve(persistedSession);
      },
    );
    prisma.ssoSession.findUnique.mockImplementation(
      ({ where }: { where: { sessionTokenHash: string } }) =>
        Promise.resolve(
          persistedSession?.sessionTokenHash === where.sessionTokenHash
            ? {
                ...persistedSession,
                user: { ...activeUser, role: currentRole },
              }
            : null,
        ),
    );
    prisma.ssoSession.updateMany.mockImplementation(
      ({ data }: { data: { status?: 'REVOKED'; revokedAt?: Date } }) => {
        if (persistedSession && data.status === 'REVOKED') {
          persistedSession.status = 'REVOKED';
          persistedSession.revokedAt = data.revokedAt ?? new Date();
        }

        return Promise.resolve({ count: persistedSession ? 1 : 0 });
      },
    );
    prisma.accessToken.findUnique.mockImplementation(
      ({ where }: { where: { tokenHash: string } }) =>
        Promise.resolve(
          persistedAccessToken?.tokenHash === where.tokenHash &&
            persistedSession
            ? {
                ...persistedAccessToken,
                user: {
                  id: activeUser.id,
                  name: activeUser.name,
                  email: activeUser.email,
                  status: activeUser.status,
                  userGroups: [
                    { group: { name: 'administrators' } },
                    { group: { name: 'app-a-users' } },
                  ],
                },
                application: {
                  id: applicationId,
                  clientId: 'app-a',
                  status: 'ACTIVE',
                },
                ssoSession: {
                  id: persistedSession.id,
                  status: persistedSession.status,
                  expiresAt: persistedSession.expiresAt,
                  revokedAt: persistedSession.revokedAt,
                },
              }
            : null,
        ),
    );
    prisma.accessToken.updateMany.mockImplementation(
      ({
        data,
      }: {
        data: { status?: 'ACTIVE' | 'EXPIRED' | 'REVOKED'; revokedAt?: Date };
      }) => {
        if (!persistedAccessToken) {
          return Promise.resolve({ count: 0 });
        }

        if (data.status) {
          persistedAccessToken.status = data.status;
        }
        if (data.revokedAt) {
          persistedAccessToken.revokedAt = data.revokedAt;
        }

        return Promise.resolve({ count: 1 });
      },
    );
    prisma.application.findUnique.mockImplementation(
      ({ where, select }: { where: { clientId: string }; select: object }) => {
        if (where.clientId !== 'app-a') {
          return Promise.resolve(null);
        }

        if ('redirectUris' in select) {
          const redirectSelection = select['redirectUris'] as {
            where: { redirectUri: string };
          };

          return Promise.resolve({
            id: applicationId,
            status: 'ACTIVE',
            redirectUris:
              redirectSelection.where.redirectUri === applicationRedirectUri
                ? [{ id: '44444444-4444-4444-8444-444444444444' }]
                : [],
          });
        }

        return Promise.resolve({
          id: applicationId,
          status: 'ACTIVE',
          clientSecretHash: hashSecret(clientSecret),
        });
      },
    );
    prisma.application.findMany.mockResolvedValue([
      {
        id: applicationId,
        name: 'App A',
        clientId: 'app-a',
        status: 'ACTIVE',
        launchUrl: 'http://localhost:3002',
        logoutNotificationUrl: 'http://localhost:3002/internal/logout',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        redirectUris: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            redirectUri: applicationRedirectUri,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
        groupPolicies: [],
      },
    ]);
    prisma.group.findMany.mockResolvedValue([
      {
        id: '55555555-5555-4555-8555-555555555555',
        name: 'app-a-users',
        description: 'Users allowed to access App A',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        userGroups: [],
        policies: [],
      },
    ]);
    prisma.applicationGroupPolicy.findFirst.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
    });
    prisma.authorizationCode.create.mockImplementation(
      ({
        data,
      }: {
        data: Omit<
          NonNullable<typeof persistedAuthorizationCode>,
          'id' | 'usedAt'
        >;
      }) => {
        persistedAuthorizationCode = {
          id: '66666666-6666-4666-8666-666666666666',
          ...data,
          usedAt: null,
        };

        return Promise.resolve(persistedAuthorizationCode);
      },
    );
    prisma.authorizationCode.findUnique.mockImplementation(
      ({ where }: { where: { codeHash: string } }) =>
        Promise.resolve(
          persistedAuthorizationCode?.codeHash === where.codeHash &&
            persistedSession
            ? {
                ...persistedAuthorizationCode,
                user: { status: activeUser.status },
                application: { status: 'ACTIVE' },
                ssoSession: {
                  status: persistedSession.status,
                  expiresAt: persistedSession.expiresAt,
                  revokedAt: persistedSession.revokedAt,
                },
              }
            : null,
        ),
    );
    prisma.authorizationCode.updateMany.mockImplementation(
      ({ data }: { data: { usedAt: Date } }) => {
        if (!persistedAuthorizationCode || persistedAuthorizationCode.usedAt) {
          return Promise.resolve({ count: 0 });
        }

        persistedAuthorizationCode.usedAt = data.usedAt;
        return Promise.resolve({ count: 1 });
      },
    );
    prisma.mfaLoginChallenge.create.mockImplementation(
      ({
        data,
      }: {
        data: Omit<
          NonNullable<typeof persistedMfaChallenge>,
          'id' | 'attemptCount' | 'usedAt'
        >;
      }) => {
        persistedMfaChallenge = {
          id: '88888888-8888-4888-8888-888888888888',
          ...data,
          attemptCount: 0,
          usedAt: null,
        };

        return Promise.resolve(persistedMfaChallenge);
      },
    );
    prisma.mfaLoginChallenge.findUnique.mockImplementation(
      ({ where }: { where: { tokenHash: string } }) =>
        Promise.resolve(
          persistedMfaChallenge?.tokenHash === where.tokenHash &&
            currentMfaRecord
            ? {
                ...persistedMfaChallenge,
                user: {
                  ...activeUser,
                  role: currentRole,
                  mfaTotp: currentMfaRecord,
                },
              }
            : null,
        ),
    );
    prisma.mfaLoginChallenge.updateMany.mockImplementation(
      ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        if (!persistedMfaChallenge) {
          return Promise.resolve({ count: 0 });
        }

        if ('userId' in where && !('id' in where)) {
          if (persistedMfaChallenge.usedAt === null) {
            persistedMfaChallenge.usedAt = data['usedAt'] as Date;
          }
          return Promise.resolve({ count: 1 });
        }

        if (where['id'] !== persistedMfaChallenge.id) {
          return Promise.resolve({ count: 0 });
        }

        if (
          data['usedAt'] instanceof Date &&
          persistedMfaChallenge.usedAt === null &&
          persistedMfaChallenge.expiresAt > new Date() &&
          persistedMfaChallenge.attemptCount < 5
        ) {
          persistedMfaChallenge.usedAt = data['usedAt'];
          return Promise.resolve({ count: 1 });
        }

        if (
          typeof data['attemptCount'] === 'object' &&
          data['attemptCount'] !== null &&
          persistedMfaChallenge.usedAt === null &&
          persistedMfaChallenge.attemptCount < 5
        ) {
          persistedMfaChallenge.attemptCount += 1;
          return Promise.resolve({ count: 1 });
        }

        return Promise.resolve({ count: 0 });
      },
    );
    prisma.mfaRecoveryCode.count.mockImplementation(
      ({ where }: { where: { userId: string; usedAt: null } }) =>
        Promise.resolve(
          currentRecoveryCodes.filter(
            (code) => code.userId === where.userId && code.usedAt === null,
          ).length,
        ),
    );
    prisma.mfaRecoveryCode.findFirst.mockImplementation(
      ({
        where,
      }: {
        where: { userId: string; codeHash: string; usedAt: null };
      }) =>
        Promise.resolve(
          currentRecoveryCodes.find(
            (code) =>
              code.userId === where.userId &&
              code.codeHash === where.codeHash &&
              code.usedAt === null,
          ) ?? null,
        ),
    );
    prisma.mfaRecoveryCode.createMany.mockImplementation(
      ({ data }: { data: Array<{ userId: string; codeHash: string }> }) => {
        const created = data.map((code, index) => ({
          id: `99999999-9999-4999-8999-${String(index + 1).padStart(12, '0')}`,
          ...code,
          usedAt: null,
        }));
        currentRecoveryCodes.push(...created);
        return Promise.resolve({ count: created.length });
      },
    );
    prisma.mfaRecoveryCode.deleteMany.mockImplementation(
      ({ where }: { where: { userId: string } }) => {
        const previousLength = currentRecoveryCodes.length;
        currentRecoveryCodes = currentRecoveryCodes.filter(
          (code) => code.userId !== where.userId,
        );
        return Promise.resolve({
          count: previousLength - currentRecoveryCodes.length,
        });
      },
    );
    prisma.mfaRecoveryCode.updateMany.mockImplementation(
      ({
        where,
        data,
      }: {
        where: { id: string; userId: string; usedAt: null };
        data: { usedAt: Date };
      }) => {
        const recoveryCode = currentRecoveryCodes.find(
          (code) =>
            code.id === where.id &&
            code.userId === where.userId &&
            code.usedAt === null,
        );

        if (!recoveryCode) {
          return Promise.resolve({ count: 0 });
        }

        recoveryCode.usedAt = data.usedAt;
        return Promise.resolve({ count: 1 });
      },
    );
    prisma.userMfaTotp.findUnique.mockImplementation(() =>
      Promise.resolve(currentMfaRecord ?? null),
    );
    prisma.userMfaTotp.upsert.mockImplementation(
      ({
        create,
        update,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const data = currentMfaRecord ? update : create;

        currentMfaRecord = {
          secretCiphertext: data['secretCiphertext'] as Uint8Array,
          secretIv: data['secretIv'] as Uint8Array,
          secretAuthTag: data['secretAuthTag'] as Uint8Array,
          enabledAt: currentMfaRecord?.enabledAt ?? null,
          lastUsedTimeStep: null,
        };

        return Promise.resolve(currentMfaRecord);
      },
    );
    prisma.userMfaTotp.updateMany.mockImplementation(
      ({ data }: { data: { enabledAt?: Date; lastUsedTimeStep: bigint } }) => {
        if (data.enabledAt) {
          if (!currentMfaRecord || currentMfaRecord.enabledAt !== null) {
            return Promise.resolve({ count: 0 });
          }

          currentMfaRecord.enabledAt = data.enabledAt;
          currentMfaRecord.lastUsedTimeStep = data.lastUsedTimeStep;
          return Promise.resolve({ count: 1 });
        }

        if (
          !currentMfaRecord ||
          (currentMfaRecord.lastUsedTimeStep !== null &&
            currentMfaRecord.lastUsedTimeStep >= data.lastUsedTimeStep)
        ) {
          return Promise.resolve({ count: 0 });
        }

        currentMfaRecord.lastUsedTimeStep = data.lastUsedTimeStep;
        return Promise.resolve({ count: 1 });
      },
    );
    prisma.userMfaTotp.deleteMany.mockImplementation(() => {
      if (!currentMfaRecord?.enabledAt) {
        return Promise.resolve({ count: 0 });
      }

      currentMfaRecord = undefined;
      return Promise.resolve({ count: 1 });
    });
    prisma.accessToken.create.mockImplementation(
      ({
        data,
      }: {
        data: {
          tokenHash: string;
          userId: string;
          applicationId: string;
          ssoSessionId: string;
          scopes: string[];
          expiresAt: Date;
        };
      }) => {
        persistedAccessToken = {
          id: '77777777-7777-4777-8777-777777777777',
          ...data,
          status: 'ACTIVE',
          issuedAt: new Date(),
          revokedAt: null,
        };
        return Promise.resolve(persistedAccessToken);
      },
    );
    prisma.auditLog.create.mockResolvedValue({});
    prisma.auditLog.groupBy.mockResolvedValue([
      { eventType: 'LoginSucceeded', _count: { _all: 2 } },
      { eventType: 'LoginFailed', _count: { _all: 1 } },
    ]);
    prisma.outboxEvent.createMany.mockResolvedValue({ count: 1 });
    prisma.outboxEvent.groupBy.mockResolvedValue([
      { status: 'PUBLISHED', _count: { _all: 3 } },
    ]);
    prisma.eventDelivery.groupBy.mockResolvedValue([
      { status: 'SUCCEEDED', _count: { _all: 6 } },
    ]);
    rabbitMqPublisher.getQueueMetrics.mockResolvedValue({
      main: { messagesReady: 0, consumers: 1 },
      deadLetter: { messagesReady: 0, consumers: 0 },
    });
    prisma.$transaction.mockImplementation((input: unknown) => {
      if (typeof input === 'function') {
        return (input as (transaction: typeof prisma) => Promise<unknown>)(
          prisma,
        );
      }

      return Promise.all(input as Promise<unknown>[]);
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RabbitMqPublisherService)
      .useValue(rabbitMqPublisher)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    agent = request.agent(app.getHttpServer());
  });

  it('GET / identifies the auth server', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect({
      service: 'auth-server',
      message: 'Auth Provider Server is running',
    });
  });

  it('GET /health reports a healthy status', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          status: 'ok',
          service: 'auth-server',
        });
        expect(body.timestamp).toEqual(expect.any(String));
      });
  });

  it('GET /metrics exposes aggregate Prometheus metrics without identifiers', () => {
    return request(app.getHttpServer())
      .get('/metrics')
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect(
        ({
          headers,
          text,
        }: {
          headers: Record<string, string>;
          text: string;
        }) => {
          expect(headers['content-type']).toContain('text/plain');
          expect(text).toContain('auth_provider_http_requests_total');
          expect(text).toContain('auth_provider_outbox_events');
          expect(text).toContain('auth_provider_rabbitmq_queue_messages_ready');
          expect(text).not.toContain(activeUser.id);
          expect(text).not.toContain(activeUser.email);
          expect(text).not.toContain(clientSecret);
        },
      );
  });

  it('GET /health/live checks only that the process responds', () => {
    return request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          status: 'ok',
          service: 'auth-server',
        });
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect(rabbitMqPublisher.checkReadiness).not.toHaveBeenCalled();
      });
  });

  it('GET /health/ready reports dependency failures and recovers without restart', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('database secret detail'));
    rabbitMqPublisher.checkReadiness.mockRejectedValueOnce(
      new Error('amqp://user:secret@rabbitmq:5672'),
    );

    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body.status).toBe('ok');
      });

    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          status: 'not_ready',
          service: 'auth-server',
          dependencies: {
            primaryDatabase: 'unavailable',
            rabbitmq: 'unavailable',
          },
        });
        expect(JSON.stringify(body)).not.toContain('database secret detail');
        expect(JSON.stringify(body)).not.toContain('secret@rabbitmq');
      });

    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          status: 'ready',
          service: 'auth-server',
          dependencies: {
            primaryDatabase: 'ok',
            rabbitmq: 'ok',
          },
        });
      });
  });

  it('GET /docs-json publishes the complete Auth Provider contract safely', () => {
    return request(app.getHttpServer())
      .get('/docs-json')
      .expect(200)
      .expect(({ body }: { body: OpenApiDocument }) => {
        const documentedMethods = new Set([
          'delete',
          'get',
          'head',
          'options',
          'patch',
          'post',
          'put',
          'trace',
        ]);
        const operationCount = Object.values(body.paths).reduce(
          (total, pathItem) =>
            total +
            Object.keys(pathItem).filter((method) =>
              documentedMethods.has(method),
            ).length,
          0,
        );

        expect(body.openapi).toMatch(/^3\./);
        expect(body.info.title).toBe('Auth Provider API');
        expect(body.paths).toHaveProperty('/authorize');
        expect(body.paths).toHaveProperty('/token');
        expect(body.paths).toHaveProperty('/userinfo');
        expect(body.paths).toHaveProperty('/auth/logout/browser');
        expect(body.paths).toHaveProperty('/health/live');
        expect(body.paths).toHaveProperty('/health/ready');
        expect(body.paths).toHaveProperty('/metrics');
        expect(body.paths).toHaveProperty('/admin/metrics');
        expect(body.paths).toHaveProperty('/admin/users');
        expect(body.paths).toHaveProperty(
          '/admin/applications/{applicationId}/rotate-secret',
        );
        expect(body.components?.securitySchemes).toHaveProperty('accessToken');
        expect(body.components?.securitySchemes).toHaveProperty(
          'centralSession',
        );
        expect(body.components?.securitySchemes).toHaveProperty(
          'clientCredentials',
        );
        expect(body.paths).toHaveProperty('/auth/login/mfa');
        expect(body.paths).toHaveProperty('/auth/login/mfa/continue');
        expect(body.paths).toHaveProperty('/auth/mfa/status');
        expect(body.paths).toHaveProperty('/auth/mfa/enroll/start');
        expect(body.paths).toHaveProperty('/auth/mfa/enroll/confirm');
        expect(body.paths).toHaveProperty('/auth/mfa/recovery/regenerate');
        expect(body.paths).toHaveProperty('/auth/mfa');
        expect(operationCount).toBe(45);
        expect(
          body.components?.schemas?.['CreateUserDto']?.properties?.['password'],
        ).toMatchObject({ writeOnly: true });

        const serializedDocument = JSON.stringify(body);
        expect(serializedDocument).not.toContain(
          'e2e-only-cookie-signing-secret-with-32-characters',
        );
        expect(serializedDocument).not.toContain(clientSecret);
        expect(serializedDocument).not.toContain('passwordHash');
        expect(serializedDocument).not.toContain('clientSecretHash');
      });
  });

  it('POST /auth/login rejects unknown accounts without revealing them', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'missing@example.com', password: 'wrong-password' })
      .expect(401)
      .expect({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email atau password tidak valid',
        },
      })
      .expect(() => {
        expect(findAuditEvent('LoginFailed')).toMatchObject({
          eventType: 'LoginFailed',
          result: 'FAILED',
          metadata: { reason: 'invalid_credentials' },
        });
        expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
          'wrong-password',
        );
      });
  });

  it('validates the login request body before checking credentials', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: '', unexpected: true })
      .expect(400);
  });

  it('enrolls TOTP only after the first authenticator code is confirmed', async () => {
    const enrollmentAgent = request.agent(app.getHttpServer());
    currentMfaRecord = undefined;
    currentRecoveryCodes = [];
    persistedSession = undefined;

    try {
      await request(app.getHttpServer()).get('/auth/mfa/status').expect(401);
      await enrollmentAgent
        .post('/auth/login')
        .send({ email: activeUser.email, password: 'correct-password' })
        .expect(200);
      await enrollmentAgent.get('/auth/mfa/status').expect(200).expect({
        enabled: false,
        enrollmentPending: false,
        recoveryCodesRemaining: 0,
      });

      const startResponse = await enrollmentAgent
        .post('/auth/mfa/enroll/start')
        .send({})
        .expect(200)
        .expect('Cache-Control', 'no-store');
      const startBody = startResponse.body as unknown;

      if (
        typeof startBody !== 'object' ||
        startBody === null ||
        !('manualKey' in startBody) ||
        typeof startBody.manualKey !== 'string' ||
        !('provisioningUri' in startBody) ||
        typeof startBody.provisioningUri !== 'string' ||
        !('qrCodeDataUrl' in startBody) ||
        typeof startBody.qrCodeDataUrl !== 'string'
      ) {
        throw new Error('Enrollment response was invalid');
      }

      expect(startBody.provisioningUri).toMatch(/^otpauth:\/\/totp\//);
      expect(startBody.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(getCurrentMfaRecord()?.enabledAt).toBeNull();

      const validCode = app.get(TotpService).generateToken(startBody.manualKey);
      const wrongCode = validCode === '000000' ? '000001' : '000000';

      await enrollmentAgent
        .post('/auth/mfa/enroll/confirm')
        .send({ code: wrongCode })
        .expect(400)
        .expect({
          error: {
            code: 'MFA_ENROLLMENT_CODE_INVALID',
            message: 'Kode authenticator tidak valid',
          },
        });
      expect(getCurrentMfaRecord()?.enabledAt).toBeNull();

      const confirmationResponse = await enrollmentAgent
        .post('/auth/mfa/enroll/confirm')
        .send({ code: validCode })
        .expect(200);
      const confirmationBody = confirmationResponse.body as {
        enabled: boolean;
        recoveryCodes: string[];
      };

      expect(confirmationBody.enabled).toBe(true);
      expect(confirmationBody.recoveryCodes).toHaveLength(8);
      expect(confirmationBody.recoveryCodes[0]).toMatch(
        /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/,
      );
      expect(currentRecoveryCodes).toHaveLength(8);
      expect(JSON.stringify(currentRecoveryCodes)).not.toContain(
        confirmationBody.recoveryCodes[0],
      );
      expect(getCurrentMfaRecord()?.enabledAt).toEqual(expect.any(Date));
      expect(findLatestAuditEvent('mfa_enrolled')).toMatchObject({
        actorId: activeUser.id,
        userId: activeUser.id,
        result: 'SUCCESS',
        metadata: { factor: 'totp' },
      });
      expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
        startBody.manualKey,
      );
      expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
        validCode,
      );

      await enrollmentAgent.get('/auth/mfa/status').expect(200).expect({
        enabled: true,
        enrollmentPending: false,
        recoveryCodesRemaining: 8,
      });
      await enrollmentAgent.post('/auth/mfa/enroll/start').send({}).expect(409);
    } finally {
      currentMfaRecord = undefined;
      currentRecoveryCodes = [];
    }
  });

  it('does not create a central session until active MFA is verified', async () => {
    const secret = enableCurrentUserMfa();
    const mfaAgent = request.agent(app.getHttpServer());
    persistedSession = undefined;
    persistedMfaChallenge = undefined;

    try {
      const loginResponse = await mfaAgent
        .post('/auth/login')
        .send({ email: activeUser.email, password: 'correct-password' })
        .expect(202);
      const setCookies = loginResponse.headers['set-cookie'] as unknown as
        string[] | undefined;
      const pendingCookie = setCookies
        ?.find((cookie) => cookie.startsWith('mfa_challenge='))
        ?.split(';', 1)[0];
      const loginResponseBody = loginResponse.body as unknown;

      expect(loginResponseBody).toMatchObject({
        mfaRequired: true,
      });
      if (
        typeof loginResponseBody !== 'object' ||
        loginResponseBody === null ||
        !('expiresAt' in loginResponseBody)
      ) {
        throw new Error('MFA login response did not include an expiry');
      }
      expect(typeof loginResponseBody.expiresAt).toBe('string');
      expect(loginResponseBody).not.toHaveProperty('user');
      expect(pendingCookie).toEqual(expect.any(String));
      expect(persistedMfaChallenge).toMatchObject({
        userId: activeUser.id,
        intent: 'API',
        returnTo: null,
        attemptCount: 0,
        usedAt: null,
      });
      expect(persistedSession).toBeUndefined();

      const validCode = app.get(TotpService).generateToken(secret);
      const wrongCode = validCode === '000000' ? '000001' : '000000';

      await mfaAgent
        .post('/auth/login/mfa')
        .send({ code: wrongCode })
        .expect(401)
        .expect({
          error: {
            code: 'MFA_VERIFICATION_FAILED',
            message: 'Kode MFA tidak valid atau challenge telah berakhir',
          },
        });
      expect(getPersistedMfaChallenge()?.attemptCount).toBe(1);
      expect(persistedSession).toBeUndefined();
      expect(findLatestAuditEvent('mfa_failed')).toMatchObject({
        eventType: 'mfa_failed',
        userId: activeUser.id,
        result: 'FAILED',
        metadata: { reason: 'verification_rejected' },
      });

      await mfaAgent
        .post('/auth/login/mfa')
        .send({ code: validCode })
        .expect(200)
        .expect(({ body }: { body: Record<string, unknown> }) => {
          expect(body).toMatchObject({
            user: { id: activeUser.id },
            session: { status: 'ACTIVE' },
          });
        });
      expect(getPersistedMfaChallenge()?.usedAt).toEqual(expect.any(Date));
      expect(persistedSession).toBeDefined();
      expect(findAuditEvent('mfa_success')).toMatchObject({
        eventType: 'mfa_success',
        userId: activeUser.id,
        result: 'SUCCESS',
        metadata: { factor: 'totp' },
      });
      expect(findLatestAuditEvent('LoginSucceeded')).toMatchObject({
        metadata: { authenticationMethod: 'password_totp' },
      });
      expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
        validCode,
      );

      const sessionCreateCount = prisma.ssoSession.create.mock.calls.length;

      await request(app.getHttpServer())
        .post('/auth/login/mfa')
        .set('Cookie', pendingCookie as string)
        .send({ code: validCode })
        .expect(401);
      expect(prisma.ssoSession.create).toHaveBeenCalledTimes(
        sessionCreateCount,
      );
    } finally {
      currentMfaRecord = undefined;
      persistedMfaChallenge = undefined;
    }
  });

  it('accepts each recovery code for exactly one login', async () => {
    enableCurrentUserMfa();
    const generated = app.get(MfaRecoveryCodeService).generate(activeUser.id);
    currentRecoveryCodes = generated.codeHashes.map((codeHash, index) => ({
      id: `77777777-7777-4777-8777-${String(index + 1).padStart(12, '0')}`,
      userId: activeUser.id,
      codeHash,
      usedAt: null,
    }));
    persistedSession = undefined;
    persistedMfaChallenge = undefined;

    try {
      const firstAgent = request.agent(app.getHttpServer());
      await firstAgent
        .post('/auth/login')
        .send({ email: activeUser.email, password: 'correct-password' })
        .expect(202);
      await firstAgent
        .post('/auth/login/mfa')
        .send({ code: generated.rawCodes[0] })
        .expect(200);

      expect(currentRecoveryCodes[0]?.usedAt).toEqual(expect.any(Date));
      expect(findLatestAuditEvent('mfa_success')).toMatchObject({
        metadata: { factor: 'recovery_code' },
      });
      expect(findLatestAuditEvent('LoginSucceeded')).toMatchObject({
        metadata: { authenticationMethod: 'password_recovery_code' },
      });

      const secondAgent = request.agent(app.getHttpServer());
      await secondAgent
        .post('/auth/login')
        .send({ email: activeUser.email, password: 'correct-password' })
        .expect(202);
      await secondAgent
        .post('/auth/login/mfa')
        .send({ code: generated.rawCodes[0] })
        .expect(401);
      expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
        generated.rawCodes[0],
      );
    } finally {
      currentMfaRecord = undefined;
      currentRecoveryCodes = [];
      persistedMfaChallenge = undefined;
    }
  });

  it('regenerates recovery codes and safely disables MFA from an active session', async () => {
    const secret = enableCurrentUserMfa();
    const initialCodes = app
      .get(MfaRecoveryCodeService)
      .generate(activeUser.id);
    currentRecoveryCodes = initialCodes.codeHashes.map((codeHash, index) => ({
      id: `66666666-6666-4666-8666-${String(index + 1).padStart(12, '0')}`,
      userId: activeUser.id,
      codeHash,
      usedAt: null,
    }));
    persistedSession = undefined;
    persistedMfaChallenge = undefined;
    const managementAgent = request.agent(app.getHttpServer());

    try {
      await managementAgent
        .post('/auth/login')
        .send({ email: activeUser.email, password: 'correct-password' })
        .expect(202);
      await managementAgent
        .post('/auth/login/mfa')
        .send({ code: app.get(TotpService).generateToken(secret) })
        .expect(200);

      const regenerationResponse = await managementAgent
        .post('/auth/mfa/recovery/regenerate')
        .send({
          password: 'correct-password',
          code: initialCodes.rawCodes[0],
        })
        .expect(200)
        .expect('Cache-Control', 'no-store');
      const regenerationBody = regenerationResponse.body as {
        recoveryCodes: string[];
      };

      expect(regenerationBody.recoveryCodes).toHaveLength(8);
      expect(regenerationBody.recoveryCodes).not.toContain(
        initialCodes.rawCodes[0],
      );
      expect(currentRecoveryCodes).toHaveLength(8);

      await managementAgent
        .delete('/auth/mfa')
        .send({
          password: 'correct-password',
          code: regenerationBody.recoveryCodes[0],
        })
        .expect(204);

      expect(currentMfaRecord).toBeUndefined();
      expect(currentRecoveryCodes).toHaveLength(0);
      await managementAgent.get('/auth/mfa/status').expect(200).expect({
        enabled: false,
        enrollmentPending: false,
        recoveryCodesRemaining: 0,
      });
      expect(findLatestAuditEvent('mfa_disabled')).toMatchObject({
        result: 'SUCCESS',
        metadata: { method: 'self_service' },
      });
      expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
        regenerationBody.recoveryCodes[0],
      );
    } finally {
      currentMfaRecord = undefined;
      currentRecoveryCodes = [];
      persistedMfaChallenge = undefined;
    }
  });

  it('requires MFA on both OAuth continuation and admin login', async () => {
    enableCurrentUserMfa();
    persistedSession = undefined;
    persistedMfaChallenge = undefined;
    const returnTo = `/authorize?${new URLSearchParams({
      client_id: 'app-a',
      redirect_uri: applicationRedirectUri,
      response_type: 'code',
      state: validState,
      code_challenge: validCodeChallenge,
      code_challenge_method: 'S256',
    }).toString()}`;

    try {
      const oauthResponse = await request(app.getHttpServer())
        .post('/auth/login/continue')
        .type('form')
        .send({
          email: activeUser.email,
          password: 'correct-password',
          returnTo,
        })
        .expect(303);

      expect(oauthResponse.headers['location']).toBe(
        'http://localhost:3000/login/mfa',
      );
      expect(persistedMfaChallenge).toMatchObject({
        intent: 'OAUTH',
        returnTo,
      });
      expect(persistedSession).toBeUndefined();

      const adminResponse = await request(app.getHttpServer())
        .post('/auth/login/admin')
        .type('form')
        .send({
          email: activeUser.email,
          password: 'correct-password',
        })
        .expect(303);

      expect(adminResponse.headers['location']).toBe(
        'http://localhost:3000/login/mfa',
      );
      expect(persistedMfaChallenge).toMatchObject({
        intent: 'ADMIN',
        returnTo: null,
      });
      expect(persistedSession).toBeUndefined();
    } finally {
      currentMfaRecord = undefined;
      persistedMfaChallenge = undefined;
    }
  });

  it('does not redirect an authorization request to an unregistered URI', () => {
    return request(app.getHttpServer())
      .get('/authorize')
      .query({
        client_id: 'app-a',
        redirect_uri: `${applicationRedirectUri}.attacker.example`,
        response_type: 'code',
        state: validState,
        code_challenge: validCodeChallenge,
        code_challenge_method: 'S256',
      })
      .expect(400)
      .expect(({ headers }: { headers: Record<string, unknown> }) => {
        expect(headers['location']).toBeUndefined();
      });
  });

  it('sends a trusted authorization request to the login page without a central session', async () => {
    const response = await request(app.getHttpServer())
      .get('/authorize')
      .query({
        client_id: 'app-a',
        redirect_uri: applicationRedirectUri,
        response_type: 'code',
        state: validState,
        code_challenge: validCodeChallenge,
        code_challenge_method: 'S256',
      })
      .expect(302);
    const loginPageUrl = new URL(response.headers['location']);
    const returnTo = loginPageUrl.searchParams.get('return_to');

    expect(loginPageUrl.origin + loginPageUrl.pathname).toBe(
      'http://localhost:3000/login',
    );
    expect(returnTo).toEqual(expect.any(String));

    const resumedAuthorizationUrl = new URL(
      returnTo as string,
      'http://auth-server.internal',
    );

    expect(resumedAuthorizationUrl.pathname).toBe('/authorize');
    expect(resumedAuthorizationUrl.searchParams.get('client_id')).toBe('app-a');
    expect(resumedAuthorizationUrl.searchParams.get('redirect_uri')).toBe(
      applicationRedirectUri,
    );
    expect(resumedAuthorizationUrl.searchParams.get('state')).toBe(validState);
    expect(resumedAuthorizationUrl.searchParams.get('code_challenge')).toBe(
      validCodeChallenge,
    );
  });

  it('rejects an unsafe browser login continuation before checking credentials', () => {
    return request(app.getHttpServer())
      .post('/auth/login/continue')
      .type('form')
      .send({
        email: activeUser.email,
        password: 'correct-password',
        returnTo: 'https://attacker.example/authorize',
      })
      .expect(400)
      .expect({
        error: {
          code: 'INVALID_LOGIN_CONTINUATION',
          message: 'Tujuan lanjutan login tidak valid',
        },
      });
  });

  it('returns failed browser login to the UI with a generic error', async () => {
    const returnTo = `/authorize?${new URLSearchParams({
      client_id: 'app-a',
      redirect_uri: applicationRedirectUri,
      response_type: 'code',
      state: validState,
      code_challenge: validCodeChallenge,
      code_challenge_method: 'S256',
    }).toString()}`;
    const response = await request(app.getHttpServer())
      .post('/auth/login/continue')
      .type('form')
      .send({
        email: activeUser.email,
        password: 'wrong-password',
        returnTo,
      })
      .expect(303);
    const loginPageUrl = new URL(response.headers['location']);

    expect(loginPageUrl.origin + loginPageUrl.pathname).toBe(
      'http://localhost:3000/login',
    );
    expect(loginPageUrl.searchParams.get('return_to')).toBe(returnTo);
    expect(loginPageUrl.searchParams.get('error')).toBe('invalid_credentials');
    expect(response.headers['location']).not.toContain('wrong-password');
  });

  it('creates a central session and resumes /authorize after browser login', async () => {
    const browserAgent = request.agent(app.getHttpServer());
    const returnTo = `/authorize?${new URLSearchParams({
      client_id: 'app-a',
      redirect_uri: applicationRedirectUri,
      response_type: 'code',
      state: validState,
      code_challenge: validCodeChallenge,
      code_challenge_method: 'S256',
    }).toString()}`;
    const loginResponse = await browserAgent
      .post('/auth/login/continue')
      .type('form')
      .send({
        email: activeUser.email,
        password: 'correct-password',
        returnTo,
      })
      .expect(303);
    const rawSetCookieHeader = loginResponse.headers['set-cookie'] as unknown;
    const setCookieHeader = Array.isArray(rawSetCookieHeader)
      ? (rawSetCookieHeader[0] as unknown)
      : rawSetCookieHeader;

    expect(loginResponse.headers['location']).toBe(returnTo);
    expect(setCookieHeader).toEqual(expect.any(String));
    expect(setCookieHeader).toContain('HttpOnly');

    const authorizationResponse = await browserAgent.get(returnTo).expect(302);
    const callbackUrl = new URL(authorizationResponse.headers['location']);

    expect(callbackUrl.origin + callbackUrl.pathname).toBe(
      applicationRedirectUri,
    );
    expect(callbackUrl.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(callbackUrl.searchParams.get('state')).toBe(validState);
  });

  it('rejects a non-admin account from the browser admin login', async () => {
    currentRole = 'USER';

    try {
      const response = await request(app.getHttpServer())
        .post('/auth/login/admin')
        .type('form')
        .send({
          email: activeUser.email,
          password: 'correct-password',
        })
        .expect(303);
      const loginPageUrl = new URL(response.headers['location']);

      expect(loginPageUrl.origin + loginPageUrl.pathname).toBe(
        'http://localhost:3000/admin/login',
      );
      expect(loginPageUrl.searchParams.get('error')).toBe(
        'invalid_credentials',
      );
      expect(response.headers['set-cookie']).toBeUndefined();
    } finally {
      currentRole = 'ADMIN';
    }
  });

  it('creates and revokes an admin session through browser redirects', async () => {
    const adminAgent = request.agent(app.getHttpServer());
    const loginResponse = await adminAgent
      .post('/auth/login/admin')
      .type('form')
      .send({
        email: activeUser.email,
        password: 'correct-password',
      })
      .expect(303);

    expect(loginResponse.headers['location']).toBe(
      'http://localhost:3000/admin',
    );
    expect(loginResponse.headers['set-cookie']).toEqual(expect.any(Array));

    await adminAgent
      .get('/admin/metrics')
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          dependencies: { primaryDatabase: 1, rabbitmq: 1 },
          outbox: { PENDING: 0, PUBLISHED: 3 },
          queues: { mainReady: 0, mainConsumers: 1, deadLetterReady: 0 },
        });
        expect(JSON.stringify(body)).not.toContain(activeUser.email);
      });

    const logoutResponse = await adminAgent
      .post('/auth/logout/admin')
      .expect(303);

    expect(logoutResponse.headers['location']).toBe(
      'http://localhost:3000/admin/login',
    );
    expect(logoutResponse.headers['set-cookie']).toEqual(expect.any(Array));
    expect(persistedSession?.status).toBe('REVOKED');
  });

  it('lets a regular user perform SSO logout only from the public Auth Provider UI', async () => {
    currentRole = 'USER';
    const userAgent = request.agent(app.getHttpServer());

    try {
      await userAgent
        .post('/auth/login')
        .send({
          email: activeUser.email,
          password: 'correct-password',
        })
        .expect(200);

      await userAgent
        .post('/auth/logout/browser')
        .set('Origin', 'http://attacker.example')
        .expect(403)
        .expect({
          error: {
            code: 'INVALID_LOGOUT_ORIGIN',
            message:
              'Permintaan logout tidak berasal dari halaman Auth Provider yang valid',
          },
        });

      expect(persistedSession?.status).toBe('ACTIVE');
      await userAgent.get('/auth/session').expect(200);

      const logoutResponse = await userAgent
        .post('/auth/logout/browser')
        .set('Origin', 'http://localhost:3000')
        .expect(303);

      expect(logoutResponse.headers['location']).toBe(
        'http://localhost:3000/?session_notice=sso_logged_out',
      );
      expect(logoutResponse.headers['cache-control']).toBe('no-store');
      expect(logoutResponse.headers['set-cookie']).toEqual(expect.any(Array));
      expect(persistedSession?.status).toBe('REVOKED');
      await userAgent.get('/auth/session').expect(401);
    } finally {
      currentRole = 'ADMIN';
    }
  });

  it('rejects /userinfo without a Bearer access token', () => {
    return request(app.getHttpServer()).get('/userinfo').expect(401).expect({
      error: 'invalid_token',
      error_description: 'Access token tidak valid atau telah berakhir',
    });
  });

  it('rejects admin APIs without a central session', () => {
    return request(app.getHttpServer())
      .get('/admin/users')
      .expect(401)
      .expect({
        error: {
          code: 'INVALID_SESSION',
          message: 'Central session tidak ditemukan',
        },
      });
  });

  it('rejects the aggregate metrics API without an admin session', () => {
    return request(app.getHttpServer()).get('/admin/metrics').expect(401);
  });

  it('rejects an authenticated non-admin user from admin APIs', async () => {
    const regularAgent = request.agent(app.getHttpServer());
    currentRole = 'USER';

    try {
      await regularAgent
        .post('/auth/login')
        .send({ email: activeUser.email, password: 'correct-password' })
        .expect(200);
      await regularAgent
        .get('/admin/users')
        .expect(403)
        .expect({
          error: {
            code: 'ADMIN_ACCESS_REQUIRED',
            message: 'Akses administrator diperlukan',
          },
        });
    } finally {
      currentRole = 'ADMIN';
    }
  });

  it('completes login, authorization, token exchange, replay denial, and logout', async () => {
    const loginResponse = await agent
      .post('/auth/login')
      .send({ email: activeUser.email, password: 'correct-password' })
      .expect(200);
    const rawSetCookieHeader = loginResponse.headers['set-cookie'] as unknown;
    const setCookieHeader = Array.isArray(rawSetCookieHeader)
      ? (rawSetCookieHeader[0] as unknown)
      : rawSetCookieHeader;

    expect(loginResponse.body).toMatchObject({
      user: {
        id: activeUser.id,
        email: activeUser.email,
        role: 'ADMIN',
      },
      session: {
        id: '22222222-2222-4222-8222-222222222222',
        status: 'ACTIVE',
      },
    });
    expect(setCookieHeader).toEqual(expect.any(String));
    expect(setCookieHeader).toContain('HttpOnly');
    expect(setCookieHeader).toContain('SameSite=Lax');
    expect(setCookieHeader).not.toContain('correct-password');
    expect(findAuditEvent('LoginSucceeded')).toMatchObject({
      eventType: 'LoginSucceeded',
      userId: activeUser.id,
      sessionId: persistedSession?.id,
      result: 'SUCCESS',
    });

    await agent
      .get('/admin/users')
      .expect(200)
      .expect(({ body }: { body: unknown }) => {
        expect(body).toEqual([
          {
            ...adminUserListRecord(),
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]);
        expect(JSON.stringify(body)).not.toContain('passwordHash');
      });
    await agent.get('/admin/groups').expect(200);
    await agent
      .get('/admin/applications')
      .expect(200)
      .expect(({ body }: { body: unknown }) => {
        expect(JSON.stringify(body)).not.toContain('clientSecretHash');
      });

    await agent
      .get('/auth/session')
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          user: { id: activeUser.id },
          session: {
            id: '22222222-2222-4222-8222-222222222222',
            status: 'ACTIVE',
          },
        });
      });

    const authorizationResponse = await agent
      .get('/authorize')
      .query({
        client_id: 'app-a',
        redirect_uri: applicationRedirectUri,
        response_type: 'code',
        state: validState,
        code_challenge: validCodeChallenge,
        code_challenge_method: 'S256',
      })
      .expect(302);
    const callbackUrl = new URL(authorizationResponse.headers['location']);
    const rawAuthorizationCode = callbackUrl.searchParams.get('code');

    expect(rawAuthorizationCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(callbackUrl.searchParams.get('state')).toBe(validState);
    expect(persistedAuthorizationCode?.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(persistedAuthorizationCode?.codeHash).not.toBe(rawAuthorizationCode);
    expect(persistedAuthorizationCode?.redirectUri).toBe(
      applicationRedirectUri,
    );

    const basicAuthorization = `Basic ${Buffer.from(
      `app-a:${clientSecret}`,
    ).toString('base64')}`;
    const tokenRequestBody = {
      grant_type: 'authorization_code',
      code: rawAuthorizationCode,
      redirect_uri: applicationRedirectUri,
      code_verifier: validCodeVerifier,
    };
    const tokenResponse = await agent
      .post('/token')
      .set('Authorization', basicAuthorization)
      .type('form')
      .send(tokenRequestBody)
      .expect(200);

    expect(tokenResponse.headers['cache-control']).toBe('no-store');
    expect(tokenResponse.headers['pragma']).toBe('no-cache');
    const tokenResponseBody = tokenResponse.body as unknown;

    expect(tokenResponseBody).toMatchObject({
      token_type: 'Bearer',
      expires_in: 900,
      scope: 'profile',
    });
    if (
      typeof tokenResponseBody !== 'object' ||
      tokenResponseBody === null ||
      !('access_token' in tokenResponseBody) ||
      typeof tokenResponseBody.access_token !== 'string'
    ) {
      throw new Error('Token response did not include an access token');
    }

    const rawAccessToken = tokenResponseBody.access_token;

    expect(rawAccessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(persistedAuthorizationCode?.usedAt).toEqual(expect.any(Date));
    expect(persistedAccessToken?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(persistedAccessToken?.tokenHash).not.toBe(rawAccessToken);

    await agent
      .get('/userinfo')
      .set('Authorization', `Bearer ${rawAccessToken}`)
      .expect(200)
      .expect({
        sub: activeUser.id,
        name: activeUser.name,
        email: activeUser.email,
        groups: ['administrators', 'app-a-users'],
        aud: 'app-a',
        client_id: 'app-a',
        central_session_id: persistedSession?.id,
        scope: 'profile',
      });

    await agent
      .post('/token')
      .set('Authorization', basicAuthorization)
      .type('form')
      .send(tokenRequestBody)
      .expect(400)
      .expect({
        error: 'invalid_grant',
        error_description: 'Authorization code tidak valid atau telah berakhir',
      });

    await agent.post('/auth/logout').expect(204);
    expect(prisma.accessToken.updateMany).toHaveBeenCalled();
    expect(findAuditEvent('Logout')).toMatchObject({
      eventType: 'Logout',
      userId: activeUser.id,
      sessionId: persistedSession?.id,
      result: 'SUCCESS',
      metadata: { reason: 'sso_logout' },
    });
    const outboxEvent = findOutboxEvent('SessionRevoked');

    expect(outboxEvent?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof outboxEvent?.payload.occurredAt).toBe('string');
    expect(outboxEvent).toMatchObject({
      id: outboxEvent?.id,
      eventType: 'SessionRevoked',
      payload: {
        eventId: outboxEvent?.id,
        eventType: 'SessionRevoked',
        userId: activeUser.id,
        centralSessionId: persistedSession?.id,
        applicationId: null,
        reason: 'sso_logout',
        occurredAt: outboxEvent?.payload.occurredAt,
        metadata: { source: 'auth_logout' },
      },
    });
    expect(outboxEvent?.payload.eventId).toBe(outboxEvent?.id);

    await agent.get('/auth/session').expect(401);
    await agent
      .get('/userinfo')
      .set('Authorization', `Bearer ${rawAccessToken}`)
      .expect(401);
  });

  it('becomes not ready and rejects new business requests while draining', async () => {
    app.get(ShutdownStateService).beginDraining();

    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          status: 'not_ready',
          lifecycle: 'draining',
        });
      });

    await request(app.getHttpServer())
      .get('/')
      .expect(503)
      .expect({
        error: {
          code: 'SERVICE_SHUTTING_DOWN',
          message: 'Layanan sedang berhenti',
        },
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
