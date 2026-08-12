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

describe('AppController (e2e)', () => {
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
        tokenHash: string;
        applicationId: string;
        ssoSessionId: string;
      }
    | undefined;
  let persistedSession:
    | {
        id: string;
        sessionTokenHash: string;
        status: 'ACTIVE' | 'REVOKED';
        createdAt: Date;
        expiresAt: Date;
        lastActivityAt: Date | null;
        revokedAt: Date | null;
      }
    | undefined;
  const activeUser = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Admin',
    email: 'admin@example.com',
    passwordHash: '',
    status: 'ACTIVE' as const,
    role: 'ADMIN' as const,
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    ssoSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    accessToken: {
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    application: {
      findUnique: jest.fn(),
    },
    applicationGroupPolicy: {
      findFirst: jest.fn(),
    },
    authorizationCode: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeAll(async () => {
    activeUser.passwordHash = await hashPassword('correct-password');
    prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { email: string } }) =>
        Promise.resolve(where.email === activeUser.email ? activeUser : null),
    );
    prisma.ssoSession.create.mockImplementation(
      ({
        data,
      }: {
        data: {
          sessionTokenHash: string;
          expiresAt: Date;
          lastActivityAt: Date;
        };
      }) => {
        persistedSession = {
          id: '22222222-2222-4222-8222-222222222222',
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
            ? { ...persistedSession, user: activeUser }
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
    prisma.accessToken.updateMany.mockResolvedValue({ count: 0 });
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
    prisma.accessToken.create.mockImplementation(
      ({
        data,
      }: {
        data: {
          tokenHash: string;
          applicationId: string;
          ssoSessionId: string;
        };
      }) => {
        persistedAccessToken = data;
        return Promise.resolve(data);
      },
    );
    prisma.auditLog.create.mockResolvedValue({});
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
      });
  });

  it('validates the login request body before checking credentials', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: '', unexpected: true })
      .expect(400);
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

  it('returns login_required to a registered URI without a central session', async () => {
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
    const callbackUrl = new URL(response.headers['location']);

    expect(callbackUrl.origin + callbackUrl.pathname).toBe(
      applicationRedirectUri,
    );
    expect(callbackUrl.searchParams.get('error')).toBe('login_required');
    expect(callbackUrl.searchParams.get('state')).toBe(validState);
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

    await agent.get('/auth/session').expect(401);
  });

  afterAll(async () => {
    await app.close();
  });
});
