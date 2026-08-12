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

  afterAll(async () => {
    await app.close();
  });
});
