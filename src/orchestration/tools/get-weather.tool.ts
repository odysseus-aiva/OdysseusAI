import { Injectable, Logger } from '@nestjs/common';
import { AgentTool } from '../interfaces/agent-tool.interface';
import { ToolExecutionContext } from '../interfaces/tool-execution-context.interface';

export interface WeatherInput {
  location?: string;
  /** today | tomorrow | weekend | forecast */
  when?: string;
}

export interface WeatherDay {
  date: string;
  condition: string;
  tempMax: number;
  tempMin: number;
  precipitationProbability: number;
  precipitationSum: number;
}

export interface WeatherOutput {
  location: string;
  timezone: string;
  units: 'metric' | 'imperial';
  current?: {
    temperature: number;
    condition: string;
    humidity?: number;
    windSpeed?: number;
  };
  daily: WeatherDay[];
  summary: string;
}

const WMO_CODES: Record<number, string> = {
  0: 'clear skies',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'foggy',
  48: 'depositing rime fog',
  51: 'light drizzle',
  53: 'moderate drizzle',
  55: 'dense drizzle',
  61: 'light rain',
  63: 'moderate rain',
  65: 'heavy rain',
  71: 'light snow',
  73: 'moderate snow',
  75: 'heavy snow',
  80: 'light rain showers',
  81: 'moderate rain showers',
  82: 'violent rain showers',
  95: 'thunderstorms',
  96: 'thunderstorms with light hail',
  99: 'thunderstorms with heavy hail',
};

@Injectable()
export class GetWeatherTool implements AgentTool<WeatherInput, WeatherOutput> {
  readonly name = 'get_weather';
  readonly description =
    'Get current weather and a short forecast for a city or location. Use for questions like weather in Noida, rain in Delhi tomorrow, or Bengaluru this weekend.';
  readonly schema: Record<string, unknown> = {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City or place name, e.g. Noida, Delhi, Bengaluru',
      },
      when: {
        type: 'string',
        description:
          'Optional time focus: today, tomorrow, weekend, or forecast',
      },
    },
    additionalProperties: false,
  };

  private readonly logger = new Logger(GetWeatherTool.name);

  async execute(
    input: WeatherInput,
    context: ToolExecutionContext,
  ): Promise<WeatherOutput> {
    const config = context.toolConfigs?.[this.name] ?? {};
    const units =
      config.units === 'imperial' ? 'imperial' : ('metric' as const);
    const forecastDays = Math.min(
      7,
      Math.max(1, Number(config.forecastDays ?? 7)),
    );
    const location =
      (typeof input.location === 'string' && input.location.trim()) ||
      (typeof config.defaultLocation === 'string' &&
        config.defaultLocation.trim()) ||
      '';

    if (!location) {
      throw new Error('A location is required to look up the weather');
    }

    this.logger.log(
      `[${context.callId}] get_weather start location="${location}" when=${input.when ?? 'forecast'} units=${units}`,
    );

    const geo = await this.geocode(location);
    this.logger.log(
      `[${context.callId}] get_weather geocoded → ${geo.name} (${geo.latitude},${geo.longitude})`,
    );
    const forecast = await this.fetchForecast(
      geo.latitude,
      geo.longitude,
      units,
      forecastDays,
    );

    const daily = this.mapDaily(forecast, input.when);
    const current = this.mapCurrent(forecast);
    const summary = this.buildSummary(
      geo.name,
      current,
      daily,
      input.when,
      units,
    );

    this.logger.log(
      `[${context.callId}] Weather for ${geo.name}: ${daily.length} day(s)`,
    );

    return {
      location: geo.name,
      timezone: String(forecast.timezone ?? geo.timezone ?? 'UTC'),
      units,
      current,
      daily,
      summary,
    };
  }

  private async geocode(location: string): Promise<{
    name: string;
    latitude: number;
    longitude: number;
    timezone?: string;
  }> {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', location);
    url.searchParams.set('count', '1');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Geocoding failed (${response.status})`);
    }

    const data = (await response.json()) as {
      results?: Array<{
        name: string;
        latitude: number;
        longitude: number;
        timezone?: string;
        admin1?: string;
        country?: string;
      }>;
    };

    const first = data.results?.[0];
    if (!first) {
      throw new Error(`Could not find location: ${location}`);
    }

    const parts = [first.name, first.admin1, first.country].filter(Boolean);
    return {
      name: parts.join(', '),
      latitude: first.latitude,
      longitude: first.longitude,
      timezone: first.timezone,
    };
  }

  private async fetchForecast(
    latitude: number,
    longitude: number,
    units: 'metric' | 'imperial',
    forecastDays: number,
  ): Promise<Record<string, unknown>> {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m');
    url.searchParams.set(
      'daily',
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
    );
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', String(forecastDays));
    if (units === 'imperial') {
      url.searchParams.set('temperature_unit', 'fahrenheit');
      url.searchParams.set('wind_speed_unit', 'mph');
      url.searchParams.set('precipitation_unit', 'inch');
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Weather forecast failed (${response.status})`);
    }
    return (await response.json()) as Record<string, unknown>;
  }

  private mapCurrent(
    forecast: Record<string, unknown>,
  ): WeatherOutput['current'] | undefined {
    const current = forecast.current as
      | {
          temperature_2m?: number;
          relative_humidity_2m?: number;
          weather_code?: number;
          wind_speed_10m?: number;
        }
      | undefined;
    if (!current) return undefined;
    return {
      temperature: Number(current.temperature_2m ?? 0),
      condition: this.describeCode(Number(current.weather_code ?? 0)),
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
    };
  }

  private mapDaily(
    forecast: Record<string, unknown>,
    when?: string,
  ): WeatherDay[] {
    const daily = forecast.daily as
      | {
          time?: string[];
          weather_code?: number[];
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
          precipitation_probability_max?: number[];
          precipitation_sum?: number[];
        }
      | undefined;

    if (!daily?.time?.length) return [];

    const days: WeatherDay[] = daily.time.map((date, i) => ({
      date,
      condition: this.describeCode(Number(daily.weather_code?.[i] ?? 0)),
      tempMax: Number(daily.temperature_2m_max?.[i] ?? 0),
      tempMin: Number(daily.temperature_2m_min?.[i] ?? 0),
      precipitationProbability: Number(
        daily.precipitation_probability_max?.[i] ?? 0,
      ),
      precipitationSum: Number(daily.precipitation_sum?.[i] ?? 0),
    }));

    return this.filterByWhen(days, when);
  }

  private filterByWhen(days: WeatherDay[], when?: string): WeatherDay[] {
    const focus = (when ?? 'forecast').toLowerCase().trim();
    if (!focus || focus === 'forecast' || focus === 'today') {
      return focus === 'today' ? days.slice(0, 1) : days;
    }
    if (focus === 'tomorrow') {
      return days.slice(1, 2);
    }
    if (focus.includes('weekend')) {
      return days.filter((d) => {
        const dow = new Date(`${d.date}T12:00:00`).getDay();
        return dow === 0 || dow === 6;
      });
    }
    return days;
  }

  private buildSummary(
    location: string,
    current: WeatherOutput['current'] | undefined,
    daily: WeatherDay[],
    when: string | undefined,
    units: 'metric' | 'imperial',
  ): string {
    const unitLabel = units === 'imperial' ? '°F' : '°C';
    const parts: string[] = [];
    if (current && (!when || when === 'today' || when === 'forecast')) {
      parts.push(
        `Right now in ${location} it is ${Math.round(current.temperature)}${unitLabel} and ${current.condition}.`,
      );
    }
    if (daily.length === 1) {
      const d = daily[0];
      parts.push(
        `On ${d.date}, expect ${d.condition} with highs near ${Math.round(d.tempMax)}${unitLabel} and a ${d.precipitationProbability}% chance of precipitation.`,
      );
    } else if (daily.length > 1) {
      const first = daily[0];
      parts.push(
        `Looking ahead, ${first.date} looks ${first.condition} with a high near ${Math.round(first.tempMax)}${unitLabel}.`,
      );
    }
    return parts.join(' ') || `Weather for ${location} is unavailable.`;
  }

  private describeCode(code: number): string {
    return WMO_CODES[code] ?? 'mixed conditions';
  }
}
