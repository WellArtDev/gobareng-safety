// Batas rekam/transkripsi SOS suara — modul murni supaya bisa dites
// unit tanpa import expo-audio. Satu sumber kebenaran untuk layar.
export const MAX_RECORD_MS = 120_000;
export const MAX_AUDIO_BASE64_LEN = 4_000_000;
export const TRANSCRIBE_TIMEOUT_MS = 60_000;
