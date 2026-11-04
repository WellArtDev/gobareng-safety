// Layar Pantau Trip — mockup data-screen="watch-trip": tampilan
// read-only pemegang tautan (publik, TANPA auth — satu-satunya layar
// di luar auth gate selain login/register). watch-safe hijau/merah,
// peta live, ANGGOTA ROMBONGAN, catatan read-only. Data dari
// GET /shared-trips/:token (§16). Polling 20 dtk.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { LiveMap } from "@/components/LiveMap";
import { WeatherCard } from "@/components/WeatherCard";
import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import { fetchSharedTrip, type SharedTripView } from "@/utils/share-api";
import { markerColor } from "@/utils/tracking-logic";

const POLL_MS = 20000;

const ROLE_LABEL_KEYS: Record<string, string> = {
  LEADER: "home.roleLeader",
  MEMBER: "home.roleMember",
  SWEEPER: "home.roleSweeper",
  MEDIC: "home.roleMedic",
};

export function WatchTripScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t, locale } = useTranslation();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [view, setView] = useState<SharedTripView | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // canGoBack imperatif tidak tersedia saat render statis (SSG) —
  // dibaca pasca-mount (tautan dibuka langsung = tanpa back).
  const [canBack, setCanBack] = useState(false);
  useEffect(() => {
    setCanBack(router.canGoBack());
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setView(await fetchSharedTrip(token));
      setUpdatedAt(new Date());
      setErrorKey(null);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    }
  }, [token]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const sosUserIds = useMemo(
    () => new Set((view?.activeSos ?? []).map((s) => s.userId)),
    [view],
  );
  const sosActive = view?.status === "SOS_ACTIVE";

  const firstLocated = view?.positions.find((p) => p.location !== null);
  const centerLat = firstLocated?.location?.lat ?? null;
  const centerLon = firstLocated?.location?.lon ?? null;

  const updatedLabel = updatedAt
    ? `${t("watch.updatedPrefix")} ${updatedAt.toLocaleTimeString(
        locale === "id" ? "id-ID" : "en-US",
        { hour: "2-digit", minute: "2-digit" },
      )}`
    : "";

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <View style={styles.appbar}>
        {canBack ? (
          <Pressable
            style={styles.back}
            onPress={() => router.back()}
            accessibilityLabel={t("watch.backLabel")}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
        ) : null}
        <Text style={styles.appbarTitle}>{t("watch.title")}</Text>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.livePillText}>{t("watch.live")}</Text>
        </View>
      </View>

      {errorKey ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{t(errorKey)}</Text>
        </View>
      ) : null}

      {view ? (
        <>
          {/* .ld-triphead */}
          <View style={styles.triphead}>
            <Text style={styles.tripName}>{view.trip.name}</Text>
            <Text style={styles.tripSub}>
              {view.positions.length} {t("watch.membersSuffix")}
            </Text>
          </View>

          {/* .watch-safe */}
          <View style={[styles.safe, sosActive && styles.safeSos]}>
            <View style={[styles.wsdot, sosActive && styles.wsdotSos]} />
            <View style={styles.safeTxt}>
              <Text style={[styles.safeTitle, sosActive && styles.safeTitleSos]}>
                {sosActive ? t("watch.sosTitle") : t("watch.safeTitle")}
              </Text>
              <Text style={styles.safeSub}>
                {sosActive ? t("watch.sosSub") : t("watch.safeSub")}
                {updatedLabel ? ` • ${updatedLabel}` : ""}
              </Text>
            </View>
          </View>

          {centerLat !== null && centerLon !== null ? (
            <>
              <LiveMap
                positions={view.positions}
                centerLat={centerLat}
                centerLon={centerLon}
                sosUserIds={sosUserIds}
                accessibilityLabel={t("watch.title")}
              />
              {/* WX-1: cuaca + gempa juga untuk pemegang tautan pantau
                  (keluarga) — endpoint weather publik, fail-soft. */}
              <WeatherCard lat={centerLat} lon={centerLon} />
            </>
          ) : null}

          {/* ANGGOTA ROMBONGAN */}
          <Text style={styles.secTitle}>{t("watch.membersTitle")}</Text>
          <View style={styles.teambox}>
            {view.positions.map((p, index) => (
              <View
                key={p.userId}
                style={[
                  styles.member,
                  index === view.positions.length - 1 && styles.memberLast,
                ]}
              >
                <View
                  style={[
                    styles.mdot,
                    {
                      backgroundColor: markerColor(
                        p.role,
                        sosUserIds.has(p.userId),
                      ),
                    },
                    p.role === "MEDIC" && !sosUserIds.has(p.userId)
                      ? styles.mdotMedic
                      : null,
                  ]}
                />
                <Text style={styles.memberName}>{p.user.name}</Text>
                <Text style={styles.memberRole}>
                  {p.location
                    ? t(ROLE_LABEL_KEYS[p.role] ?? "home.roleMember")
                    : t("watch.noLocation")}
                </Text>
              </View>
            ))}
          </View>

          {/* .watch-note */}
          <Text style={styles.noteText}>{t("watch.note")}</Text>
        </>
      ) : null}
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
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.successBg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.success,
  },
  livePillText: { fontSize: 11, fontWeight: "800", color: c.success },
  errBox: {
    backgroundColor: c.errBg,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  errText: { color: c.stSosDark, fontSize: 13, fontWeight: "700" },
  triphead: { marginBottom: 12 },
  tripName: { fontSize: 15.5, fontWeight: "800", color: c.text },
  tripSub: {
    fontSize: 12.5,
    color: c.text2,
    fontWeight: "600",
    marginTop: 2,
  },
  // .watch-safe
  safe: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: c.successBg,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  safeSos: { backgroundColor: c.errBg },
  wsdot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: c.success,
  },
  wsdotSos: { backgroundColor: c.stSos },
  safeTxt: { flex: 1 },
  safeTitle: { fontSize: 13.5, fontWeight: "800", color: c.success },
  safeTitleSos: { color: c.stSosDark },
  safeSub: { fontSize: 11.5, color: c.text2, marginTop: 1 },
  secTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: c.text3,
    marginTop: 18,
    marginBottom: 10,
  },
  teambox: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 8,
    paddingHorizontal: 16,
    ...shadowCard,
  },
  member: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderBottomColor: c.line,
  },
  memberLast: { borderBottomWidth: 0 },
  mdot: { width: 13, height: 13, borderRadius: 7 },
  mdotMedic: { borderWidth: 1.5, borderColor: "#cbd5cd" },
  memberName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: c.text,
    flex: 1,
  },
  memberRole: { fontSize: 11, fontWeight: "800", color: c.text3 },
  // .watch-note
  noteText: {
    fontSize: 12,
    color: c.text3,
    lineHeight: 12 * 1.6,
    marginTop: 14,
    textAlign: "center",
  },
});
