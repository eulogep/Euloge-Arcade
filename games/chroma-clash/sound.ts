/**
 * Lightweight Web Audio synthesizer for Chroma Clash // 4 Colors.
 * Zero external audio assets required; fails silently in headless/test environments.
 */

let ctx: AudioContext | null = null;
let muted = false;

export function isSoundMuted(): boolean {
  return muted;
}

export function toggleSoundMuted(): boolean {
  muted = !muted;
  return muted;
}

function getContext(): AudioContext | null {
  if (muted || typeof window === 'undefined') return null;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) ctx = new AudioCtx();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, duration: number, type: OscillatorType = 'sine', gainPeak = 0.08, delay = 0, freqEnd?: number) {
  const c = getContext();
  if (!c) return;
  try {
    const start = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(gainPeak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  } catch {
    // Ignore audio context errors in restricted environments
  }
}

export function sfxCardPlay() {
  tone(320, 0.09, 'triangle', 0.1, 0, 640);
  tone(580, 0.07, 'sine', 0.06, 0.03, 780);
}

export function sfxCardDraw() {
  tone(260, 0.08, 'sine', 0.07, 0, 420);
}

export function sfxSpecial(kind: 'bond' | 'retour' | 'plus2' | 'prisme' | 'surcharge') {
  switch (kind) {
    case 'bond':
      tone(240, 0.12, 'sawtooth', 0.07, 0, 160);
      tone(180, 0.14, 'sawtooth', 0.07, 0.09, 120);
      break;
    case 'retour':
      tone(340, 0.1, 'triangle', 0.08, 0, 680);
      tone(680, 0.12, 'triangle', 0.08, 0.08, 340);
      break;
    case 'plus2':
    case 'surcharge':
      tone(440, 0.1, 'square', 0.06, 0, 320);
      tone(520, 0.12, 'square', 0.07, 0.08, 660);
      if (kind === 'surcharge') tone(660, 0.16, 'square', 0.08, 0.16, 880);
      break;
    case 'prisme':
      tone(440, 0.09, 'sine', 0.07, 0);
      tone(554, 0.09, 'sine', 0.07, 0.06);
      tone(659, 0.12, 'sine', 0.08, 0.12);
      tone(880, 0.16, 'sine', 0.09, 0.18);
      break;
  }
}

export function sfxUnoCall() {
  tone(587.33, 0.1, 'triangle', 0.1, 0);
  tone(880, 0.22, 'triangle', 0.12, 0.08);
}

export function sfxPenalty() {
  tone(220, 0.16, 'sawtooth', 0.08, 0, 150);
  tone(165, 0.22, 'sawtooth', 0.08, 0.14, 110);
}

export function sfxWinRound() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((n, i) => tone(n, 0.18, 'triangle', 0.09, i * 0.08));
}

