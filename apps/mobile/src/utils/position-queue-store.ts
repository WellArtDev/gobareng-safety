// Penyimpanan antrean posisi — pola glimmer-store: native pakai
// expo-secure-store (terenkripsi OS), satu kunci JSON, gagal simpan
// tidak merusak layar (best-effort, antrean memori tetap jalan).
import * as SecureStore from "expo-secure-store";

import {
  PositionQueueStore,
  type PositionQueueStorage,
} from "./position-queue";

const QUEUE_KEY = "gobareng.positions.queue";

const secureStorage: PositionQueueStorage = {
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

export const positionQueueStore = new PositionQueueStore(secureStorage);
