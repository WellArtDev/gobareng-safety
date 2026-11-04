// Layar AI-G Glimmer — asisten mode offline.
//
// BUKAN AI lokal: layar ini tidak pernah menjawab sendiri. Pertanyaan
// masuk antrean lokal (SecureStore, lihat glimmer-store.ts) dengan
// status mengantre/terkirim/gagal; saat koneksi kembali, antrean
// terkirim otomatis (flush di mount + setelah kirim) dalam urutan
// SOS-dulu. Jawaban yang datang lewat antrean offline ditandai
// "Dikirim saat offline". Gagal kirim = item tetap di antrean.
import * as Network from "expo-network";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";

import { useTranslation } from "@/i18n";
import { radii, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import { sendGlimmerMessage } from "@/utils/glimmer-api";
import {
  createGlimmerItem,
  type GlimmerQueueItem,
} from "@/utils/glimmer-queue";
import { glimmerQueueStore } from "@/utils/glimmer-store";
import {
  alertAccessibility,
  buttonAccessibility,
  headingAccessibility,
} from "@/utils/accessibility";

function statusLabelKey(item: GlimmerQueueItem): string {
  if (item.status === "sent") return "glimmer.statusSent";
  if (item.status === "failed") return "glimmer.statusFailed";
  return "glimmer.statusQueued";
}

export function GlimmerScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [items, setItems] = useState<GlimmerQueueItem[]>([]);
  const [draft, setDraft] = useState("");
  const [sosPriority, setSosPriority] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const refreshNetwork = useCallback(async (): Promise<boolean> => {
    try {
      const state = await Network.getNetworkStateAsync();
      const up = state.isConnected === true;
      setOnline(up);
      return up;
    } catch {
      setOnline(null);
      return false;
    }
  }, []);

  const flush = useCallback(async () => {
    try {
      const result = await glimmerQueueStore.flush(async (item) => {
        const res = await sendGlimmerMessage({
          clientMessageId: item.id,
          message: item.message,
          priority: item.priority,
        });
        return { answer: res.answer ?? "", model: res.model ?? "" };
      });
      setItems(result.queue);
      setErrorKey(null);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    }
  }, []);

  const load = useCallback(async () => {
    const [stored, up] = await Promise.all([
      glimmerQueueStore.load(),
      refreshNetwork(),
    ]);
    setItems(stored);
    // Koneksi kembali -> antrean terkirim otomatis.
    if (up) await flush();
  }, [flush, refreshNetwork]);

  useEffect(() => {
    load();
  }, [load]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || busy) return;
    setBusy(true);
    try {
      const up = await refreshNetwork();
      const item = createGlimmerItem({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        message,
        priority: sosPriority ? "sos" : "normal",
        queuedOffline: !up,
      });
      const next = await glimmerQueueStore.enqueue(item);
      setItems(next);
      setDraft("");
      setSosPriority(false);
      setErrorKey(null);
      if (up) await flush();
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, draft, flush, refreshNetwork, sosPriority]);

  const retry = useCallback(
    async (id: string) => {
      await glimmerQueueStore.retry(id);
      await flush();
    },
    [flush],
  );

  const remove = useCallback(async (id: string) => {
    setItems(await glimmerQueueStore.remove(id));
  }, []);

  return (
    <ScrollView style={styles.root}>
      <View style={styles.head} {...headingAccessibility(t("glimmer.title"))}>
        <Pressable onPress={() => router.back()} {...buttonAccessibility("Back")}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{t("glimmer.title")}</Text>
      </View>
      <Text style={styles.sub}>{t("glimmer.subtitle")}</Text>

      {online === false ? (
        <View style={styles.banner} {...alertAccessibility(t("glimmer.offlineNote"))}>
          <Text style={styles.bannerText}>{t("glimmer.offlineNote")}</Text>
        </View>
      ) : online === true ? (
        <View style={styles.bannerOk}>
          <Text style={styles.bannerOkText}>{t("glimmer.onlineNote")}</Text>
        </View>
      ) : null}

      <TextInput
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        placeholder={t("glimmer.placeholder")}
        multiline
      />
      <Pressable
        style={styles.priorityRow}
        onPress={() => setSosPriority((v) => !v)}
        {...buttonAccessibility(t("glimmer.sosPriority"))}
      >
        <Text style={styles.priorityBox}>{sosPriority ? "☑" : "☐"}</Text>
        <Text style={styles.priorityText}>{t("glimmer.sosPriority")}</Text>
      </Pressable>
      <Pressable
        style={[styles.btnSend, (!draft.trim() || busy) && styles.btnSendDisabled]}
        onPress={send}
        disabled={!draft.trim() || busy}
        {...buttonAccessibility(t("glimmer.send"))}
      >
        <Text style={styles.btnSendText}>
          {busy ? t("glimmer.sending") : t("glimmer.send")}
        </Text>
      </Pressable>
      {errorKey ? (
        <View style={styles.errBox} {...alertAccessibility(t(errorKey))}>
          <Text style={styles.errText}>{t(errorKey)}</Text>
        </View>
      ) : null}

      <Text style={styles.queueTitle}>{t("glimmer.queueTitle")}</Text>
      {items.length === 0 ? (
        <Text style={styles.empty}>{t("glimmer.empty")}</Text>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.question}>{item.message}</Text>
            <Text style={styles.status}>{t(statusLabelKey(item))}</Text>
            {item.priority === "sos" ? (
              <Text style={styles.sosTag}>{t("glimmer.sosPriority")}</Text>
            ) : null}
            {item.status === "sent" && item.answer ? (
              <View>
                <Text style={styles.answer}>{item.answer}</Text>
                {item.queuedOffline ? (
                  <Text style={styles.offlineBadge}>
                    {t("glimmer.sentOfflineBadge")}
                  </Text>
                ) : null}
                {item.model ? (
                  <Text style={styles.attribution}>
                    {t("glimmer.attribution")}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {item.status === "failed" ? (
              <View style={styles.rowActions}>
                <Pressable onPress={() => retry(item.id)} {...buttonAccessibility(t("glimmer.retry"))}>
                  <Text style={styles.action}>{t("glimmer.retry")}</Text>
                </Pressable>
                <Pressable onPress={() => remove(item.id)} {...buttonAccessibility(t("glimmer.remove"))}>
                  <Text style={styles.action}>{t("glimmer.remove")}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))
      )}
      <Text style={styles.note}>{t("glimmer.noLocalAiNote")}</Text>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, padding: 16 },
    head: { flexDirection: "row", alignItems: "center", gap: 8 },
    back: { color: c.text, fontSize: 28, fontWeight: "800" },
    title: { color: c.text, fontSize: 20, fontWeight: "800" },
    sub: { color: c.text2, fontSize: 13.5, marginTop: 6, lineHeight: 19 },
    banner: {
      backgroundColor: c.surface2,
      borderRadius: radii.md,
      padding: 12,
      marginTop: 12,
    },
    bannerText: { color: c.text, fontSize: 13.5, fontWeight: "700" },
    bannerOk: {
      backgroundColor: c.surface2,
      borderRadius: radii.md,
      padding: 12,
      marginTop: 12,
    },
    bannerOkText: { color: c.text2, fontSize: 13.5 },
    input: {
      color: c.text,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.md,
      padding: 12,
      marginTop: 12,
      minHeight: 72,
      textAlignVertical: "top",
    },
    priorityRow: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 6 },
    priorityBox: { color: c.text, fontSize: 16 },
    priorityText: { color: c.text2, fontSize: 13.5 },
    btnSend: {
      backgroundColor: c.text,
      borderRadius: radii.md,
      padding: 14,
      marginTop: 10,
      alignItems: "center",
    },
    btnSendDisabled: { opacity: 0.5 },
    btnSendText: { color: c.surface, fontSize: 15, fontWeight: "800" },
    errBox: {
      backgroundColor: c.surface2,
      borderRadius: radii.md,
      padding: 12,
      marginTop: 10,
    },
    errText: { color: c.text, fontSize: 13.5 },
    queueTitle: { color: c.text, fontSize: 16, fontWeight: "800", marginTop: 20 },
    empty: { color: c.text3, fontSize: 13.5, marginTop: 8 },
    card: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.md,
      padding: 12,
      marginTop: 10,
    },
    question: { color: c.text, fontSize: 14.5, fontWeight: "700" },
    status: { color: c.text3, fontSize: 12.5, marginTop: 4 },
    sosTag: { color: c.stSos, fontSize: 12.5, fontWeight: "800", marginTop: 2 },
    answer: { color: c.text, fontSize: 14, marginTop: 8, lineHeight: 20 },
    offlineBadge: { color: c.text2, fontSize: 12.5, fontWeight: "700", marginTop: 6 },
    attribution: { color: c.text3, fontSize: 12, marginTop: 4 },
    rowActions: { flexDirection: "row", gap: 16, marginTop: 8 },
    action: { color: c.text, fontSize: 13.5, fontWeight: "800" },
    note: { color: c.text3, fontSize: 12.5, marginTop: 16, marginBottom: 24 },
  });
