import {describe, expect, it} from 'vitest';
import {currentLrcLine, parseLrc} from './lrc';
import {detectPitch, foldToTarget, freqToMidi, noteScore, pitchError, songResult} from './pitch';
import {SONGS, timeline} from './songs';

const RATE = 48000;
function tone(freq: number, harmonics = [1], n = 2048, amp = 0.3, noise = 0, seed = 7) {
  const buf = new Float32Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    let v = 0;
    harmonics.forEach((h, k) => (v += (h * Math.sin((2 * Math.PI * freq * (k + 1) * i) / RATE)) / harmonics.length));
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    buf[i] = amp * v + noise * ((s / 0x7fffffff) * 2 - 1);
  }
  return buf;
}

describe('pitch detection', () => {
  it.each([110, 196, 261.63, 440, 659.25])('finds %s Hz within 1 %%', (f) => {
    expect(detectPitch(tone(f), RATE)).toBeCloseTo(f, -Math.log10(f * 0.01));
  });

  it('is not fooled into octave errors by a voice-like harmonic spectrum', () => {
    const f = detectPitch(tone(196, [1, 0.8, 0.6, 0.4, 0.3]), RATE)!;
    expect(Math.abs(freqToMidi(f) - freqToMidi(196))).toBeLessThan(0.3);
  });

  it('copes with background noise', () => {
    const f = detectPitch(tone(330, [1, 0.5], 2048, 0.3, 0.05), RATE)!;
    expect(Math.abs(freqToMidi(f) - freqToMidi(330))).toBeLessThan(0.3);
  });

  it('returns null for silence and for pure noise', () => {
    expect(detectPitch(new Float32Array(2048), RATE)).toBeNull();
    expect(detectPitch(tone(440, [1], 2048, 0, 0.3), RATE)).toBeNull();
  });
});

describe('scoring', () => {
  it('ignores the octave and wraps around', () => {
    expect(pitchError(48, 60)).toBe(0);
    expect(pitchError(71, 60)).toBe(1);
    expect(pitchError(60.4, 72)).toBeCloseTo(0.4);
    expect(foldToTarget(47.8, 60)).toBeCloseTo(59.8);
  });

  it('scores notes from samples, silence counting as a miss', () => {
    expect(noteScore([60, 60.2, 59.7], 60)).toBe(1);
    expect(noteScore([60, null], 60)).toBe(0.5);
    expect(noteScore([], 60)).toBe(0);
    expect(noteScore([63, 66], 60)).toBe(0);
  });

  it('turns note scores into points, accuracy and a title', () => {
    expect(songResult([1, 1, 1])).toEqual({points: 10000, accuracy: 100, stars: 5, title: 'Légende du néon'});
    expect(songResult([0.5, 0.5]).accuracy).toBe(50);
    expect(songResult([]).points).toBe(0);
  });
});

describe('songs', () => {
  it('have notes in a singable range, positive durations and a consistent timeline', () => {
    for (const song of SONGS) {
      const notes = timeline(song);
      expect(notes.length).toBeGreaterThan(5);
      for (let i = 0; i < notes.length; i++) {
        expect(notes[i].end).toBeGreaterThan(notes[i].start);
        expect(notes[i].midi).toBeGreaterThanOrEqual(53);
        expect(notes[i].midi).toBeLessThanOrEqual(74);
        expect(notes[i].syllable.trim().length).toBeGreaterThan(0);
        if (i > 0) expect(notes[i].start).toBeCloseTo(notes[i - 1].end);
      }
    }
  });

  it('transposes every note', () => {
    const song = SONGS[1];
    expect(timeline(song, -3).map((n) => n.midi)).toEqual(timeline(song).map((n) => n.midi - 3));
  });
});

describe('lrc', () => {
  it('parses timestamps, multiple tags and ignores metadata', () => {
    const lines = parseLrc('[ar:Moi]\n[00:01.50]Bonjour\n[00:05.2][00:09.25]Refrain\nsans tag\n[01:02]Fin');
    expect(lines).toEqual([
      {time: 1.5, text: 'Bonjour'},
      {time: 5.2, text: 'Refrain'},
      {time: 9.25, text: 'Refrain'},
      {time: 62, text: 'Fin'},
    ]);
    expect(currentLrcLine(lines, 0)).toBe(-1);
    expect(currentLrcLine(lines, 6)).toBe(1);
    expect(currentLrcLine(lines, 100)).toBe(3);
  });
});
