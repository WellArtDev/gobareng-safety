// Pengiriman kanal notifikasi per event (matriks Pengaturan).
// Master notifVerify/notifCheckin mengontrol feed dashboard (kode
// lama, tidak diubah); fungsi di sini mengontrol kanal TAMBAHAN.
// - verify/checkin: kanal jalan hanya kalau master-nya aktif.
// - regist/sos: tidak ada master, kunci kanal saja yang berlaku.
// Semua pengiriman fail-soft dan tidak pernah throw; caller memakai
// fire-and-forget (void ...) supaya notifikasi tidak menunda respons
// utama (registrasi, check-in, SOS).
import type { PlatformSettings } from "./db.js";
import {
  effectiveBrevoSenderEmail,
  sendBrevoEmail,
  sendBrevoSms,
  sendBrevoWhatsapp,
} from "./brevo.js";
import { sendSmtpEmail, smtpEmailConfigured } from "./smtp.js";

export type NotifEvent = "regist" | "sos" | "verify" | "checkin";
export type NotifChannel = "email" | "whatsapp" | "sms";

const MASTER: Partial<Record<NotifEvent, keyof PlatformSettings>> = {
  verify: "notifVerify",
  checkin: "notifCheckin",
};

const KEY: Record<NotifEvent, Record<NotifChannel, keyof PlatformSettings>> = {
  regist: {
    email: "notifRegistEmail",
    whatsapp: "notifRegistWhatsapp",
    sms: "notifRegistSms",
  },
  sos: {
    email: "notifSosEmail",
    whatsapp: "notifSosWhatsapp",
    sms: "notifSosSms",
  },
  verify: {
    email: "notifVerifyEmail",
    whatsapp: "notifVerifyWhatsapp",
    sms: "notifVerifySms",
  },
  checkin: {
    email: "notifCheckinEmail",
    whatsapp: "notifCheckinWhatsapp",
    sms: "notifCheckinSms",
  },
};

export function channelEnabled(
  settings: PlatformSettings,
  event: NotifEvent,
  channel: NotifChannel,
): boolean {
  const master = MASTER[event];
  if (master && !settings[master]) return false;
  // Kunci matriks selalu boolean; cast karena PlatformSettings kini
  // juga memuat field teks Brevo.
  return settings[KEY[event][channel]] as boolean;
}

export async function dispatchNotificationChannels(
  settings: PlatformSettings,
  event: NotifEvent,
  opts: {
    subject: string;
    message: string;
    emails?: string[];
    phones?: string[];
    // SOS: WA sudah dikirim Meta Cloud API (whatsapp.ts) — jangan
    // kirim WA kedua lewat Brevo untuk event ini.
    skipWhatsapp?: boolean;
  },
): Promise<void> {
  const jobs: Promise<boolean>[] = [];
  // SOS darurat = SMS + WhatsApp saja (Wella 1 Nov 2026): email
  // tidak dipakai untuk SOS, apa pun nilai lama notifSosEmail.
  if (event !== "sos" && channelEnabled(settings, event, "email")) {
    // Email: SMTP relay diutamakan kalau di-set, kalau tidak pakai
    // REST API Brevo. Keduanya fail-soft (tidak ada kunci = false).
    // Email pengirim ikut setting dashboard kalau terisi.
    const senderEmail = effectiveBrevoSenderEmail(settings);
    const viaSmtp = smtpEmailConfigured(senderEmail);
    for (const email of opts.emails ?? []) {
      jobs.push(
        viaSmtp
          ? sendSmtpEmail(email, opts.subject, opts.message, senderEmail)
          : sendBrevoEmail(email, opts.subject, opts.message, fetch, settings),
      );
    }
  }
  if (!opts.skipWhatsapp && channelEnabled(settings, event, "whatsapp")) {
    for (const phone of opts.phones ?? []) {
      jobs.push(sendBrevoWhatsapp(phone, fetch, settings));
    }
  }
  if (channelEnabled(settings, event, "sms")) {
    for (const phone of opts.phones ?? []) {
      jobs.push(sendBrevoSms(phone, opts.message, fetch, settings));
    }
  }
  await Promise.allSettled(jobs);
}
