// Layar Konfirmasi SOS — mockup data-screen="sos-confirm": appbar back,
// sos-summary (ALASAN SOS besar + kv pengirim/lokasi/dikirim ke),
// catatan merah berkedip, Kirim SOS sekarang, Ganti alasan.
// Kirim: ambil posisi (fail-soft null -> 0,0 TIDAK dipakai; pakai
// koordinat terakhir yang ada atau titik kumpul trip), POST §4.
import { useEffect, useState } from "react";
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
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import { getCurrentPosition, type GeoPoint } from "@/utils/geo";
import { getSessionName } from "@/utils/session-token";
import { triggerSos } from "@/utils/sos-api";
import { reasonLabelKey, type SosReason } from "@/utils/sos-logic";
import { fetchTrip, type Trip } from "@/utils/trips-api";
import { useAccessibilityAnnouncement } from "@/hooks/use-accessibility-announcement";
import {
  alertAccessibility,
  buttonAccessibility,
  decorativeAccessibility,
  headingAccessibility,
} from "@/utils/accessibility";

export function SosConfirmScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { tripId, reason } = useLocalSearchParams<{
    tripId: string;
    reason: SosReason;
  }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [position, setPosition] = useState<GeoPoint | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (tripId) {
      fetchTrip(tripId).then(setTrip).catch(() => {});
    }
    getCurrentPosition().then(setPosition);
  }, [tripId]);

  const send = async () => {
    if (!tripId || !reason || sending) return;
    // Posisi: GPS saat ini; fallback titik kumpul trip. Tanpa keduanya
    // SOS tetap dikirim dengan 0,0? TIDAK — kontrak §4 wajib lat/lon;
    // titik kumpul selalu ada sebagai anchor terakhir.
    const point: GeoPoint | null =
      position ??
      (trip && trip.meetingLat !== null && trip.meetingLon !== null
        ? { lat: trip.meetingLat, lon: trip.meetingLon }
        : null);
    if (!point) {
      setErrorKey("sos.confirm.locationUnknown");
      return;
    }
    setSending(true);
    try {
      const sos = await triggerSos(tripId, {
        reason,
        lat: point.lat,
        lon: point.lon,
      });
      router.replace({
        pathname: "/sos-sent",
        params: { tripId, reason: sos.reason },
      });
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setSending(false);
    }
  };

  const name = getSessionName() ?? "";
  const errorMessage = errorKey ? t(errorKey) : null;
  useAccessibilityAnnouncement(errorMessage);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.appbar}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          {...buttonAccessibility(t("sos.confirm.backLabel"))}
        >
          <Text style={styles.backGlyph} {...decorativeAccessibility}>‹</Text>
        </Pressable>
        <Text
          style={styles.appbarTitle}
          {...headingAccessibility(t("sos.confirm.title"))}
        >
          {t("sos.confirm.title")}
        </Text>
      </View>

      {errorKey ? (
        <View style={styles.errBox} {...alertAccessibility(errorMessage!)}>
          <Text style={styles.errText}>{errorMessage}</Text>
        </View>
      ) : null}

      {/* .sos-summary */}
      <View style={styles.summary}>
        <Text style={styles.reasonLabel}>{t("sos.confirm.reasonLabel")}</Text>
        <Text style={styles.big}>
          {reason ? t(reasonLabelKey(reason)) : "—"}
        </Text>
        <View style={styles.kv}>
          <Text style={styles.k}>{t("sos.confirm.sender")}</Text>
          <Text style={styles.v}>{name}</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.k}>{t("sos.confirm.location")}</Text>
          <Text style={styles.v}>
            {position
              ? `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}`
              : (trip?.meetingPoint ?? t("sos.confirm.locationUnknown"))}
          </Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.k}>{t("sos.confirm.sentTo")}</Text>
          <Text style={styles.v}>{t("sos.confirm.sentToValue")}</Text>
        </View>
      </View>

      <Text style={styles.note}>{t("sos.confirm.note")}</Text>

      <Pressable
        style={({ pressed }) => [styles.btnSend, pressed && styles.btnPressed]}
        onPress={send}
        disabled={sending}
        {...buttonAccessibility(t("sos.confirm.send"), {
          busy: sending,
          disabled: sending,
        })}
      >
        {sending ? (
          <ActivityIndicator color="#fff" accessible={false} />
        ) : (
          <Text style={styles.btnSendText}>{t("sos.confirm.send")}</Text>
        )}
      </Pressable>
      <Pressable
        style={styles.btnAlt}
        onPress={() => router.back()}
        {...buttonAccessibility(t("sos.confirm.changeReason"))}
      >
        <Text style={styles.btnAltText}>{t("sos.confirm.changeReason")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 26 },
  appbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: "center",
    justifyContent: "center",
  },
  backGlyph: { fontSize: 24, fontWeight: "700", color: c.text },
  appbarTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: c.text,
    flex: 1,
  },
  errBox: {
    backgroundColor: c.errBg,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  errText: { color: c.stSosDark, fontSize: 13, fontWeight: "700" },
  // .sos-summary
  summary: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
    ...shadowCard,
  },
  reasonLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: c.text3,
    letterSpacing: 0.48,
  },
  // .sos-summary .big
  big: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.19,
    color: c.text,
    marginTop: 3,
    marginBottom: 8,
  },
  kv: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 6,
  },
  k: { color: c.text2, fontWeight: "600", fontSize: 13 },
  v: {
    fontWeight: "700",
    fontSize: 13,
    color: c.text,
    textAlign: "right",
    flexShrink: 1,
  },
  note: {
    fontSize: 13,
    color: c.text2,
    lineHeight: 13 * 1.6,
    marginBottom: 4,
  },
  btnSend: {
    width: "100%",
    backgroundColor: c.stSos,
    borderRadius: radii.md,
    padding: 16,
    marginTop: 12,
    alignItems: "center",
    shadowColor: c.stSos,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 22,
    elevation: 7,
  },
  btnPressed: { transform: [{ scale: 0.985 }] },
  btnSendText: { color: "#fff", fontSize: 15.5, fontWeight: "800" },
  btnAlt: { width: "100%", alignItems: "center", padding: 13, marginTop: 6 },
  btnAltText: { fontSize: 13.5, fontWeight: "800", color: c.text2 },
});
