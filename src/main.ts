import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // LiveKit webhooks arrive with Content-Type: application/webhook+json which
  // NestJS's JSON body parser ignores. Apply express.raw() specifically to the
  // webhook route so req.rawBody is always a Buffer regardless of content-type.
  app.use(
    '/livekit/webhook',
    express.raw({ type: '*/*' }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Voice agent platform listening on port ${port}`);
}
bootstrap();
