// Síntesis de sonido con Web Audio API (cero dependencias de archivos de audio externos)

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

const VOLUME_KEY = 'agent-hub.volume';
export type Volume = 'low' | 'medium' | 'high';
const VOLUME_LEVELS: Record<Volume, number> = { low: 0.35, medium: 0.7, high: 1.4 };

export function getVolume(): Volume {
  const saved = localStorage.getItem(VOLUME_KEY);
  return saved === 'low' || saved === 'high' ? saved : 'medium';
}

export function setVolume(volume: Volume): void {
  localStorage.setItem(VOLUME_KEY, volume);
}

/** Un solo nodo de ganancia general: el volumen vale para todas las alertas. */
let master: GainNode | null = null;
function masterGain(ctx: AudioContext): GainNode {
  if (!master) {
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  master.gain.value = VOLUME_LEVELS[getVolume()];
  return master;
}

export function playCompleteChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.12); // E5

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now + 0.12);
    osc2.frequency.exponentialRampToValueAtTime(783.99, now + 0.28); // G5

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.08, now + 0.04);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(masterGain(ctx));

    osc1.start(now);
    osc1.stop(now + 0.2);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.5);
  } catch {}
}

export function playAttentionChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now); // A4
    osc.frequency.setValueAtTime(554.37, now + 0.15); // C#5

    gainNode.gain.setValueAtTime(0.06, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gainNode);
    gainNode.connect(masterGain(ctx));

    osc.start(now);
    osc.stop(now + 0.4);
  } catch {}
}
