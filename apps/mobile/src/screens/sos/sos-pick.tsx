// Layar Kirim SOS — mockup data-screen="sos" (flush no-nav): sos-head
// merah gelap (back putih + judul + sub), sos-trip-note, daftar alasan
// kontekstual per tipe trip (ReasonList), tombol lanjut (disabled tanpa
// pilihan), batal. Alasan dari trip ACTIVE pengguna.
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import { reasonLabelKey, reasonsForTripType, type SosReason } from "@/utils/sos-logic";
import { fetchMyTrips, type Trip } from "@/utils/trips-api";
import { useAccessibilityAnnouncement } from "@/hooks/use-accessibility-announcement";
import {
  alertAccessibility,
  announcementAccessibility,
  buttonAccessibility,
  decorativeAccessibility,
  headingAccessibility,
  selectableButtonAccessibility,
} from "@/utils/accessibility";

export function SosPickScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [reason, setReason] = useState<SosReason | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const trips = await fetchMyTrips();
      setTrip(trips.find((item) => item.status === "ACTIVE") ?? null);
      setErrorKey(null);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toConfirm = () => {
    if (!trip || !reason) return;
    router.push({
      pathname: "/sos-confirm",
      params: { tripId: trip.id, reason },
    });
  };
  const errorMessage = errorKey ? t(errorKey) : null;
  const noActiveMessage = loaded && !trip && !errorKey
    ? t("sos.noActiveTrip")
    : null;
  useAccessibilityAnnouncement(errorMessage);
  useAccessibilityAnnouncement(noActiveMessage);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* .sos-head */}
      <View style={styles.head}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          {...buttonAccessibility(t("sos.backLabel"))}
        >
          <Text style={styles.backGlyph} {...decorativeAccessibility}>‹</Text>
        </Pressable>
        <Text style={styles.headTitle} {...headingAccessibility(t("sos.title"))}>
          {t("sos.title")}
        </Text>
        <Text style={styles.headSub}>{t("sos.subtitle")}</Text>
      </View>

      <View style={styles.body}>
        {errorKey ? (
          <View style={styles.errBox} {...alertAccessibility(errorMessage!)}>
            <Text style={styles.errText}>{errorMessage}</Text>
          </View>
        ) : null}

        {loaded && !trip && !errorKey ? (
          <View
            style={styles.note}
            {...announcementAccessibility(noActiveMessage!, "polite")}
          >
            <Text style={styles.noteText}>{noActiveMessage}</Text>
          </View>
        ) : null}

        {trip ? (
          <>
            {/* .sos-trip-note */}
            <View style={styles.note}>
              <Text style={styles.noteText}>
                {trip.type === "HIKING"
                  ? t("sos.hikingNote")
                  : t("sos.touringNote")}
              </Text>
            </View>

            {/* ReasonList */}
            {reasonsForTripType(trip.type).map((item) => {
              const selected = reason === item;
              return (
                <Pressable
                  key={item}
                  style={[styles.reason, selected && styles.reasonSel]}
                  onPress={() => setReason(item)}
                  {...selectableButtonAccessibility(
                    t(reasonLabelKey(item)),
                    selected,
                  )}
                >
                  <View style={styles.ric}>
                    <Text style={styles.ricGlyph}>!</Text>
                  </View>
                  <Text style={styles.reasonText}>
                    {t(reasonLabelKey(item))}
                  </Text>
                  <Text style={styles.chev}>›</Text>
                </Pressable>
              );
            })}

            {/* .btn-send-sos */}
            <Pressable
              style={[styles.btnSend, !reason && styles.btnSendDisabled]}
              onPress={toConfirm}
              disabled={!reason}
              {...buttonAccessibility(t("sos.toConfirm"), {
                disabled: !reason,
              })}
            >
              <Text
                style={[
                  styles.btnSendText,
                  !reason && styles.btnSendTextDisabled,
                ]}
              >
                {t("sos.toConfirm")}
              </Text>
            </Pressable>
          </>
        ) : null}

        {/* SOS Umum — tanpa trip, untuk sehari-hari (Wella 2 Nov 2026). */}
        <Pressable
          style={styles.btnGeneral}
          onPress={() => router.push("/sos-general")}
          {...buttonAccessibility(t("sos.general.pickCta"))}
        >
          <Text style={styles.btnGeneralText}>{t("sos.general.pickCta")}</Text>
          <Text style={styles.btnGeneralSub}>{t("sos.general.subtitle")}</Text>
        </Pressable>

        {/* SOS Suara (AI-V) — rekam suara, transkripsi, konfirmasi. */}
        <Pressable
          style={styles.btnGeneral}
          onPress={() => router.push("/sos-voice")}
          {...buttonAccessibility(t("sos.voice.title"))}
        >
          <Text style={styles.btnGeneralText}>{t("sos.voice.title")}</Text>
          <Text style={styles.btnGeneralSub}>{t("sos.voice.subtitle")}</Text>
        </Pressable>

        <Pressable
          style={styles.btnCancel}
          onPress={() => router.back()}
          {...buttonAccessibility(t("sos.cancel"))}
        >
          <Text style={styles.btnCancelText}>{t("sos.cancel")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  // .screen flush: padding 0
  content: { paddingBottom: 26 },
  // .sos-head: bg st-sos-dark, teks putih
  head: {
    backgroundColor: c.stSosDark,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  // .sos-head .back: putih transparan
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
  headSub: {
    fontSize: 13,
    lineHeight: 13 * 1.55,
    color: "rgba(255,255,255,.85)",
    marginTop: 5,
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
  // .sos-trip-note
  note: {
    backgroundColor: c.surface2,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 13,
    marginBottom: 12,
  },
  noteText: {
    fontSize: 12.5,
    color: c.text2,
    lineHeight: 12.5 * 1.55,
  },
  // .reason
  reason: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.line,
    borderRadius: radii.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 9,
    ...shadowCard,
  },
  // .reason.sel
  reasonSel: { borderColor: c.stSos, backgroundColor: "#fff5f5" },
  // .ric
  ric: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: c.errBg,
    alignItems: "center",
    justifyContent: "center",
  },
  ricGlyph: { color: c.stSos, fontSize: 18, fontWeight: "800" },
  reasonText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: c.text,
    flex: 1,
  },
  chev: { color: c.text3, fontSize: 20, fontWeight: "700" },
  // .btn-send-sos
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
  btnSendDisabled: {
    backgroundColor: c.surface2,
    shadowOpacity: 0,
    elevation: 0,
  },
  btnSendText: { color: "#fff", fontSize: 15.5, fontWeight: "800" },
  btnSendTextDisabled: { color: c.text3 },
  // .btn-finish
  btnGeneral: {
    width: "100%",
    backgroundColor: c.surface2,
    borderRadius: radii.md,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: c.line,
  },
  btnGeneralText: { color: c.text, fontSize: 15, fontWeight: "800" },
  btnGeneralSub: { color: c.text3, fontSize: 12.5, marginTop: 3 },
  btnCancel: { width: "100%", alignItems: "center", padding: 13, marginTop: 6 },
  btnCancelText: { fontSize: 13.5, fontWeight: "800", color: c.text2 },
});
