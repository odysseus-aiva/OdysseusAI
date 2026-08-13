import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Body,
} from '@nestjs/common';
import { IsOptional, IsString, Matches } from 'class-validator';
import { TwilioService } from './twilio.service';

class PurchaseNumberDto {
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'phoneNumber must be E.164 format, e.g. +15551234567',
  })
  phoneNumber!: string;
}

class SearchQueryDto {
  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  areaCode?: string;
}

@Controller('twilio/numbers')
export class TwilioController {
  constructor(private readonly twilioService: TwilioService) {}

  @Get('available')
  searchAvailable(@Query() query: SearchQueryDto) {
    const country = query.country?.toUpperCase() ?? 'US';
    return this.twilioService.searchAvailable(country, query.areaCode);
  }

  @Get('owned')
  listOwned() {
    return this.twilioService.listOwned();
  }

  @Post('purchase')
  @HttpCode(201)
  purchase(@Body() dto: PurchaseNumberDto) {
    return this.twilioService.purchaseAndAttach(dto.phoneNumber);
  }

  @Delete(':sid')
  @HttpCode(204)
  async release(@Param('sid') sid: string) {
    await this.twilioService.release(sid);
  }
}
