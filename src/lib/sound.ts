/**
 * Procedural Web Audio API tactile sound synthesizer for Euloge Arcade.
 * Zero external audio assets required, zero network requests, 100% CSP-compliant.
 * Automatically muted when `soundEnabled` is false or `prefers-reduced-motion` is active.
 */

let audioCtx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

function getContext(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null;
  if (document.documentElement.dataset.motion === 'reduced') return null;
  const Ctx = window.AudioContext || (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!Ctx) return null;
  try {
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/** Subtle crystalline micro-tick on cartridge hover or tab switch. */
export function playHoverTick() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1480, now);
    osc.frequency.exponentialRampToValueAtTime(2200, now + 0.022);
    gain.gain.setValueAtTime(0.018, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.026);
  } catch {
    // Ignore audio context restrictions
  }
}

/** Tactile console click for buttons and filter chips. */
export function playClickPulse() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.045);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  } catch {
    // Ignore
  }
}

/** Futuristic cartridge lock-in sound when launching a game. */
export function playCartridgeLock() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const notes = [330, 495, 660, 990];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + idx * 0.035;
      osc.type = idx === notes.length - 1 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.08, start + 0.09);
      gain.gain.setValueAtTime(0.04, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.12);
    });
  } catch {
    // Ignore
  }
}

/** Dual-tone chime when adding/removing a favorite cartridge. */
export function playFavoriteChime(added: boolean) {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const pair = added ? [587.33, 880] : [659.25, 440];
    pair.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * 0.055;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.04, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.13);
    });
  } catch {
    // Ignore
  }
}

/** Celebratory synth chord when unlocking an achievement or completing a calibration. */
export function playAchievementFanfare() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * 0.06;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.045, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch {
    // Ignore
  }
}

