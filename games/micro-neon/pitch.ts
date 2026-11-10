/**
 * Voice pitch detection (normalized square difference / McLeod pitch method,
 * simplified) and karaoke scoring. Audio is analysed in memory only: nothing is
 * recorded or sent anywhere.
 */

export const MIN_FREQ = 70;
export const MAX_FREQ = 1000;

/** Returns the fundamental frequency in Hz, or null for silence / unclear sound. */
export function detectPitch(buf: Float32Array, sampleRate: number, minRms = 0.01, minClarity = 0.8): number | null {
  const n = buf.length;
  let energy = 0;
  for (let i = 0; i < n; i++) energy += buf[i] * buf[i];
  if (Math.sqrt(energy / n) < minRms) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / MIN_FREQ));
  const nsdf = new Float32Array(maxLag + 2);
  for (let tau = 1; tau <= maxLag + 1; tau++) {
    let acf = 0;
    let m = 0;
    for (let i = 0; i + tau < n; i++) {
      acf += buf[i] * buf[i + tau];
      m += buf[i] * buf[i] + buf[i + tau] * buf[i + tau];
    }
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
  }

  // Key maxima: highest point of each positive lobe after the first negative dip.
  const peaks: number[] = [];
  let tau = 1;
  while (tau <= maxLag && nsdf[tau] > 0) tau++;
  for (; tau <= maxLag; tau++) {
    if (nsdf[tau] > 0) {
      let best = tau;
      while (tau <= maxLag && nsdf[tau] > 0) {
        if (nsdf[tau] > nsdf[best]) best = tau;
        tau++;
      }
      if (best >= minLag) peaks.push(best);
    }
  }
  if (peaks.length === 0) return null;
  const highest = Math.max(...peaks.map((p) => nsdf[p]));
  if (highest < minClarity) return null;
  // First peak close to the highest one: avoids octave-down errors.
  const chosen = peaks.find((p) => nsdf[p] >= 0.9 * highest)!;

  const a = nsdf[chosen - 1];
  const b = nsdf[chosen];
  const c = nsdf[chosen + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  const freq = sampleRate / (chosen + Math.max(-0.5, Math.min(0.5, shift)));
  return freq >= MIN_FREQ && freq <= MAX_FREQ ? freq : null;
}

export const freqToMidi = (f: number) => 69 + 12 * Math.log2(f / 440);
export const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Distance in semitones to the target, ignoring the octave (men and children sing apart). */
export function pitchError(sungMidi: number, targetMidi: number): number {
  const d = (((sungMidi - targetMidi) % 12) + 12) % 12;
  return Math.min(d, 12 - d);
}

/** Moves a sung pitch to the octave nearest the target (for display). */
export const foldToTarget = (sungMidi: number, targetMidi: number) =>
  sungMidi + 12 * Math.round((targetMidi - sungMidi) / 12);

export function sampleScore(error: number | null): number {
  if (error === null) return 0;
  if (error <= 0.5) return 1;
  if (error <= 1) return 0.6;
  if (error <= 1.5) return 0.25;
  return 0;
}

/** Average over the samples taken while the note was expected (silence counts as 0). */
export function noteScore(samples: (number | null)[], targetMidi: number): number {
  if (samples.length === 0) return 0;
  return samples.reduce((s, m) => s + sampleScore(m === null ? null : pitchError(m, targetMidi)), 0) / samples.length;
}

export interface SongResult {
  points: number;
  accuracy: number;
  stars: number;
  title: string;
}

export function songResult(noteScores: number[]): SongResult {
  const mean = noteScores.length ? noteScores.reduce((a, b) => a + b, 0) / noteScores.length : 0;
  const accuracy = Math.round(mean * 100);
  const title =
    accuracy >= 90 ? 'Légende du néon' : accuracy >= 75 ? 'Star de la soirée' : accuracy >= 55 ? 'Belle voix' : accuracy >= 35 ? 'En rodage' : 'Courage, on recommence !';
  return {points: Math.round(mean * 10000), accuracy, stars: Math.round(mean * 5), title};
}
