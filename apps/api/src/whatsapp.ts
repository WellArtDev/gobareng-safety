// WhatsApp sender — SATU dispatch terpusat untuk SEMUA pengiriman
// WA OTP + SOS. Jalur dipilih dari setting whatsappProvider:
//   "official" (DEFAULT) = Official WhatsApp Business Cloud API
//     (graph.facebook.com messages endpoint, template message).
//   "dikontak" = Dikontak WABA Shared (dikontak.ts).
// Aturan lama Wella (27 Okt 2026, "produksi hanya official API")
// tetap dihormati lewat default "official". Dikontak HANYA jalan
// bila admin memilihnya eksplisit di Pengaturan — TIDAK PERNAH ada
// fallback otomatis antar-penyedia: bila penyedia terpilih tidak
// terkonfigurasi / gagal, pengiriman gagal eksplisit, bukan pindah
// diam-diam ke penyedia lain. (Kanal notifikasi Brevo untuk
// regist/verify/checkin TIDAK lewat dispatch ini.)
//
// Fail-soft by design: if WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID
// is unset, sending is skipped with a log line and the caller continues.
// WA must NEVER break or delay the SOS flow or the in-app notification,
// so callers must fire this without awaiting it.
import { config } from "./config.js";
import { dikontakConfigured, sendDikontakTemplate } from "./dikontak.js";

export type WhatsappProvider = "official" | "dikontak";

export interface WhatsappSendResult {
  ok: boolean;
  // Kode error eksplisit untuk pemanggil (OTP: diteruskan ke respons
  // API; SOS: dicatat di log dispatch). Tidak pernah berisi kunci.
  errorCode?: string;
  // Detail error penyedia (mis. pesan validator dikontak) — untuk
  // log dispatch SOS; tidak dikirim ke klien sebagai teks bebas.
  detail?: string;
}

// Gate konfigurasi sesuai penyedia terpilih: official ikut token
// Meta, dikontak ikut DIKONTAK_API_KEY.
export function whatsappProviderConfigured(provider: WhatsappProvider): boolean {
  return provider === "dikontak" ? dikontakConfigured() : whatsappConfigured();
}

// OTP lewat penyedia terpilih. Template + kode berasal dari pemanggil
// (otp-delivery.ts sudah memastikan nama template terisi).
// Official: kode sebagai {{1}} (perilaku lama, tidak diubah).
// Dikontak: payload terverifikasi (dikontak.ts) — variables [kode]
// + tombol url singular variable kode.
export async function sendWhatsappOtp(
  toPhone: string,
  code: string,
  template: string,
  provider: WhatsappProvider,
  fetchFn: typeof fetch = fetch,
): Promise<WhatsappSendResult> {
  if (provider === "dikontak") {
    if (!dikontakConfigured()) {
      return { ok: false, errorCode: "DIKONTAK_NOT_CONFIGURED" };
    }
    const res = await sendDikontakTemplate(
      toPhone,
      template,
      [code],
      [{ index: 0, type: "url", variable: code }],
      fetchFn,
    );
    return res.ok
      ? { ok: true }
      : { ok: false, errorCode: "DIKONTAK_SEND_FAILED", detail: res.error };
  }
  const ok = await sendWhatsappTemplate(toPhone, template, [code], fetchFn);
  return ok ? { ok: true } : { ok: false, errorCode: "OTP_SEND_FAILED" };
}

// SOS lewat penyedia terpilih. Official: template tanpa parameter
// (perilaku lama, tidak diubah). Dikontak: template sos_alert dengan
// 3 variabel [namaPengirim, alasan, linkLokasi] dan TANPA buttons
// (template sos_alert memang tidak punya tombol). Nama template SOS
// diambil dari env WHATSAPP_TEMPLATE_SOS yang sama untuk kedua
// penyedia (default "sos_alert") — admin yang memakai nama template
// dikontak berbeda tinggal mengubah env itu saat deploy.
export async function sendWhatsappSosAlert(
  toPhone: string,
  provider: WhatsappProvider,
  ctx: { senderName: string; reason: string; lat: number; lon: number },
  fetchFn: typeof fetch = fetch,
): Promise<WhatsappSendResult> {
  if (provider === "dikontak") {
    if (!dikontakConfigured()) {
      return { ok: false, errorCode: "DIKONTAK_NOT_CONFIGURED" };
    }
    const link = `https://maps.google.com/?q=${ctx.lat},${ctx.lon}`;
    const res = await sendDikontakTemplate(
      toPhone,
      config.whatsappTemplateSos,
      [ctx.senderName, ctx.reason, link],
      undefined,
      fetchFn,
    );
    return res.ok
      ? { ok: true }
      : { ok: false, errorCode: "DIKONTAK_SEND_FAILED", detail: res.error };
  }
  const ok = await sendWhatsappTemplate(toPhone, config.whatsappTemplateSos, [], fetchFn);
  return ok
    ? { ok: true }
    : { ok: false, errorCode: "WHATSAPP_SEND_FAILED", detail: "cloud-api-send-failed" };
}

export function whatsappConfigured(): boolean {
  return Boolean(config.whatsappToken && config.whatsappPhoneNumberId);
}

// Satu pengirim template Meta untuk semua pemakaian (SOS + OTP):
// template berparameter {{1}}, {{2}}, ... diisi dari `params` secara
// berurutan. Resolves true pada API 2xx, false bila tidak — never throws.
// `fetchFn` di-inject supaya tes bisa memakai stub tanpa jaringan.
export async function sendWhatsappTemplate(
  toPhone: string,
  templateName: string,
  params: string[],
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  if (!whatsappConfigured()) {
    console.warn("[whatsapp] WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID unset — skipping WA send");
    return false;
  }
  try {
    const res = await fetchFn(
      `https://graph.facebook.com/v21.0/${config.whatsappPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.whatsappToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toPhone,
          type: "template",
          template: {
            name: templateName,
            language: { code: "id_ID" },
            ...(params.length > 0
              ? {
                  components: [
                    {
                      type: "body",
                      parameters: params.map((text) => ({ type: "text", text })),
                    },
                  ],
                }
              : {}),
          },
        }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) {
      console.warn(`[whatsapp] Cloud API send failed: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[whatsapp] Cloud API send error: ${(e as Error).message}`);
    return false;
  }
}

// Sends one template SOS alert to one recipient phone number (E.164,
// e.g. 62812...). The template must be approved in the Meta app and is
// sent WITHOUT body parameters, so the template itself must not require
// variables. Resolves to true on API 2xx, false otherwise — never throws.
export async function sendSosWhatsapp(toPhone: string): Promise<boolean> {
  return sendWhatsappTemplate(toPhone, config.whatsappTemplateSos, []);
}
