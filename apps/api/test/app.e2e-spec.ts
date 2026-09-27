import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';

/**
 * Requires a reachable PostgreSQL instance and a valid .env (see
 * docker-compose.yml). Not part of `pnpm test`; run explicitly via
 * `pnpm --filter api test:e2e` after `docker compose up -d postgres`.
 */
describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live returns ok', () => {
    return request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /health/ready returns ok when dependencies are reachable', () => {
    return request(app.getHttpServer()).get('/health/ready').expect(200);
  });
});
