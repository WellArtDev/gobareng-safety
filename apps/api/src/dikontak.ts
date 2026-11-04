// Pengiriman WhatsApp lewat Dikontak (produk WABA Shared) —
// PENYEDIA OPSIONAL, dipilih admin di Pengaturan (whatsappProvider).
// Default GoBareng tetap Official Meta Cloud API (whatsapp.ts);
// dikontak HANYA dipakai bila admin memilihnya, dan TIDAK PERNAH
// menjadi fallback diam-diam saat official gagal (atau sebaliknya).
//
// Endpoint kirim template (dokumentasi dikontak, bagian waba-shared):
//   POST https://dikontak.com/api/v3/waba/template
//   Authorization: Bearer <DIKONTAK_API_KEY dari env server>
// Kunci TIDAK PERNAH di-hardcode, di-log, atau ditulis ke repo —
// hanya dibaca dari env lewat config (getter, dibaca saat kirim).
//
// Payload OTP terverifikasi tes kirim langsung (3 Nov 2026,
// HTTP 200): template otp ternyata bertombol URL ("Salin Kode"),
// bukan copy/otp. Bentuk yang lolos validator dikontak:
//   body.variables: [kode]
//   buttons: [{ index: 0, type: "url", variable: kode }]
// Bentuk lain terbukti ditolak 422: type "copy" (validator hanya
// terima url/quick_reply/otp), type "otp" + code (button index 0
// adalah url), dan url + "variables" array (validator minta field
// singular "variable" string). JANGAN ubah bentuk ini tanpa tes
// kirim langsung lagi.
import { config } from "./config.js";

export const DIKONTAK_TEMPLATE_ENDPOINT = "https://dikontak.com/api/v3/waba/template";

export function dikontakConfigured(): boolean {
  return Boolean(config.dikontakApiKey);
}

// Normalisasi nomor tujuan ke format 628... yang diminta dikontak:
// buang semua non-digit, "0" di depan -> "62". Nomor yang sudah
// 62... dibiarkan. (Tidak ada normalisator 62... di codebase
// sebelumnya — normalizeIdentifier di otp.ts hanya membuang spasi/
// strip — jadi normalisasi ini dibuat di sini dan dites.)
export function normalizeDikontakPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

export interface DikontakButton {
  index: number;
  type: string;
  variable: string;
}

export interface DikontakSendResult {
  ok: boolean;
  status?: number;
  // Pesan error dari dikontak (atau "HTTP <status>") — diteruskan
  // ke log dispatch / error pengiriman, TANPA kunci di dalamnya.
  error?: string;
}

function dikontakErrorText(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const msg = (body as Record<string, unknown>).message
      ?? (body as Record<string, unknown>).error;
    if (typeof msg === "string" && msg) return `HTTP ${status}: ${msg}`;
  }
  return `HTTP ${status}`;
}

// Kirim satu template dikontak. `variables` diisi berurutan ke
// {{1}}, {{2}}, ...; `buttons` hanya dikirim bila ada (template
// sos_alert tidak punya tombol, jadi tanpa buttons sama sekali).
// Resolves dengan ok=false pada HTTP non-2xx / error jaringan —
// never throws — supaya pemanggil bisa memetakan ke error eksplisit.
export async function sendDikontakTemplate(
  toPhone: string,
  templateName: string,
  variables: string[],
  buttons?: DikontakButton[],
  fetchFn: typeof fetch = fetch,
): Promise<DikontakSendResult> {
  if (!dikontakConfigured()) {
    console.warn("[dikontak] DIKONTAK_API_KEY unset — skipping dikontak send");
    return { ok: false, error: "DIKONTAK_NOT_CONFIGURED" };
  }
  try {
    const res = await fetchFn(DIKONTAK_TEMPLATE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.dikontakApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: normalizeDikontakPhone(toPhone),
        template: { name: templateName, language: "id" },
        body: { variables },
        ...(buttons ? { buttons } : {}),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        parsed = null;
      }
      const error = dikontakErrorText(res.status, parsed);
      console.warn(`[dikontak] template send failed: ${error}`);
      return { ok: false, status: res.status, error };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    console.warn(`[dikontak] template send error: ${(e as Error).message}`);
    return { ok: false, error: (e as Error).message };
  }
}
