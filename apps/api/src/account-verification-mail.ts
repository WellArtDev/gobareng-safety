// Pengirim email link verifikasi akun — infrastruktur yang sama dengan
// notifikasi email lain (SMTP relay Brevo diutamakan, fallback REST
// Brevo, pola notify-channels/otp-delivery). Modul tipis ini dipisah
// supaya tes bisa men-stub pengiriman tanpa menyentuh jaringan, dan
// supaya service tidak mengimpor SMTP/Brevo langsung.
// Mengembalikan false bila email tidak terkonfigurasi / gagal kirim —
// pemanggil TIDAK BOLEH menandai terverifikasi dalam kasus itu.
import { effectiveBrevoSenderEmail, sendBrevoEmail } from "./brevo.js";
import type { PlatformSettings } from "./db.js";
import { sendSmtpEmail, smtpEmailConfigured } from "./smtp.js";

export async function sendVerificationLinkEmail(
  toEmail: string,
  link: string,
  settings?: PlatformSettings,
): Promise<boolean> {
  const subject = "GoBareng: verifikasi email kamu";
  const text =
    `Klik link ini untuk memverifikasi email akun GoBareng kamu:\n${link}\n` +
    `Link berlaku 24 jam dan hanya bisa dipakai sekali. ` +
    `Kalau kamu tidak merasa meminta ini, abaikan email ini.`;
  const senderEmail = effectiveBrevoSenderEmail(settings);
  return smtpEmailConfigured(senderEmail)
    ? sendSmtpEmail(toEmail, subject, text, senderEmail)
    : sendBrevoEmail(toEmail, subject, text, fetch, settings);
}
