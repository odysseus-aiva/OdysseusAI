import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TwilioController } from './twilio.controller';
import { TwilioService } from './twilio.service';

@Module({
  imports: [ConfigModule],
  controllers: [TwilioController],
  providers: [TwilioService],
  exports: [TwilioService],
})
export class TwilioModule {}
