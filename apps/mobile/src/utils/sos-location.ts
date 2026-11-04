// Akuisisi lokasi untuk layar Konfirmasi SOS Umum — pembungkus murni
// di atas getCurrentPosition (expo-location, minta izin foreground).
// Kontrak: izin diberikan -> ready + koordinat; ditolak/gagal ->
// unavailable + null. Tidak pernah mengarang koordinat, tidak pernah
// melempar: layar yang menampilkan state-lah yang memutuskan (tombol
// kirim tetap diblokir tanpa posisi, sama seperti SOS trip).
import type { GeoPoint } from "./geo";

export type SosPositionFetcher = () => Promise<GeoPoint | null>;

export type SosPositionResult =
  | { status: "ready"; position: GeoPoint }
  | { status: "unavailable"; position: null };

export async function acquireSosPosition(
  fetcher: SosPositionFetcher,
): Promise<SosPositionResult> {
  try {
    const position = await fetcher();
    if (!position) return { status: "unavailable", position: null };
    return { status: "ready", position };
  } catch {
    return { status: "unavailable", position: null };
  }
}
