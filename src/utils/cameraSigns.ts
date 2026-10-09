/**
 * What the in-browser classifier can recognize: static handshapes for a–z and 0–9
 * (see public/models/asl-classifier/labels.json). It has no output for "ten".
 */

// Map classifier digit labels (0-9) to word labels used in Level 2
export const DIGIT_TO_WORD: Record<string, string> = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
};

const RECOGNIZABLE_WORDS = new Set(Object.values(DIGIT_TO_WORD));

/** True when camera practice can actually detect this library sign. */
export function isCameraRecognizable(sign: string): boolean {
  const key = sign.toLowerCase();
  return /^[a-z]$/.test(key) || RECOGNIZABLE_WORDS.has(key);
}
