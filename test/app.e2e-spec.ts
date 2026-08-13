import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Voice Agent Platform (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  it('POST /voice-agent/start creates a session', async () => {
    const response = await request(app.getHttpServer())
      .post('/voice-agent/start')
      .send({
        roomName: 'test-room',
        callId: 'test-call-1',
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.session.roomName).toBe('test-room');
  });

  afterEach(async () => {
    await app.close();
  });
});
