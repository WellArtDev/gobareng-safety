// Pengiriman kode OTP lewat infrastruktur yang sudah ada.
// - Email: SMTP relay Brevo diutamakan (smtp.ts), fallback REST Brevo
//   (brevo.ts) — preferensi yang sama dengan notify-channels.ts.
// - SMS: REST API Brevo (brevo.ts).
// - WhatsApp: dispatch terpusat (whatsapp.ts) sesuai setting
//   whatsappProvider — official (template Meta Cloud API
//   berparameter, kode sebagai {{1}}) atau dikontak (payload
//   terverifikasi di dikontak.ts). Template diatur admin di
//   Pengaturan (otpWhatsappTemplate). Bila template BELUM
//   dikonfigurasi, kanal ini mengembalikan error eksplisit
//   WHATSAPP_TEMPLATE_NO_VARIABLE; TIDAK ADA fallback diam-diam ke
//   kanal lain maupun antar-penyedia. (Jalur Brevo yang lama memang
//   tidak bisa dipakai: endpoint Brevo /whatsapp/ sendMessage untuk
//   pesan template TIDAK punya field parameter, dicek ke
//   developers.brevo.com/docs/whatsapp-messages, 1 Nov 2026: hanya
//   templateId, senderNumber, contactNumbers — mengirim template
//   tanpa kode = user menerima pesan tanpa kode = perilaku palsu.)
// Fungsi ini mengembalikan hasil, bukan throw, supaya pemanggil bisa
// memetakan ke kode error API yang tepat.
import type { PlatformSettings } from "./db.js";
import { sendBrevoEmail, sendBrevoSms } from "./brevo.js";
import { sendSmtpEmail, smtpEmailConfigured } from "./smtp.js";
import { effectiveBrevoSenderEmail } from "./brevo.js";
import { sendWhatsappOtp, type WhatsappProvider } from "./whatsapp.js";

export type OtpChannel = "email" | "sms" | "whatsapp";

export interface OtpDeliveryResult {
  ok: boolean;
  errorCode?: string;
}

export async function sendOtpCode(
  channel: OtpChannel,
  destination: string,
  code: string,
  settings?: PlatformSettings,
): Promise<OtpDeliveryResult> {
  if (channel === "email") {
    const subject = "GoBareng: kode login kamu";
    const text =
      `Kode login GoBareng kamu: ${code}\n` +
      `Kode berlaku 5 menit. Jangan bagikan kode ini ke siapa pun.`;
    const senderEmail = effectiveBrevoSenderEmail(settings);
    const ok = smtpEmailConfigured(senderEmail)
      ? await sendSmtpEmail(destination, subject, text, senderEmail)
      : await sendBrevoEmail(destination, subject, text, fetch, settings);
    return ok ? { ok: true } : { ok: false, errorCode: "OTP_SEND_FAILED" };
  }
  if (channel === "sms") {
    const ok = await sendBrevoSms(
      destination,
      `Kode login GoBareng kamu: ${code}. Berlaku 5 menit.`,
      fetch,
      settings,
    );
    return ok ? { ok: true } : { ok: false, errorCode: "OTP_SEND_FAILED" };
  }
  // WhatsApp: lewat dispatch terpusat (whatsapp.ts) sesuai setting
  // whatsappProvider — official (Meta berparameter) atau dikontak.
  // Tanpa nama template yang diatur admin -> error eksplisit, bukan
  // fallback. Provider tidak terkonfigurasi / gagal kirim -> error
  // eksplisit penyedia itu (DIKONTAK_*), TANPA fallback ke official.
  const template = settings?.otpWhatsappTemplate?.trim() ?? "";
  if (!template) {
    return { ok: false, errorCode: "WHATSAPP_TEMPLATE_NO_VARIABLE" };
  }
  const provider: WhatsappProvider = settings?.whatsappProvider ?? "official";
  const result = await sendWhatsappOtp(destination, code, template, provider);
  return result.ok ? { ok: true } : { ok: false, errorCode: result.errorCode };
}
