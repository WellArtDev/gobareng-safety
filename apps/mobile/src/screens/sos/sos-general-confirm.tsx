// Layar Konfirmasi SOS Umum — GPS saat ini (fail-soft); tanpa posisi
// valid SOS TIDAK dikirim (kontrak lat/lon, sama seperti SOS trip).
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useTranslation } from "@/i18n";
import { radii, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import { createHoldToConfirm, holdProgress } from "@/utils/hold-to-confirm";
import { getCurrentPosition, type GeoPoint } from "@/utils/geo";
import { acquireSosPosition } from "@/utils/sos-location";
import { getSessionName } from "@/utils/session-token";
import { triggerGeneralSos } from "@/utils/sos-api";
import {
  generalReasonLabelKey,
  type GeneralSosReason,
} from "@/utils/sos-logic";
import {
  buttonAccessibility,
  decorativeAccessibility,
  headingAccessibility,
} from "@/utils/accessibility";

export function SosGeneralConfirmScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { reason } = useLocalSearchParams<{ reason: GeneralSosReason }>();
  const [position, setPosition] = useState<GeoPoint | null>(null);
  // Lokasi diminta eksplisit saat layar dibuka DAN bisa diminta ulang
  // lewat tombol: permintaan sekali-jalan di mount saja tidak cukup —
  // GPS lambat / izin ditolak langsung tampil "belum tersedia" selamanya
  // tanpa jalan untuk memicu dialog izin lagi.
  const [locState, setLocState] = useState<
    "locating" | "ready" | "unavailable"
  >("locating");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const hold = useRef(createHoldToConfirm());
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartedAt = useRef(0);

  // Minta izin lokasi foreground + ambil posisi saat ini (pola yang
  // sama seperti Voice SOS). Ditolak/gagal -> unavailable yang jujur;
  // kirim tetap diblokir tanpa posisi (kontrak lat/lon, tanpa koordinat
  // karangan). Dipakai di mount dan di tombol minta-ulang.
  const acquireLocation = useCallback(async () => {
    setLocState("locating");
    const out = await acquireSosPosition(getCurrentPosition);
    setPosition(out.position);
    setLocState(out.status);
  }, []);

  useEffect(() => {
    void acquireLocation();
    return () => {
      hold.current.release();
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, [acquireLocation]);

  const stopProgress = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  };

  // Tekan-tahan 3 detik (Wella 3 Nov 2026, menggantikan double-confirm):
  // lepas sebelum 3 detik = batal, tidak terkirim.
  const startHold = () => {
    if (sending || hold.current.isHolding()) return;
    holdStartedAt.current = Date.now();
    setHolding(true);
    setProgress(0);
    hold.current.press(() => {
      stopProgress();
      setHolding(false);
      setProgress(1);
      void sendNow();
    });
    progressTimer.current = setInterval(() => {
      setProgress(
        holdProgress(Date.now() - holdStartedAt.current),
      );
    }, 50);
  };

  const endHold = () => {
    if (hold.current.hasFired()) return;
    hold.current.release();
    stopProgress();
    setHolding(false);
    setProgress(0);
  };

  const sendNow = async () => {
    if (!reason || sending) return;
    if (!position) {
      setErrorKey("sos.general.noLocation");
      return;
    }
    setSending(true);
    try {
      const { sos } = await triggerGeneralSos({
        reason,
        lat: position.lat,
        lon: position.lon,
      });
      router.replace({
        pathname: "/sos-general-detail",
        params: { id: sos.id },
      });
    } catch (error) {
      setErrorKey(
        error instanceof ApiError
          ? error.i18nKey
          : "sos.general.errors.invalidLocation",
      );
      setSending(false);
    }
  };

  const reasonLabel = reason ? t(generalReasonLabelKey(reason)) : "";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          {...buttonAccessibility(t("sos.general.confirm.backLabel"))}
        >
          <Text style={styles.backGlyph} {...decorativeAccessibility}>‹</Text>
        </Pressable>
        <Text style={styles.headTitle} {...headingAccessibility(t("sos.general.confirm.title"))}>
          {t("sos.general.confirm.title")}
        </Text>
      </View>

      <View style={styles.body}>
        {errorKey ? (
          <View style={styles.errBox}>
            <Text style={styles.errText}>{t(errorKey)}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>{t("sos.general.confirm.reasonLabel")}</Text>
        <Text style={styles.value}>{reasonLabel}</Text>

        <Text style={styles.label}>{t("sos.general.confirm.sender")}</Text>
        <Text style={styles.value}>{getSessionName() ?? "-"}</Text>

        <Text style={styles.label}>{t("sos.general.confirm.location")}</Text>
        <Text style={styles.value}>
          {locState === "locating"
            ? t("sos.general.confirm.locating")
            : position
              ? `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}`
              : t("sos.general.confirm.locationUnknown")}
        </Text>
        {locState === "unavailable" ? (
          <Pressable
            style={styles.locRetry}
            onPress={() => void acquireLocation()}
            {...buttonAccessibility(t("sos.general.confirm.requestLocation"))}
          >
            <Text style={styles.locRetryText}>
              📍 {t("sos.general.confirm.requestLocation")}
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.label}>{t("sos.general.confirm.sentTo")}</Text>
        <Text style={styles.value}>{t("sos.general.confirm.sentToValue")}</Text>

        <Text style={styles.note}>{t("sos.general.confirm.note")}</Text>

        <Text style={styles.holdHint}>
          {t("sos.general.confirm.holdHint")}
        </Text>

        <Pressable
          style={[
            styles.btnSend,
            sending && styles.btnSendDisabled,
            holding && styles.btnSendHolding,
          ]}
          onPressIn={startHold}
          onPressOut={endHold}
          disabled={sending}
          {...buttonAccessibility(t("sos.general.confirm.send"), {
            disabled: sending,
          })}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnSendText}>
              {t("sos.general.confirm.send")}
            </Text>
          )}
        </Pressable>

        <View style={styles.progressTrack} {...decorativeAccessibility}>
          <View
            style={[styles.progressFill, { width: `${progress * 100}%` }]}
          />
        </View>

        <Pressable
          style={styles.btnCancel}
          onPress={() => router.back()}
          {...buttonAccessibility(t("sos.general.confirm.changeReason"))}
        >
          <Text style={styles.btnCancelText}>
            {t("sos.general.confirm.changeReason")}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { paddingBottom: 26 },
    head: {
      backgroundColor: c.stSosDark,
      paddingTop: 16,
      paddingHorizontal: 20,
      paddingBottom: 20,
    },
    back: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: "rgba(255,255,255,.16)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    backGlyph: { fontSize: 24, fontWeight: "700", color: "#fff" },
    headTitle: {
      fontSize: 21,
      fontWeight: "800",
      letterSpacing: -0.21,
      color: "#fff",
    },
    body: { paddingTop: 16, paddingHorizontal: 20 },
    errBox: {
      backgroundColor: c.errBg,
      borderRadius: radii.md,
      paddingVertical: 11,
      paddingHorizontal: 14,
      marginBottom: 12,
    },
    errText: { color: c.stSosDark, fontSize: 13, fontWeight: "700" },
    label: {
      color: c.text3,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.5,
      marginTop: 14,
    },
    value: { color: c.text, fontSize: 15, fontWeight: "700", marginTop: 4 },
    // Tombol minta-ulang lokasi: memicu lagi dialog izin sistem bila
    // izin belum diputuskan, atau ambil ulang posisi bila sudah diizinkan.
    locRetry: { marginTop: 8, alignSelf: "flex-start" },
    locRetryText: { fontSize: 13, fontWeight: "800", color: c.primary },
    note: {
      color: c.text2,
      fontSize: 13,
      lineHeight: 13 * 1.55,
      marginTop: 16,
    },
    btnSend: {
      width: "100%",
      backgroundColor: c.stSos,
      borderRadius: radii.md,
      padding: 16,
      marginTop: 20,
      alignItems: "center",
    },
    btnSendDisabled: { opacity: 0.6 },
    btnSendHolding: { backgroundColor: c.stSosDark },
    holdHint: {
      color: c.stSosDark,
      fontSize: 13,
      fontWeight: "800",
      marginTop: 16,
      textAlign: "center",
    },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.text3,
      opacity: 0.25,
      marginTop: 12,
      overflow: "hidden",
    },
    progressFill: { height: 6, backgroundColor: c.stSosDark },
    btnSendText: { color: "#fff", fontSize: 15.5, fontWeight: "800" },
    btnCancel: { width: "100%", alignItems: "center", padding: 13, marginTop: 6 },
    btnCancelText: { color: c.text2, fontSize: 14, fontWeight: "700" },
  });
