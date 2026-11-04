// Sirine SOS — Web Audio API, tanpa aset audio.
// SOS siren — Web Audio API, no audio asset.
//
// Kenapa tanpa expo-av: sirine dari file audio adalah aset biner, dan
// push snapshot hanya menerima file UTF-8 — jadi tidak ada file audio
// yang bisa ikut di commit ini. Di web, sirine disintesis langsung
// dengan osilator; di native, modul ini no-op (sirine native + torch
// menyusul lewat dev build, lihat README M2).
// Why no expo-av: a siren from an audio file is a binary asset, and
// snapshot pushes only accept UTF-8 files — so no audio file can ship
// in this commit. On web, the siren is synthesized live with an
// oscillator; on native, this module is a no-op (native siren + torch
// follow via a dev build, see the M2 README section).
//
// Sirine harus dimulai dari dalam handler gestur (tombol tahan) supaya
// AudioContext web tidak terkunci. / The siren must start inside a
// gesture handler (the hold button) so the web AudioContext is not
// locked.

type GainNodeLike = {
  connect: (destination: unknown) => void;
  gain: { value: number };
};

type OscillatorNodeLike = {
  connect: (destination: GainNodeLike) => void;
  frequency: { value: number };
  start: () => void;
  stop: () => void;
};

type AudioContextLike = {
  close: () => Promise<void>;
  createGain: () => GainNodeLike;
  createOscillator: () => OscillatorNodeLike;
  destination: unknown;
  resume: () => Promise<void>;
};

type AudioContextConstructor = new () => AudioContextLike;

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const candidate = (
    window as unknown as Record<string, unknown>
  )["AudioContext"];
  if (typeof candidate !== "function") {
    return null;
  }
  return candidate as unknown as AudioContextConstructor;
}

export function isSirenSupported(): boolean {
  return getAudioContextConstructor() !== null;
}

// Nada sirine bolak-balik 700 <-> 1000 Hz tiap 400 ms.
// Siren tone alternating 700 <-> 1000 Hz every 400 ms.
const TONE_LOW = 700;
const TONE_HIGH = 1000;
const TONE_STEP_MS = 400;

let context: AudioContextLike | null = null;
let oscillator: OscillatorNodeLike | null = null;
let gain: GainNodeLike | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let high = false;

export function startSiren(): void {
  const Constructor = getAudioContextConstructor();
  if (Constructor === null || context !== null) {
    return;
  }
  try {
    context = new Constructor();
    gain = context.createGain();
    gain.gain.value = 0.15;
    gain.connect(context.destination);
    oscillator = context.createOscillator();
    oscillator.connect(gain);
    oscillator.frequency.value = TONE_LOW;
    oscillator.start();
    void context.resume().catch(() => {
      // Konteks terkunci (di luar gestur) -> sirine diam, morse visual
      // tetap jalan. / Locked context (outside a gesture) -> siren
      // stays silent, visual morse still runs.
    });
    timer = setInterval(() => {
      if (oscillator === null) {
        return;
      }
      high = !high;
      oscillator.frequency.value = high ? TONE_HIGH : TONE_LOW;
    }, TONE_STEP_MS);
  } catch {
    stopSiren();
  }
}

export function stopSiren(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  try {
    oscillator?.stop();
  } catch {
    // Sudah berhenti. / Already stopped.
  }
  oscillator = null;
  gain = null;
  if (context !== null) {
    void context.close().catch(() => {
      // Abaikan. / Ignore.
    });
    context = null;
  }
  high = false;
}
