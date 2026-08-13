import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Twilio from 'twilio';
import { SipClient } from 'livekit-server-sdk';

export interface AvailableNumber {
  friendlyName: string;
  phoneNumber: string;
  locality: string;
  region: string;
  isoCountry: string;
  monthlyPrice?: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
  };
}

export interface OwnedNumber {
  sid: string;
  friendlyName: string;
  phoneNumber: string;
  dateCreated: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
  };
}

@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);
  private _client: ReturnType<typeof Twilio> | null = null;
  private _sipClient: SipClient | null = null;

  constructor(private readonly configService: ConfigService) {}

  private get sipClient(): SipClient | null {
    const url = this.configService.get<string>('livekit.url');
    const apiKey = this.configService.get<string>('livekit.apiKey');
    const apiSecret = this.configService.get<string>('livekit.apiSecret');
    if (!url || !apiKey || !apiSecret) return null;
    this._sipClient ??= new SipClient(url, apiKey, apiSecret);
    return this._sipClient;
  }

  private get liveKitTrunkId(): string {
    return this.configService.get<string>('livekit.sip.trunkId') ?? '';
  }

  private async addNumberToLiveKitTrunk(phoneNumber: string): Promise<void> {
    const sip = this.sipClient;
    const trunkId = this.liveKitTrunkId;
    if (!sip || !trunkId) {
      this.logger.warn(
        `LiveKit SIP not configured — skipping trunk registration for ${phoneNumber}`,
      );
      return;
    }
    const trunks = await sip.listSipInboundTrunk({ trunkIds: [trunkId] });
    const trunk = trunks[0];
    if (!trunk) {
      this.logger.warn(`LiveKit SIP inbound trunk "${trunkId}" not found`);
      return;
    }
    if (trunk.numbers.includes(phoneNumber)) {
      this.logger.log(
        `${phoneNumber} already on LiveKit trunk ${trunkId} — no-op`,
      );
      return;
    }
    trunk.numbers = [...trunk.numbers, phoneNumber];
    await sip.updateSipInboundTrunk(trunkId, trunk);
    this.logger.log(`Added ${phoneNumber} to LiveKit SIP trunk ${trunkId}`);
  }

  private async removeNumberFromLiveKitTrunk(
    phoneNumber: string,
  ): Promise<void> {
    const sip = this.sipClient;
    const trunkId = this.liveKitTrunkId;
    if (!sip || !trunkId) return;
    const trunks = await sip.listSipInboundTrunk({ trunkIds: [trunkId] });
    const trunk = trunks[0];
    if (!trunk || !trunk.numbers.includes(phoneNumber)) return;
    trunk.numbers = trunk.numbers.filter((n) => n !== phoneNumber);
    await sip.updateSipInboundTrunk(trunkId, trunk);
    this.logger.log(`Removed ${phoneNumber} from LiveKit SIP trunk ${trunkId}`);
  }

  private get client(): ReturnType<typeof Twilio> {
    if (!this._client) {
      const accountSid = this.configService.get<string>('twilio.accountSid');
      const authToken = this.configService.get<string>('twilio.authToken');
      if (!accountSid || !authToken) {
        throw new ServiceUnavailableException(
          'Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.',
        );
      }
      this._client = Twilio(accountSid, authToken);
    }
    return this._client;
  }

  private get trunkSid(): string {
    const sid = this.configService.get<string>('twilio.trunkSid');
    if (!sid) {
      throw new ServiceUnavailableException(
        'Twilio SIP trunk not configured. Set TWILIO_TRUNK_SID.',
      );
    }
    return sid;
  }

  async searchAvailable(
    country: string,
    areaCode?: string,
  ): Promise<AvailableNumber[]> {
    const params: { limit: number; areaCode?: number; voiceEnabled: boolean } =
      { limit: 20, voiceEnabled: true };
    if (areaCode) {
      const parsed = parseInt(areaCode, 10);
      if (!isNaN(parsed)) params.areaCode = parsed;
    }

    const numbers = await this.client
      .availablePhoneNumbers(country)
      .local.list(params);

    return numbers.map((n) => ({
      friendlyName: n.friendlyName ?? n.phoneNumber,
      phoneNumber: n.phoneNumber,
      locality: n.locality ?? '',
      region: n.region ?? '',
      isoCountry: n.isoCountry ?? country,
      capabilities: {
        voice: n.capabilities?.voice ?? false,
        sms: n.capabilities?.sms ?? false,
      },
    }));
  }

  async listOwned(): Promise<OwnedNumber[]> {
    const numbers = await this.client.incomingPhoneNumbers.list({ limit: 50 });
    return numbers.map((n) => ({
      sid: n.sid,
      friendlyName: n.friendlyName ?? n.phoneNumber,
      phoneNumber: n.phoneNumber,
      dateCreated: n.dateCreated?.toISOString() ?? '',
      capabilities: {
        voice: n.capabilities?.voice ?? false,
        sms: n.capabilities?.sms ?? false,
      },
    }));
  }

  /**
   * Purchase a phone number and attach it to the configured Twilio SIP trunk.
   * Returns the purchased E.164 phone number string.
   */
  async purchaseAndAttach(
    phoneNumber: string,
  ): Promise<{ sid: string; phoneNumber: string }> {
    if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
      throw new BadRequestException('phoneNumber must be E.164 format');
    }

    const purchased = await this.client.incomingPhoneNumbers.create({
      phoneNumber,
    });

    this.logger.log(
      `Purchased Twilio number: ${purchased.phoneNumber} (${purchased.sid})`,
    );

    try {
      await this.client.trunking.v1
        .trunks(this.trunkSid)
        .phoneNumbers.create({ phoneNumberSid: purchased.sid });
      this.logger.log(
        `Attached ${purchased.phoneNumber} to Twilio elastic trunk ${this.trunkSid}`,
      );
    } catch (err) {
      this.logger.warn(
        `Purchased number ${purchased.phoneNumber} but could not attach to Twilio trunk: ${(err as Error).message}`,
      );
    }

    try {
      await this.addNumberToLiveKitTrunk(purchased.phoneNumber);
    } catch (err) {
      this.logger.warn(
        `Purchased number ${purchased.phoneNumber} but could not add to LiveKit trunk: ${(err as Error).message}`,
      );
    }

    return { sid: purchased.sid, phoneNumber: purchased.phoneNumber };
  }

  async release(sid: string): Promise<void> {
    // Fetch phone number before removing so we can clean up LiveKit trunk too.
    let phoneNumber: string | undefined;
    try {
      const info = await this.client.incomingPhoneNumbers(sid).fetch();
      phoneNumber = info.phoneNumber;
    } catch {
      // If fetch fails, proceed with Twilio release anyway.
    }

    await this.client.incomingPhoneNumbers(sid).remove();
    this.logger.log(`Released Twilio number ${sid}`);

    if (phoneNumber) {
      try {
        await this.removeNumberFromLiveKitTrunk(phoneNumber);
      } catch (err) {
        this.logger.warn(
          `Released Twilio number ${sid} but could not remove from LiveKit trunk: ${(err as Error).message}`,
        );
      }
    }
  }
}
