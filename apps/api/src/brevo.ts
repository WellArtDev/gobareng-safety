// Brevo sender — provider SEMENTARA notifikasi (Wella 1 Nov 2026).
// Satu REST API (https://api.brevo.com/v3) untuk email, SMS, dan
// WhatsApp (Brevo adalah WhatsApp Business Solution Provider; ini
// bukan gateway tidak resmi). Fail-soft by design, sama seperti
// whatsapp.ts: kunci tidak di-set = kirim dilewati, caller lanjut.
// Fungsi-fungsi di sini TIDAK PERNAH throw; hasilnya boolean.
// WA SOS tetap lewat Meta Cloud API (whatsapp.ts) — Brevo WA dipakai
// untuk event non-SOS (registrasi, verifikasi, check-in) dan hanya
// kalau BREVO_WHATSAPP_TEMPLATE_ID (template yang sudah disetujui)
// + BREVO_WHATSAPP_SENDER_NUMBER di-set. SMS butuh sender yang
// terdaftar di Brevo.
import { config } from "./config.js";
import type { PlatformSettings } from "./db.js";

const BREVO_API = "https://api.brevo.com/v3";

// Nilai efektif: setting dashboard (teks) diutamakan kalau terisi,
// kalau kosong fallback ke env VPS. Ini yang membuat settingan
// WhatsApp Brevo di Pengaturan benar-benar dipakai pengiriman,
// bukan sekadar tersimpan.
export function effectiveBrevoSenderEmail(settings?: PlatformSettings): string {
  return settings?.brevoSenderEmail || config.brevoSenderEmail;
}
export function effectiveBrevoSmsSender(settings?: PlatformSettings): string {
  return settings?.brevoSmsSender || config.brevoSmsSender;
}
export function effectiveBrevoWhatsappSenderNumber(settings?: PlatformSettings): string {
  return settings?.brevoWhatsappSenderNumber || config.brevoWhatsappSenderNumber;
}
export function effectiveBrevoWhatsappTemplateId(settings?: PlatformSettings): number {
  const fromSettings = Number(settings?.brevoWhatsappTemplateId ?? "") || 0;
  return fromSettings || config.brevoWhatsappTemplateId;
}

export function brevoConfigured(): boolean {
  return Boolean(config.brevoApiKey);
}

export function brevoEmailConfigured(settings?: PlatformSettings): boolean {
  return Boolean(config.brevoApiKey && effectiveBrevoSenderEmail(settings));
}

export function brevoSmsConfigured(settings?: PlatformSettings): boolean {
  return Boolean(config.brevoApiKey && effectiveBrevoSmsSender(settings));
}

export function brevoWhatsappConfigured(settings?: PlatformSettings): boolean {
  return Boolean(
    config.brevoApiKey &&
      effectiveBrevoWhatsappTemplateId(settings) &&
      effectiveBrevoWhatsappSenderNumber(settings),
  );
}

type FetchFn = typeof fetch;

async function brevoPost(
  path: string,
  body: unknown,
  fetchFn: FetchFn,
): Promise<boolean> {
  try {
    const res = await fetchFn(`${BREVO_API}${path}`, {
      method: "POST",
      headers: {
        "api-key": config.brevoApiKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[brevo] send failed: HTTP ${res.status} on ${path}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[brevo] send error on ${path}: ${(e as Error).message}`);
    return false;
  }
}

export async function sendBrevoEmail(
  toEmail: string,
  subject: string,
  textContent: string,
  fetchFn: FetchFn = fetch,
  settings?: PlatformSettings,
): Promise<boolean> {
  if (!brevoEmailConfigured(settings)) return false;
  return brevoPost(
    "/smtp/email",
    {
      sender: { email: effectiveBrevoSenderEmail(settings), name: config.brevoSenderName },
      to: [{ email: toEmail }],
      subject,
      textContent,
    },
    fetchFn,
  );
}

export async function sendBrevoSms(
  toPhone: string,
  content: string,
  fetchFn: FetchFn = fetch,
  settings?: PlatformSettings,
): Promise<boolean> {
  if (!brevoSmsConfigured(settings)) return false;
  return brevoPost(
    "/transactionalSMS/sms",
    { sender: effectiveBrevoSmsSender(settings), recipient: toPhone, content },
    fetchFn,
  );
}

export async function sendBrevoWhatsapp(
  toPhone: string,
  fetchFn: FetchFn = fetch,
  settings?: PlatformSettings,
): Promise<boolean> {
  if (!brevoWhatsappConfigured(settings)) return false;
  // Payload sesuai dokumen Brevo (developers.brevo.com/docs/
  // whatsapp-messages): templateId numerik + contactNumbers array.
  return brevoPost(
    "/whatsapp/sendMessage",
    {
      senderNumber: effectiveBrevoWhatsappSenderNumber(settings),
      contactNumbers: [toPhone],
      templateId: effectiveBrevoWhatsappTemplateId(settings),
    },
    fetchFn,
  );
}
