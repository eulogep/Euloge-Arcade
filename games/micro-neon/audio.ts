/** Web Audio helpers: guide melody, unpitched metronome clicks, microphone input. */
import {midiToFreq} from './pitch';
import type {TimedNote} from './songs';

type Stop = () => void;

export function createContext(): AudioContext {
  const Ctor = window.AudioContext ?? (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
  return new Ctor();
}

/** Soft triangle-wave melody starting at `t0` (AudioContext time). */
export function scheduleMelody(ctx: AudioContext, notes: TimedNote[], t0: number, volume = 0.16): Stop {
  const nodes: OscillatorNode[] = [];
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiToFreq(n.midi);
    const start = t0 + n.start;
    const end = t0 + n.end;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.02);
    gain.gain.setValueAtTime(volume, Math.max(start + 0.02, end - 0.06));
    gain.gain.linearRampToValueAtTime(0, end - 0.01);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
    nodes.push(osc);
  }
  return () => nodes.forEach((o) => {
    try {
      o.stop();
    } catch {
      /* already stopped */
    }
  });
}

/**
 * Metronome made of short filtered noise bursts: no stable pitch, so the voice
 * detector does not mistake it for singing. Every 4th click is accented.
 */
export function scheduleClicks(ctx: AudioContext, t0: number, count: number, secondsPerBeat: number, volume = 0.35): Stop {
  const length = Math.floor(ctx.sampleRate * 0.03);
  const noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
  const sources: AudioBufferSourceNode[] = [];
  for (let k = 0; k < count; k++) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2500;
    const gain = ctx.createGain();
    gain.gain.value = k % 4 === 0 ? volume : volume * 0.55;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t0 + k * secondsPerBeat);
    sources.push(src);
  }
  return () => sources.forEach((s) => {
    try {
      s.stop();
    } catch {
      /* already stopped */
    }
  });
}

export interface MicInput {
  stream: MediaStream;
  analyser: AnalyserNode;
  buffer: Float32Array;
  stop: () => void;
}

/** Opens the microphone for analysis only (never recorded nor sent). */
export async function openMic(ctx: AudioContext): Promise<MicInput> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {echoCancellation: true, noiseSuppression: false, autoGainControl: false},
  });
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser); // not connected to the speakers: no echo
  return {
    stream,
    analyser,
    buffer: new Float32Array(analyser.fftSize),
    stop: () => {
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

/** Reads the current frame, halving the rate (cheaper pitch search, still far above voice range). */
export function readFrame(mic: MicInput): {samples: Float32Array; sampleRate: number} {
  mic.analyser.getFloatTimeDomainData(mic.buffer);
  const half = new Float32Array(mic.buffer.length / 2);
  for (let i = 0; i < half.length; i++) half[i] = (mic.buffer[2 * i] + mic.buffer[2 * i + 1]) / 2;
  return {samples: half, sampleRate: mic.analyser.context.sampleRate / 2};
}

export function micErrorMessage(err: unknown): string {
  const name = (err as {name?: string})?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Accès au micro refusé. Autorise-le dans les réglages du navigateur, ou chante en mode libre (sans note).';
  if (name === 'NotFoundError') return 'Aucun micro détecté sur cet appareil. Tu peux chanter en mode libre (sans note).';
  return 'Le micro n’a pas pu démarrer. Tu peux chanter en mode libre (sans note).';
}
