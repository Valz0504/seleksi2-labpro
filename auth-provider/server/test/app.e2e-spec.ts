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
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
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

  beforeAll(async () => {
    activeUser.passwordHash = await hashPassword('correct-password');
    prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { email: string } }) =>
        Promise.resolve(
          where.email === activeUser.email
            ? { ...activeUser, role: currentRole }
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
        expect(operationCount).toBe(34);
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

    await agent.get('/auth/session').expect(401);
    await agent
      .get('/userinfo')
      .set('Authorization', `Bearer ${rawAccessToken}`)
      .expect(401);
  });

  afterAll(async () => {
    await app.close();
  });
});
