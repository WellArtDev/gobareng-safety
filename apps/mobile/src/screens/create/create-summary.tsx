// Ringkasan Trip — mockup data-screen="create-summary": catatan "kamu
// otomatis jadi leader", kartu ringkasan kv, Buat Trip -> POST §2
// (meetingLat/meetingLon dikirim bila sepasang angka valid, hiking
// maupun touring — dulu hiking tidak pernah punya koordinat karena
// formnya tak punya pilihan peta), sukses -> wizard-done.
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { TripWeatherSection } from "@/components/TripWeatherSection";
import { WizardAppbar } from "@/components/WizardUi";
import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import { apiRequest } from "@/utils/api-client";
import { fetchMe } from "@/utils/profile-api";
import { isPhoneMissing } from "@/utils/invite-api";
import { parseCoordPair } from "@/utils/trip-weather-coords";
import { buildCreateTripBody } from "@/utils/create-trip-logic";
import type { Trip } from "@/utils/trips-api";

export function CreateSummaryScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    mountainId: string;
    routeId: string;
    mountainName: string;
    routeName: string;
    name: string;
    date: string;
    time: string;
    meet: string;
    meetLat: string;
    meetLon: string;
    destination: string;
    destinationLat: string;
    destinationLon: string;
    weatherLat: string;
    weatherLon: string;
    desc: string;
    quota: string;
    tripType: string;
  }>();
  const isTouring = params.tripType === "TOURING";
  // Nama gunung/jalur dibawa dari form (sudah di-resolve dari API di
  // sana) — ringkasan tidak lagi menebak dari katalog statis.
  const mountainName = params.mountainName ?? "";
  const routeName = params.routeName ?? "";
  // Cuaca dari form (sudah di-resolve di sana); tanpa param valid ->
  // disembunyikan total, sama seperti di form.
  const weatherCoords = useMemo(
    () => parseCoordPair(params.weatherLat, params.weatherLon),
    [params.weatherLat, params.weatherLon],
  );
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Buat trip wajib HP (2 Nov 2026): null = belum diketahui / gagal
  // memuat -> fail-open (API tetap penegak utama); true = HP kosong.
  const [phoneMissing, setPhoneMissing] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMe()
      .then((me) => {
        if (alive) setPhoneMissing(isPhoneMissing(me.phone));
      })
      .catch(() => {
        if (alive) setPhoneMissing(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Body dibangun helper murni (aturan kirim di sana): hiking ikut
      // membawa mountainId/routeId agar API bisa menautkan rute +
      // menyalin pos jalur; touring tidak pernah membawa field rute.
      const body = buildCreateTripBody({
        name: params.name,
        tripType: isTouring ? "TOURING" : "HIKING",
        date: params.date,
        time: params.time,
        meetingPoint: params.meet,
        quota: Number(params.quota),
        meetLat: params.meetLat,
        meetLon: params.meetLon,
        destination: params.destination,
        destinationLat: params.destinationLat,
        destinationLon: params.destinationLon,
        mountainId: params.mountainId,
        routeId: params.routeId,
      });
      const data = await apiRequest<{ trip: Trip }>("/trip-groups", {
        method: "POST",
        body,
      });
      router.replace({
        pathname: "/create-trip/done",
        params: {
          tripId: data.trip.id,
          mountain: mountainName,
          route: routeName,
          meet: params.meet ?? "",
          destination: params.destination ?? "",
        },
      });
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <WizardAppbar
        title={t("create.summaryTitle")}
        backLabel={t("create.summaryBack")}
      />
      <Text style={styles.note}>{t("create.summaryNote")}</Text>

      {errorKey ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{t(errorKey)}</Text>
        </View>
      ) : null}

      {/* .sos-summary dipakai ulang mockup untuk kartu ringkasan */}
      <View style={styles.summary}>
        <View style={styles.kv}>
          <Text style={styles.k}>{t("create.sumName")}</Text>
          <Text style={styles.v}>{params.name}</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.k}>{t("create.sumType")}</Text>
          <Text style={styles.v}>
            {isTouring ? t("wizard.typeTouring") : t("wizard.typeHiking")}
          </Text>
        </View>
        {isTouring ? null : (
          <View style={styles.kv}>
            <Text style={styles.k}>{t("create.sumMountain")}</Text>
            <Text style={styles.v}>
              {mountainName
                ? `${mountainName}${routeName ? ` • ${routeName}` : ""}`
                : "—"}
            </Text>
          </View>
        )}
        <View style={styles.kv}>
          <Text style={styles.k}>{t("create.sumWhen")}</Text>
          <Text style={styles.v}>
            {params.date} {params.time}
          </Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.k}>{t("create.sumMeet")}</Text>
          <Text style={styles.v}>{params.meet}</Text>
        </View>
        {isTouring ? (
          <View style={styles.kv}>
            <Text style={styles.k}>{t("create.sumDestination")}</Text>
            <Text style={styles.v}>{params.destination}</Text>
          </View>
        ) : null}
        <View style={styles.kv}>
          <Text style={styles.k}>{t("create.sumMax")}</Text>
          <Text style={styles.v}>{params.quota}</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.k}>{t("create.sumVis")}</Text>
          <Text style={styles.v}>{t("create.visPrivate")}</Text>
        </View>
      </View>

      {weatherCoords ? (
        <TripWeatherSection lat={weatherCoords.lat} lon={weatherCoords.lon} />
      ) : null}

      {/* Gate HP (2 Nov 2026): submit dinonaktifkan bila HP diketahui
          kosong; banner mengarahkan ke Isi Data Profil. */}
      {phoneMissing ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{t("create.phoneRequired")}</Text>
          <Pressable
            style={styles.btnAlt}
            onPress={() => router.push("/profile-data")}
          >
            <Text style={styles.btnAltText}>{t("create.fillProfile")}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.gap16} />
      <Pressable
        style={({ pressed }) => [
          styles.btnMain,
          pressed && !phoneMissing && styles.btnPressed,
          phoneMissing && styles.btnDisabled,
        ]}
        onPress={submit}
        disabled={submitting || phoneMissing === true}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnMainText}>{t("create.submit")}</Text>
        )}
      </Pressable>
      <Pressable style={styles.btnAlt} onPress={() => router.back()}>
        <Text style={styles.btnAltText}>{t("create.editAgain")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 26 },
  note: {
    fontSize: 12.5,
    color: c.text2,
    lineHeight: 12.5 * 1.55,
    marginBottom: 13,
  },
  errBox: {
    backgroundColor: c.errBg,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  errText: { color: c.stSosDark, fontSize: 13, fontWeight: "700" },
  summary: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
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
  v: {
    fontWeight: "700",
    fontSize: 13,
    color: c.text,
    textAlign: "right",
    flexShrink: 1,
  },
  gap16: { height: 16 },
  btnMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    borderRadius: radii.md,
    paddingVertical: 15,
    paddingHorizontal: 18,
    backgroundColor: c.primary,
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 6,
  },
  btnPressed: {
    backgroundColor: c.primaryDark,
    transform: [{ scale: 0.985 }],
  },
  btnDisabled: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
  btnMainText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnAlt: { width: "100%", alignItems: "center", padding: 13, marginTop: 6 },
  btnAltText: { fontSize: 13.5, fontWeight: "800", color: c.text2 },
});
