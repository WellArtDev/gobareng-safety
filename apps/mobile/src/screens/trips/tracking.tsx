// Layar Trip Berjalan — mockup data-screen="tracking". Kerangka persis:
// track-head (chip live + lokasi), sos-banner (muncul saat ada SOS
// terbuka), mapbox peta live, stats 3 kolom, member-chips, tombol
// leader (hanya leader), bagikan trip, SOS merah besar, Akhiri Trip.
// Tombol beacon mockup TIDAK dirender (Beacon HOLD 26 Okt 2026 —
// jangan tampil di demo).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";

import { LiveMap } from "@/components/LiveMap";
import { WeatherCard } from "@/components/WeatherCard";
import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import {
  fetchActiveSos,
  fetchPositions,
  postLocation,
  type MemberPosition,
  type SosAlert,
} from "@/utils/locations-api";
import * as ExpoLocation from "expo-location";

import { getCurrentPositionDetailed } from "@/utils/geo";
import { tripCheckpointKindFromName } from "@/utils/trip-checkpoint-map-html";
import {
  startBackgroundLocation,
  stopBackgroundLocation,
} from "@/utils/background-location";
import { chooseActiveSender } from "@/utils/background-location-logic";
import {
  createPositionSender,
  type PositionSender,
} from "@/utils/position-sender";
import { positionQueueStore } from "@/utils/position-queue-store";
import { getSessionName } from "@/utils/session-token";
import {
  accumulateDistanceKm,
  canFinishTrip,
  formatDistanceKm,
  formatDurationMin,
  formatElevation,
  markerColor,
  memberAccessibilityLabel,
  tripElapsedMin,
} from "@/utils/tracking-logic";
import {
  closeTrip,
  fetchTrip,
  fetchTripCheckpoints,
  type Trip,
  type TripCheckpoint,
} from "@/utils/trips-api";
import {
  alertAccessibility,
  buttonAccessibility,
  decorativeAccessibility,
  groupAccessibility,
  headingAccessibility,
} from "@/utils/accessibility";
import { useAccessibilityAnnouncement } from "@/hooks/use-accessibility-announcement";

const POLL_MS = 15000;

// Tracking live dibuka dari detail trip (/trips/[id]/tracking) —
// keputusan Wella 28 Okt 2026; bukan lagi tab nav langsung.
export function TrackingScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [positions, setPositions] = useState<MemberPosition[]>([]);
  const [checkpoints, setCheckpoints] = useState<TripCheckpoint[]>([]);
  const [sos, setSos] = useState<SosAlert[]>([]);
  // Posisi GPS lokal perangkat sendiri (perbaikan 4 Nov 2026): watch
  // ini HANYA menggerakkan marker saya di peta, bukan mengirim ke
  // server — kirim tetap lewat pengirim (foreground 10 dtk / interval
  // background) supaya API tidak dispam tiap detik.
  const [localPos, setLocalPos] = useState<{ lat: number; lon: number } | null>(
    null,
  );
  // True saat Akhiri Trip sedang menutup: cleanup effect pengirim
  // harus menghentikan task, bukan menghidupkannya kembali (lihat
  // di bawah: unmount biasa untuk trip ACTIVE justru menjaga task).
  const finishingRef = useRef(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  // Error aksi (Akhiri Trip dsb.) dipisah supaya tidak terhapus polling.
  const [actionErrorKey, setActionErrorKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const current = await fetchTrip(id);
      setTrip(current);
      const [pos, alerts, cps] = await Promise.all([
        fetchPositions(current.id).catch(() => [] as MemberPosition[]),
        fetchActiveSos(current.id).catch(() => [] as SosAlert[]),
        fetchTripCheckpoints(current.id).catch(() => [] as TripCheckpoint[]),
      ]);
      setPositions(pos);
      setSos(alerts);
      setCheckpoints(cps);
      setErrorKey(null);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Koordinasi pengirim (M5): foreground HANYA saat layar fokus DAN
  // app aktif; sisanya — pindah layar (mis. ke SOS), app di-background,
  // HP terkunci — background task, selama trip ACTIVE. Tidak pernah
  // dua-duanya jalan (chooseActiveSender). Trip bukan ACTIVE -> tidak
  // ada pengirim. Fail-soft diam-diam di dalam sender (tanpa banner
  // error). useIsFocused saja tidak cukup: app di-background tidak
  // mengubah fokus navigasi, jadi AppState ikut dibaca.
  const isFocused = useIsFocused();
  const [appState, setAppState] = useState(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", setAppState);
    return () => sub.remove();
  }, []);
  const senderRef = useRef<PositionSender | null>(null);
  if (senderRef.current === null) {
    senderRef.current = createPositionSender({
      getPosition: getCurrentPositionDetailed,
      post: postLocation,
      // M7: posisi gagal POST masuk antrean SecureStore, di-flush
      // otomatis tiap tick saat koneksi kembali.
      queue: positionQueueStore,
    });
  }
  const foregroundActive = isFocused && appState === "active";

  useEffect(() => {
    const sender = senderRef.current!;
    const mode = chooseActiveSender(foregroundActive, trip?.status);
    if (mode === "foreground" && trip) {
      void stopBackgroundLocation();
      sender.start(trip.id);
    } else if (mode === "background" && trip) {
      sender.stop();
      void startBackgroundLocation(trip.id, trip.type);
    } else {
      sender.stop();
      void stopBackgroundLocation();
    }
    return () => {
      sender.stop();
      // Perbaikan 4 Nov 2026 (tombol back tracking): keluar dari layar
      // tracking — termasuk ke detail trip — TIDAK boleh mematikan
      // pengiriman untuk trip ACTIVE. Hanya Akhiri Trip (finishingRef)
      // atau trip bukan ACTIVE yang menghentikan task. Pindah ke
      // detail = layar unfocused -> effect baru mode background, dan
      // kalaupun layar unmount, cleanup ini menghidupkan background.
      if (finishingRef.current || trip?.status !== "ACTIVE") {
        void stopBackgroundLocation();
      } else if (trip) {
        void startBackgroundLocation(trip.id, trip.type);
      }
    };
  }, [foregroundActive, trip?.id, trip?.status, trip?.type]);

  // Watch GPS lokal untuk marker sendiri (perbaikan 4 Nov 2026):
  // jalan hanya saat layar fokus + app aktif + trip ACTIVE; update
  // marker seketika antar kirim server, tanpa POST tambahan.
  useEffect(() => {
    if (!foregroundActive || trip?.status !== "ACTIVE") return undefined;
    let sub: ExpoLocation.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } =
        await ExpoLocation.requestForegroundPermissionsAsync();
      if (cancelled || status !== "granted") return;
      sub = await ExpoLocation.watchPositionAsync(
        {
          accuracy: ExpoLocation.Accuracy.Balanced,
          distanceInterval: 5,
          timeInterval: 3000,
        },
        (loc) => {
          setLocalPos({
            lat: loc.coords.latitude,
            lon: loc.coords.longitude,
          });
        },
      );
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [foregroundActive, trip?.status]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const sosUserIds = useMemo(
    () => new Set(sos.map((alert) => alert.userId)),
    [sos],
  );

  // Pusat peta: titik kumpul trip; fallback posisi pertama yang ada.
  const firstLocated = positions.find((p) => p.location !== null);
  const centerLat = trip?.meetingLat ?? firstLocated?.location?.lat ?? null;
  const centerLon = trip?.meetingLon ?? firstLocated?.location?.lon ?? null;

  // Memo: objek baru tiap render memicu render ulang LiveMap sia-sia
  // padahal isi checkpoint sama (polling 15 dtk / watch GPS 3 dtk).
  const mapCheckpoints = useMemo(
    () =>
      checkpoints.map((cp) => ({
        name: cp.name,
        lat: cp.lat,
        lon: cp.lon,
        kind: tripCheckpointKindFromName(cp.name),
      })),
    [checkpoints],
  );

  // Stats dari data live: jarak = akumulasi posisi terbaru semua anggota
  // (riwayat jalur sendiri menyusul bersama M5), elevasi = altitude
  // posisi pertama yang ada, durasi = waktu trip berjalan (startedAt
  // bila ada, fallback createdAt — lihat tripElapsedMin).
  const located = positions.filter((p) => p.location !== null);
  const distanceKm = accumulateDistanceKm(
    located.map((p) => ({ lat: p.location!.lat, lon: p.location!.lon })),
  );
  const elevation =
    located.length > 0 ? (located[0].location!.altitude ?? null) : null;
  const durationMin = trip ? tripElapsedMin(trip) : 0;

  const sosWithName = sos.length > 0 ? sos[0] : null;
  const sosName =
    sosWithName !== null
      ? (positions.find((p) => p.userId === sosWithName.userId)?.user.name ??
        "")
      : "";
  const sosMessage = sosWithName
    ? t("tracking.sosActive", { name: sosName })
    : null;
  const trackingErrorMessage = actionErrorKey
    ? t(actionErrorKey)
    : errorKey
      ? t(errorKey)
      : null;
  useAccessibilityAnnouncement(sosMessage);
  useAccessibilityAnnouncement(trackingErrorMessage);

  // Sesi menyimpan nama (bukan userId) — leader dicocokkan via nama.
  // Dipertegas saat /auth/me dipakai di PR profil.
  const myName = getSessionName();
  const isLeader = Boolean(
    trip &&
      myName &&
      positions.some((p) => p.role === "LEADER" && p.user.name === myName),
  );

  // Marker saya memakai GPS lokal bila ada (realtime di layar),
  // fallback posisi server saat watch belum ada fix pertama.
  const displayPositions = useMemo(() => {
    if (!localPos || !myName) return positions;
    const mine = positions.find((p) => p.user.name === myName);
    if (!mine) return positions;
    return positions.map((p) =>
      p.userId === mine.userId
        ? {
            ...p,
            location: p.location
              ? { ...p.location, lat: localPos.lat, lon: localPos.lon }
              : {
                  id: "local",
                  tripId: trip?.id ?? "",
                  userId: mine.userId,
                  lat: localPos.lat,
                  lon: localPos.lon,
                  accuracy: null,
                  speed: null,
                  heading: null,
                  altitude: null,
                  batteryLevel: null,
                  ts: new Date().toISOString(),
                },
          }
        : p,
    );
  }, [positions, localPos, myName]);

  // Akhiri Trip = tutup trip (§17); hanya leader yang boleh di server.
  // TRIP_HAS_UNACCOUNTED_MEMBERS -> dialog konfirmasi: leader yang
  // memutuskan menutup paksa (confirmUnaccounted: true), bukan error
  // buntu. Error lain tetap tampil apa adanya.
  const finishTrip = async (confirmUnaccounted: boolean) => {
    if (!trip) return;
    setFinishing(true);
    setActionErrorKey(null);
    try {
      await closeTrip(trip.id, confirmUnaccounted);
      // Akhiri Trip = satu-satunya jalan keluar tracking yang
      // menghentikan task: tandai dulu supaya cleanup effect tidak
      // menghidupkan background kembali untuk trip yang baru ditutup.
      finishingRef.current = true;
      await stopBackgroundLocation();
      router.replace("/tracking");
    } catch (error) {
      if (
        !confirmUnaccounted &&
        error instanceof ApiError &&
        error.code === "TRIP_HAS_UNACCOUNTED_MEMBERS"
      ) {
        Alert.alert(
          t("tracking.finishConfirmTitle"),
          t("tracking.finishConfirmMessage"),
          [
            { text: t("tracking.finishConfirmNo"), style: "cancel" },
            {
              text: t("tracking.finishConfirmYes"),
              onPress: () => void finishTrip(true),
            },
          ],
        );
      } else {
        setActionErrorKey(
          error instanceof ApiError ? error.i18nKey : "errors.unavailable",
        );
      }
    } finally {
      setFinishing(false);
    }
  };

  const onFinish = async () => {
    if (!trip || !canFinishTrip(true, finishing)) return;
    await finishTrip(false);
  };

  if (loaded && !trip) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>{t("tracking.noTrip")}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      {/* .track-head */}
      <View style={styles.trackHead}>
        {/* Tombol back (perbaikan 4 Nov 2026): kembali ke detail trip
            TANPA mengakhiri trip dan TANPA menghentikan pengiriman
            posisi — push menjaga layar tracking mounted (unfocused ->
            mode background) dan cleanup effect menjaga task untuk
            trip ACTIVE. */}
        <Pressable
          style={({ pressed }) => [
            styles.backBtn,
            pressed && styles.backBtnPressed,
          ]}
          onPress={() => trip && router.push(`/trips/${trip.id}`)}
          {...buttonAccessibility(t("tracking.backToDetail"))}
        >
          <Text style={styles.backBtnText}>‹ {t("tracking.backToDetail")}</Text>
        </Pressable>
        <View style={styles.trackChip}>
          <View style={styles.pdot} />
          <Text style={styles.trackChipText}>{t("tracking.chipLive")}</Text>
        </View>
        <Text style={styles.trackPlace} numberOfLines={1}>
          {trip ? `${trip.name} • ${trip.meetingPoint}` : ""}
        </Text>
      </View>

      {/* .sos-banner — hanya saat ada SOS terbuka */}
      {sosWithName ? (
        <View
          style={styles.sosBanner}
          {...alertAccessibility(sosMessage!)}
        >
          <Text style={styles.sosBannerText}>{sosMessage}</Text>
        </View>
      ) : null}

      {errorKey || actionErrorKey ? (
        <View
          style={styles.errBox}
          {...alertAccessibility(trackingErrorMessage!)}
        >
          <Text style={styles.errText}>{trackingErrorMessage}</Text>
        </View>
      ) : null}

      {centerLat !== null && centerLon !== null ? (
        <>
          <LiveMap
            positions={displayPositions}
            centerLat={centerLat}
            centerLon={centerLon}
            sosUserIds={sosUserIds}
            accessibilityLabel={t("tracking.mapSummary", {
              members: String(located.length),
              sos: String(sos.length),
            })}
            checkpoints={mapCheckpoints}
          />
          {/* WX-1: cuaca + gempa area trip (fail-soft) */}
          <WeatherCard lat={centerLat} lon={centerLon} />
        </>
      ) : null}

      {/* .stats */}
      <View style={styles.stats}>
        <View
          style={styles.stat}
          {...groupAccessibility(
            `${t("tracking.statDistance")}: ${formatDistanceKm(distanceKm)}`,
          )}
        >
          <Text style={styles.statValue}>{formatDistanceKm(distanceKm)}</Text>
          <Text style={styles.statLabel}>{t("tracking.statDistance")}</Text>
        </View>
        <View
          style={[styles.stat, styles.statBorder]}
          {...groupAccessibility(
            `${t("tracking.statElevation")}: ${formatElevation(elevation)}`,
          )}
        >
          <Text style={styles.statValue}>{formatElevation(elevation)}</Text>
          <Text style={styles.statLabel}>{t("tracking.statElevation")}</Text>
        </View>
        <View
          style={[styles.stat, styles.statBorder]}
          {...groupAccessibility(
            `${t("tracking.statDuration")}: ${formatDurationMin(durationMin)}`,
          )}
        >
          <Text style={styles.statValue}>{formatDurationMin(durationMin)}</Text>
          <Text style={styles.statLabel}>{t("tracking.statDuration")}</Text>
        </View>
      </View>

      {/* member chips */}
      <Text
        style={styles.secTitle}
        {...headingAccessibility(t("tracking.membersTitle"))}
      >
        {t("tracking.membersTitle")}
      </Text>
      {/* Mockup: "ANGGOTA TIM — KETUK UNTUK PROFIL" -> profil publik */}
      <View style={styles.memberChips}>
        {positions.map((p) => (
          <Pressable
            key={p.userId}
            style={styles.mchip}
            onPress={() => router.push(`/users/${p.user.slug}`)}
            {...groupAccessibility(
              memberAccessibilityLabel(
                p.user.name,
                t(
                p.role === "LEADER"
                  ? "home.roleLeader"
                  : p.role === "SWEEPER"
                    ? "home.roleSweeper"
                    : p.role === "MEDIC"
                      ? "home.roleMedic"
                      : "home.roleMember",
                ),
                sosUserIds.has(p.userId),
                t("tracking.memberSosActive"),
              ),
            )}
          >
            <View
              style={[
                styles.mdot,
                { backgroundColor: markerColor(p.role, sosUserIds.has(p.userId)) },
                p.role === "MEDIC" && !sosUserIds.has(p.userId)
                  ? styles.mdotMedic
                  : null,
              ]}
            />
            <Text style={styles.mchipText}>{p.user.name}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.gap6} />
      {isLeader ? (
        <Pressable
          style={styles.btnRow}
          onPress={() => trip && router.push(`/trips/${trip.id}/leader`)}
          {...buttonAccessibility(t("tracking.leaderButton"))}
        >
          <Image
            source={require("@/assets/icons/nav-profile.svg")}
            style={styles.btnRowIcon}
            tintColor={colors.primaryDark}
            {...decorativeAccessibility}
          />
          <Text style={styles.btnRowText}>{t("tracking.leaderButton")}</Text>
          <View style={styles.ldb}>
            <Text style={styles.ldbText}>{t("tracking.leaderBadge")}</Text>
          </View>
        </Pressable>
      ) : null}

      <Pressable
        style={styles.btnRow}
        onPress={() => trip && router.push(`/trips/share?tripId=${trip.id}`)}
        disabled={!trip}
        {...buttonAccessibility(t("tracking.shareButton"), {
          disabled: !trip,
        })}
      >
        <Image
          source={require("@/assets/icons/nav-explore.svg")}
          style={styles.btnRowIcon}
          tintColor={colors.primaryDark}
          {...decorativeAccessibility}
        />
        <Text style={styles.btnRowText}>{t("tracking.shareButton")}</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.btnSos, pressed && styles.btnSosPressed]}
        onPress={() => router.push("/sos")}
        {...buttonAccessibility(t("tracking.sosButton"))}
      >
        <Text style={styles.btnSosText}>{t("tracking.sosButton")}</Text>
      </Pressable>

      <Pressable
        style={[styles.btnFinish, finishing && styles.btnFinishDisabled]}
        onPress={onFinish}
        disabled={!canFinishTrip(Boolean(trip), finishing)}
        {...buttonAccessibility(t("tracking.finishButton"), {
          busy: finishing,
          disabled: !canFinishTrip(Boolean(trip), finishing),
        })}
      >
        <Text style={styles.btnFinishText}>{t("tracking.finishButton")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 96 },
  emptyWrap: {
    flex: 1,
    backgroundColor: c.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: { fontSize: 13, color: c.text3, fontWeight: "600" },
  // .track-head
  trackHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 4,
  },
  backBtn: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: radii.pill,
  },
  backBtnPressed: { opacity: 0.7 },
  backBtnText: { fontSize: 11.5, fontWeight: "800", color: c.text2 },
  // .track-chip
  trackChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: radii.pill,
  },
  trackChipText: { fontSize: 11.5, fontWeight: "800", color: c.text2 },
  pdot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.stMember,
  },
  trackPlace: {
    marginLeft: "auto",
    fontSize: 12.5,
    fontWeight: "700",
    color: c.text3,
    flexShrink: 1,
  },
  // .sos-banner
  sosBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: c.stSos,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  sosBannerText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  errBox: {
    backgroundColor: c.errBg,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  errText: { color: c.stSosDark, fontSize: 13, fontWeight: "700" },
  // .stats
  stats: {
    flexDirection: "row",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    marginTop: 14,
    overflow: "hidden",
    ...shadowCard,
  },
  stat: { flex: 1, alignItems: "center", paddingVertical: 13, paddingHorizontal: 6 },
  statBorder: { borderLeftWidth: 1, borderLeftColor: c.line },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.16,
    color: c.text,
  },
  statLabel: {
    fontSize: 11,
    color: c.text2,
    fontWeight: "600",
    marginTop: 2,
  },
  secTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: c.text3,
    marginTop: 18,
    marginBottom: 10,
  },
  memberChips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  // .mchip
  mchip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.surface,
    ...shadowCard,
  },
  mchipText: { fontSize: 12.5, fontWeight: "700", color: c.text },
  mdot: { width: 13, height: 13, borderRadius: 7 },
  mdotMedic: { borderWidth: 1.5, borderColor: "#cbd5cd" },
  gap6: { height: 6 },
  // .btn-leader / .btn-share
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.line,
    borderRadius: radii.md,
    paddingVertical: 13,
    paddingHorizontal: 15,
    marginTop: 10,
    ...shadowCard,
  },
  btnRowIcon: { width: 18, height: 18 },
  btnRowText: { fontSize: 14, fontWeight: "800", color: c.text, flex: 1 },
  ldb: {
    backgroundColor: c.goldBg,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
  },
  ldbText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: c.gold,
  },
  // .btn-sos
  btnSos: {
    width: "100%",
    backgroundColor: c.stSos,
    borderRadius: radii.md,
    padding: 17,
    marginTop: 14,
    alignItems: "center",
    shadowColor: c.stSos,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 7,
  },
  btnSosPressed: { transform: [{ scale: 0.985 }] },
  btnSosText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.32,
  },
  // .btn-finish — tombol sungguhan (bukan teks polos): latar primary,
  // radius + padding seirama tombol SOS, teks putih kontras.
  btnFinish: {
    width: "100%",
    alignItems: "center",
    backgroundColor: c.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 15,
    marginTop: 6,
    ...shadowCard,
  },
  btnFinishDisabled: { opacity: 0.6 },
  btnFinishText: { fontSize: 14, fontWeight: "800", color: "#fff" },
});
