// Probe BUKAN tes: dijalankan sebagai proses anak oleh ai-qa.test.ts
// supaya import meta-chat memakai registry modul segar (mock.module
// dari file tes bocor ke file tes lain dalam satu run bun test).
// Env META_MODEL_API_* harus KOSONG di proses ini; output = satu
// baris JSON { status, code } dari percobaan metaChat.
import { metaChat } from "../meta-chat.js";

try {
  await metaChat("system", "user");
  console.log(JSON.stringify({ status: 0, code: "NO_THROW" }));
} catch (e) {
  const err = e as { code?: string; status?: number };
  console.log(JSON.stringify({ status: err.status ?? 0, code: err.code ?? "" }));
}
