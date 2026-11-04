// Penyimpanan antrean Glimmer — pola auth-store: native pakai
// expo-secure-store (terenkripsi OS), satu kunci JSON, gagal simpan
// tidak merusak layar (best-effort, antrean memori tetap jalan).
import * as SecureStore from "expo-secure-store";

import {
  GlimmerQueueStore,
  type GlimmerStorage,
} from "./glimmer-queue";

const QUEUE_KEY = "gobareng.glimmer.queue";

const secureStorage: GlimmerStorage = {
  async load() {
    try {
      return await SecureStore.getItemAsync(QUEUE_KEY);
    } catch {
      return null;
    }
  },
  async save(serialized: string) {
    await SecureStore.setItemAsync(QUEUE_KEY, serialized);
  },
};

export const glimmerQueueStore = new GlimmerQueueStore(secureStorage);
