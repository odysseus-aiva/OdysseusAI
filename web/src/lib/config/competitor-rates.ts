export const OMNI_RATE_PER_MIN = 0.05 as const;

export interface CompetitorRate {
  name: string;
  ratePerMin: number;
  source: string;
  note: string;
}

export const COMPETITOR_RATES: readonly CompetitorRate[] = [
  {
    name: 'Retell AI',
    ratePerMin: 0.130,
    source: 'retellai.com/pricing',
    note: 'GPT-4.1 + standard TTS + telephony',
  },
  {
    name: 'Vapi',
    ratePerMin: 0.150,
    source: 'vapi.ai/pricing',
    note: 'Est. all-in with hosted providers',
  },
  {
    name: 'Bland AI',
    ratePerMin: 0.140,
    source: 'bland.ai/pricing',
    note: 'Start plan, fully bundled',
  },
];
