// Config — dibaca HANYA dari env var, tidak pernah dari file .env yang di-commit.
// Config — read ONLY from env vars, never from a committed .env file.
import { randomUUID } from "node:crypto";

function required(name: string): string {
  const value = process.env[name];
  if (value) return value;
  // Kegagalan eksplisit saat boot — kecuali suite tes (bun test selalu
  // menyetel NODE_ENV=test), supaya tes unit/lokal tanpa env tidak mati.
  if (process.env.NODE_ENV === "test") {
    console.warn(`[api] ${name} unset — memakai ephemeral test-only (bukan production)`);
    return `test-only-${randomUUID()}`;
  }
  throw new Error(`Missing required env var: ${name}`);
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: process.env.DATABASE_URL ?? "",
  // A-6: kosong = adapter Socket.IO in-memory (single instance, tes
  // lokal); diset = Redis adapter aktif (wajib untuk multi-instance).
  // Peringatan tegas saat REDIS_URL kosong di luar tes: instance kedua
  // tidak melihat event realtime instance pertama (multi-instance/demo
  // butuh Redis; kartu A-6 terpisah). Tes tidak terpengaruh.
  redisUrl: (() => {
    const url = process.env.REDIS_URL ?? "";
    if (!url && process.env.NODE_ENV !== "test") {
      console.warn(
        "[api] REDIS_URL unset — Socket.IO in-memory saja: multi-instance/demo " +
          "tidak sinkron realtime. Set REDIS_URL untuk lintas instance.",
      );
    }
    return url;
  })(),
  jwtSecret: required("JWT_SECRET"),
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:8081")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  // Safety constants (locked in PRD): bystander radius + signal-loss threshold.
  bystanderRadiusKm: 2,
  signalLossMinutes: 10,
  // Brevo (provider sementara notifikasi, Wella 1 Nov 2026): email +
  // SMS + WhatsApp lewat satu REST API. Kosong = pengiriman dilewati
  // fail-soft (lihat brevo.ts); settings dashboard tetap bisa diubah.
  // WA SOS tetap lewat Meta Cloud API (whatsapp.ts), bukan Brevo.
  brevoApiKey: process.env.BREVO_API_KEY ?? "",
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL ?? "",
  brevoSenderName: process.env.BREVO_SENDER_NAME ?? "GoBareng",
  brevoSmsSender: process.env.BREVO_SMS_SENDER ?? "GoBareng",
  // WA Brevo: templateId numerik dari Campaigns > WhatsApp di akun
  // Brevo + nomor pengirim WA (dengan kode negara, tanpa +/spasi).
  brevoWhatsappTemplateId: Number(process.env.BREVO_WHATSAPP_TEMPLATE_ID ?? "") || 0,
  brevoWhatsappSenderNumber: process.env.BREVO_WHATSAPP_SENDER_NUMBER ?? "",
  // Email lewat SMTP relay Brevo (smtp.ts): host/port default adalah
  // relay publik Brevo; user + pass HANYA dari env VPS, tidak pernah
  // di-default atau ditulis di repo. Kalau SMTP di-set, email pakai
  // SMTP; kalau tidak, email fallback ke REST API (BREVO_API_KEY).
  brevoSmtpHost: process.env.BREVO_SMTP_HOST ?? "smtp-relay.brevo.com",
  brevoSmtpPort: Number(process.env.BREVO_SMTP_PORT ?? "") || 587,
  brevoSmtpUser: process.env.BREVO_SMTP_USER ?? "",
  brevoSmtpPass: process.env.BREVO_SMTP_PASS ?? "",
  // WhatsApp — OFFICIAL Business Cloud API only (see whatsapp.ts).
  // Optional: unset = WA sends are skipped (fail-soft), SOS still works.
  // GETTER, bukan snapshot (pola yang sama seperti adminEmail di
  // bawah): suite tes mengimpor config lewat file lain SEBELUM file
  // tes WA men-set env — snapshot membuat whatsappConfigured()
  // selamanya false dan semua tes jalur official gagal hanya saat
  // suite penuh dijalankan, padahal lolos saat standalone.
  get whatsappToken() {
    return process.env.WHATSAPP_TOKEN ?? "";
  },
  get whatsappPhoneNumberId() {
    return process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  },
  get whatsappTemplateSos() {
    return process.env.WHATSAPP_TEMPLATE_SOS ?? "sos_alert";
  },
  // Dikontak (WABA Shared) — penyedia WhatsApp OPSIONAL, dipilih
  // admin di Pengaturan (whatsappProvider). GETTER, bukan snapshot:
  // dibaca saat kirim supaya tes bisa men-set/unset env tanpa
  // re-import, dan supaya kunci tidak pernah tertulis di repo/log.
  // Kosong = pengiriman dikontak gagal eksplisit DIKONTAK_NOT_CONFIGURED.
  get dikontakApiKey() {
    return process.env.DIKONTAK_API_KEY ?? "";
  },
  // Meta Model API (Muse Spark Open via sponsor, OpenAI-compatible
  // chat-completions). Unset = AI features return AI_NOT_CONFIGURED
  // (fail-soft); safety pipeline never depends on AI being up.
  metaModelApiKey: process.env.META_MODEL_API_KEY ?? "",
  metaModelApiBase: process.env.META_MODEL_API_BASE ?? "",
  metaModelName: process.env.META_MODEL_NAME ?? "muse-spark-open",
  // Admin seed — dibaca HANYA dari env, tidak pernah dari file yang di-commit.
  // Kalau keduanya di-set dan email belum ada, satu akun admin dibuat saat boot.
  // Kosong = seed nonaktif (perilaku lama: registrasi tidak pernah membuat admin).
  // GETTER, bukan snapshot: suite tes mengimpor config lewat file lain
  // (mis. brevo.test) SEBELUM beforeAll api.test men-set env admin —
  // snapshot di import membuat seed admin tidak jalan dan semua tes
  // login admin gagal hanya saat suite penuh dijalankan. Getter dibaca
  // di ready() app.ts, setelah env di-set, jadi urutan file tidak masalah.
  get adminEmail() {
    return process.env.ADMIN_EMAIL ?? "";
  },
  get adminPassword() {
    return process.env.ADMIN_PASSWORD ?? "";
  },
  get adminName() {
    return process.env.ADMIN_NAME ?? "Admin";
  },
};
