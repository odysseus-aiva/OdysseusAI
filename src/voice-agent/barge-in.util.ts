/** Short backchannels that should not confirm barge-in on their own. */
const BACKCHANNEL_WORDS = new Set([
  'yeah',
  'yes',
  'yep',
  'yup',
  'ok',
  'okay',
  'hmm',
  'hm',
  'uh',
  'um',
  'huh',
  'right',
  'mhm',
  'mm',
  'mmm',
  'uhhuh',
  'uh-huh',
  'ah',
  'oh',
]);

/**
 * Returns true if transcript has at least one content word
 * (not only backchannel / filler words).
 */
export function hasContentWord(transcript: string): boolean {
  const words = transcript
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  return words.some((w) => !BACKCHANNEL_WORDS.has(w));
}
