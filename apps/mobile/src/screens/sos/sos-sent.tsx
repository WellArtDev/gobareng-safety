// Layar SOS Terkirim — mockup data-screen="sos-sent": success ring
// merah + judul + body, kartu (alasan/status menunggu respons/dilihat
// oleh), ALAT BANTU DARURAT (sirine + flashlight morse — toggle UI;
// audio/flash native menyusul bersama perilaku M2 penuh), tombol merah
// kembali ke peta trip. "Dilihat oleh" = acknowledge SOS live §4.
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { SosTools } from "@/components/SosTools";
import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { reasonLabelKey, type SosReason } from "@/utils/sos-logic";
import { useAccessibilityAnnouncement } from "@/hooks/use-accessibility-announcement";
import {
  announcementAccessibility,
  buttonAccessibility,
  decorativeAccessibility,
  headingAccessibility,
} from "@/utils/accessibility";

const POLL_MS = 15000;

export function SosSentScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { tripId, reason } = useLocalSearchParams<{
    tripId: string;
    reason: SosReason;
  }>();
  const successMessage = `${t("sos.sent.title")}. ${t("sos.sent.body")}`;
  useAccessibilityAnnouncement(successMessage);

  // Placeholder polling acknowledge — daftar "dilihat oleh" menyusul
  // saat endpoint §4 mengembalikan acknowledgedBy (belum ada di API).
  const noop = useCallback(() => {}, []);
  useEffect(() => {
    const timer = setInterval(noop, POLL_MS);
    return () => clearInterval(timer);
  }, [noop]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.success}>
        {/* .ring.red */}
        <View style={styles.ring} {...decorativeAccessibility}>
          <Text style={styles.ringGlyph}>✓</Text>
        </View>
        <Text
          style={styles.title}
          {...headingAccessibility(t("sos.sent.title"))}
          {...announcementAccessibility(
            successMessage,
            "polite",
          )}
        >
          {t("sos.sent.title")}
        </Text>
        <Text style={styles.body} accessible={false}>
          {t("sos.sent.body")}
        </Text>

        {/* .card */}
        <View style={styles.card}>
          <View style={styles.kv}>
            <Text style={styles.k}>{t("sos.sent.reason")}</Text>
            <Text style={styles.v}>
              {reason ? t(reasonLabelKey(reason)) : "—"}
            </Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.k}>{t("sos.sent.status")}</Text>
            <View style={styles.pill}>
              <View style={styles.pdot} />
              <Text style={styles.pillText}>{t("sos.sent.waiting")}</Text>
            </View>
          </View>
        </View>

        {/* .sos-tools — sirine + flashlight morse NYATA (SosTools):
            sirine Web Audio; morse = overlay layar + torch kamera
            native (expo-camera enableTorch, pola ··· −−− ···). */}
        <SosTools />

        <Pressable
          style={({ pressed }) => [styles.btnMain, pressed && styles.btnPressed]}
          onPress={() =>
            tripId
              ? router.replace(`/trips/${tripId}/tracking`)
              : router.replace("/")
          }
          {...buttonAccessibility(t("sos.sent.backToMap"))}
        >
          <Text style={styles.btnMainText}>{t("sos.sent.backToMap")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 26 },
  // .success
  success: { alignItems: "center", paddingTop: 26, paddingBottom: 10 },
  // .ring.red 84px
  ring: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: c.errBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  ringGlyph: { fontSize: 40, fontWeight: "800", color: c.stSos },
  title: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: c.text,
    marginBottom: 8,
  },
  body: {
    fontSize: 13.5,
    color: c.text2,
    lineHeight: 13.5 * 1.6,
    maxWidth: 300,
    textAlign: "center",
    marginBottom: 16,
  },
  // .card
  card: {
    width: "100%",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    ...shadowCard,
  },
  kv: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 6,
  },
  k: { color: c.text2, fontWeight: "600", fontSize: 13 },
  v: { fontWeight: "700", fontSize: 13, color: c.text },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.errBg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  pdot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.stSosDark,
  },
  pillText: { fontSize: 11, fontWeight: "800", color: c.stSosDark },
  // .sos-tools
  tools: { width: "100%", marginBottom: 16 },
  toolsTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: c.text3,
    marginBottom: 9,
  },
  // .tool-btn
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.line,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 9,
    ...shadowCard,
  },
  toolBtnOn: { borderColor: c.stSos },
  tic: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: c.errBg,
    alignItems: "center",
    justifyContent: "center",
  },
  ticGlyph: { color: c.stSos, fontSize: 18, fontWeight: "800" },
  ttext: { flex: 1, minWidth: 0 },
  ttextTitle: { fontSize: 14, fontWeight: "800", color: c.text },
  ttextDesc: {
    fontSize: 12,
    color: c.text2,
    lineHeight: 12 * 1.45,
    marginTop: 2,
  },
  st: {
    backgroundColor: c.surface2,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: radii.pill,
  },
  stOn: { backgroundColor: c.stSos },
  stText: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: c.text3,
  },
  stTextOn: { color: "#fff" },
  // .btn-main merah
  btnMain: {
    width: "100%",
    backgroundColor: c.stSos,
    borderRadius: radii.md,
    paddingVertical: 15,
    paddingHorizontal: 18,
    alignItems: "center",
    shadowColor: c.stSos,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 6,
  },
  btnPressed: { transform: [{ scale: 0.985 }] },
  btnMainText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
