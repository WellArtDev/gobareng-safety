// Sinyal morse SOS (··· −−− ···) — penjadwal murni, dites unit.
// Pola: titik 200 ms, strip 600 ms, jeda dalam huruf 200 ms, jeda antar
// huruf 600 ms, jeda kata 1400 ms, lalu ulang. Callback yang sama
// menggerakkan overlay layar (web) ATAU torch kamera (native,
// expo-camera enableTorch) — lihat sos-tools.ts.
const DOT_MS = 200;
const DASH_MS = 600;
const INTRA_GAP_MS = 200;
const LETTER_GAP_MS = 600;
const WORD_GAP_MS = 1400;

export type MorseSegment = { on: boolean; ms: number };

export function buildSosCycle(): MorseSegment[] {
  const segments: MorseSegment[] = [];
  const letter = (marks: Array<"dot" | "dash">) => {
    for (const mark of marks) {
      segments.push({ on: true, ms: mark === "dot" ? DOT_MS : DASH_MS });
      segments.push({ on: false, ms: INTRA_GAP_MS });
    }
    const last = segments[segments.length - 1];
    if (last) last.ms = LETTER_GAP_MS;
  };
  letter(["dot", "dot", "dot"]);
  letter(["dash", "dash", "dash"]);
  letter(["dot", "dot", "dot"]);
  const last = segments[segments.length - 1];
  if (last) last.ms = WORD_GAP_MS;
  return segments;
}

// Jalankan siklus morse berulang; kembalikan fungsi stop (mematikan
// flash lewat onFlash(false)).
export function startMorseFlash(onFlash: (on: boolean) => void): () => void {
  const segments = buildSosCycle();
  let index = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const step = () => {
    if (stopped) return;
    const segment = segments[index];
    if (!segment) return;
    onFlash(segment.on);
    index = (index + 1) % segments.length;
    timer = setTimeout(step, segment.ms);
  };
  step();

  return () => {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    onFlash(false);
  };
}
