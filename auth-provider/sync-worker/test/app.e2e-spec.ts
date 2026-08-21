import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('GET / identifies the sync worker', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect({
      service: 'sync-worker',
      message: 'Sync Worker is running',
    });
  });

  it('GET /health reports a healthy status', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          status: 'ok',
          service: 'sync-worker',
        });
        expect(body.timestamp).toEqual(expect.any(String));
      });
  });

  it('GET /metrics exposes aggregate Prometheus metrics', () => {
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
          expect(text).toContain('sync_worker_http_requests_total');
          expect(text).toContain('sync_worker_dependency_up');
          expect(text).not.toContain('postgresql://');
          expect(text).not.toContain('INTERNAL_SERVICE_SECRET');
        },
      );
  });

  afterAll(async () => {
    await app.close();
  });
});
