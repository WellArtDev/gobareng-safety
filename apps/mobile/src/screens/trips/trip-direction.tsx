// Layar Direction in-app (3 Nov 2026): menggantikan tautan Google Maps
// di baris checkpoint + titik kumpul. Dua mode lewat switcher jelas
// (default garis rute): (a) garis rute di peta + jarak, (b) navigasi
// belokan demi belokan dengan hitung ulang otomatis bila salah jalan.
// Target mengikuti status check-in (entryDirectionTarget): sebelum
// check-in -> entry yang diketuk, sesudah check-in -> tujuan trip.
// Bila routing gagal: error jujur + coba lagi, TANPA fallback eksternal.
// Panduan suara belum ada (expo-speech tidak terpasang) — follow-up.
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ExpoLocation from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";

import { useTranslation } from "@/i18n";
import { radii, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import {
  alertAccessibility,
  buttonAccessibility,
  headingAccessibility,
} from "@/utils/accessibility";
import { getCurrentPosition } from "@/utils/geo";
import {
  currentStepIndex,
  entryDirectionTarget,
  fetchOsrmRoute,
  formatDistance,
  haversineM,
  isOffRoute,
  navStepKey,
  remainingDistanceM,
  type DirectionEntry,
  type LatLon,
  type RouteResult,
} from "@/utils/direction-route";
import { directionMapHtml } from "@/utils/direction-map-html";
import type { DirectionTarget } from "@/utils/trip-direction";
import {
  fetchTrip,
  fetchTripMembers,
  type TripMember,
} from "@/utils/trips-api";
import { fetchMe } from "@/utils/profile-api";

type Phase =
  | "locating"
  | "routing"
  | "ready"
  | "no-position"
  | "route-error"
  | "no-target";

const OFF_ROUTE_M = 60;
const REROUTE_COOLDOWN_MS = 15000;
const ARRIVED_M = 30;

export function TripDirectionScreen() {
  const styles = useThemedStyles(makeStyles);
  const { locale, t } = useTranslation();
  const params = useLocalSearchParams<{
    id?: string;
    entry?: string;
    cpLat?: string;
    cpLon?: string;
    cpName?: string;
  }>();
  const tripId = params.id ?? "";
  const sep = locale === "id" ? "," : ".";

  const [phase, setPhase] = useState<Phase>("locating");
  const [target, setTarget] = useState<DirectionTarget | null>(null);
  const [pos, setPos] = useState<LatLon | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [mode, setMode] = useState<"route" | "turns">("route");
  const [rerouting, setRerouting] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const webViewRef = useRef<ComponentRef<typeof WebView>>(null);
  const routeRef = useRef<RouteResult | null>(null);
  const modeRef = useRef<"route" | "turns">("route");
  const targetRef = useRef<DirectionTarget | null>(null);
  const reroutingRef = useRef(false);
  const lastRerouteRef = useRef(0);

  routeRef.current = route;
  modeRef.current = mode;
  targetRef.current = target;
  reroutingRef.current = rerouting;

  const run = useCallback(async () => {
    if (!tripId) return;
    setPhase("locating");
    setRoute(null);
    routeRef.current = null;
    try {
      const [tripData, memberData, meData] = await Promise.all([
        fetchTrip(tripId),
        fetchTripMembers(tripId).catch(() => [] as TripMember[]),
        fetchMe().catch(() => null),
      ]);
      const myMember = meData
        ? memberData.find((m) => m.userId === meData.id)
        : undefined;
      const attendance = myMember?.attendance ?? "NOT_DEPARTED";
      let entry: DirectionEntry = { kind: "meeting" };
      if (params.entry === "checkpoint") {
        const la = Number(params.cpLat);
        const lo = Number(params.cpLon);
        if (Number.isFinite(la) && Number.isFinite(lo)) {
          entry = {
            kind: "checkpoint",
            lat: la,
            lon: lo,
            label:
              typeof params.cpName === "string" && params.cpName.length > 0
                ? params.cpName
                : "Checkpoint",
          };
        }
      }
      const resolved = entryDirectionTarget(tripData, attendance, entry);
      setTarget(resolved);
      targetRef.current = resolved;
      if (!resolved) {
        setPhase("no-target");
        return;
      }
      const start = await getCurrentPosition();
      if (!start) {
        setPhase("no-position");
        return;
      }
      setPos(start);
      setPhase("routing");
      const fetched = await fetchOsrmRoute(start, resolved);
      setRoute(fetched);
      routeRef.current = fetched;
      setPhase("ready");
    } catch {
      // Gagal jaringan saat ambil trip/rute: perlakukan sebagai
      // route-error (pesan + coba lagi), bukan layar kosong.
      setPhase((prev) => (prev === "ready" ? prev : "route-error"));
    }
  }, [tripId, params.entry, params.cpLat, params.cpLon, params.cpName]);

  useEffect(() => {
    run();
  }, [run]);

  // Pelacakan live + hitung ulang otomatis (mode belokan saja).
  useEffect(() => {
    if (phase !== "ready") return undefined;
    let sub: ExpoLocation.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } =
        await ExpoLocation.requestForegroundPermissionsAsync();
      if (cancelled || status !== "granted") return;
      sub = await ExpoLocation.watchPositionAsync(
        {
          accuracy: ExpoLocation.Accuracy.Balanced,
          distanceInterval: 10,
          timeInterval: 5000,
        },
        (loc) => {
          const next = {
            lat: loc.coords.latitude,
            lon: loc.coords.longitude,
          };
          setPos(next);
          const currentRoute = routeRef.current;
          const currentTarget = targetRef.current;
          if (
            modeRef.current === "turns" &&
            currentRoute &&
            currentTarget &&
            !reroutingRef.current &&
            isOffRoute(next, currentRoute.coords, OFF_ROUTE_M) &&
            Date.now() - lastRerouteRef.current > REROUTE_COOLDOWN_MS
          ) {
            lastRerouteRef.current = Date.now();
            setRerouting(true);
            fetchOsrmRoute(next, currentTarget)
              .then((fresh) => {
                setRoute(fresh);
                routeRef.current = fresh;
              })
              .catch(() => {
                // Rute lama tetap tampil; hitung ulang berikutnya
                // dicoba lagi saat posisi berubah cukup jauh.
              })
              .finally(() => setRerouting(false));
          }
        },
      );
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [phase]);

  // Sinkron peta WebView tanpa reload.
  useEffect(() => {
    if (!mapReady || !target) return;
    const routeCoords = route
      ? route.coords.map((c) => [c.lat, c.lon])
      : [];
    const js = `window.setDirection(${JSON.stringify(routeCoords)}, ${JSON.stringify(
      pos ? [pos.lat, pos.lon] : null,
    )}, ${JSON.stringify([target.lat, target.lon])}, ${mode === "turns" ? "true" : "false"}); true;`;
    webViewRef.current?.injectJavaScript(js);
  }, [mapReady, route, pos, target, mode]);

  const arrived =
    pos !== null && target !== null && haversineM(pos, target) < ARRIVED_M;
  const stepIndex =
    mode === "turns" && route && pos ? currentStepIndex(route, pos) : -1;
  const remaining =
    mode === "turns" && route && pos ? remainingDistanceM(route, pos) : null;
  const minutes =
    route !== null ? Math.max(1, Math.round(route.durationS / 60)) : 0;
  const errorMessage =
    phase === "no-position"
      ? t("direction.noPosition")
      : phase === "route-error"
        ? t("direction.routeError")
        : phase === "no-target"
          ? t("direction.noTarget")
          : null;
  const errorHint =
    phase === "no-position"
      ? t("direction.noPositionHint")
      : phase === "route-error"
        ? t("direction.routeErrorHint")
        : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.appbar}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          {...buttonAccessibility(t("tripDetail.backLabel"))}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text
          style={styles.appbarTitle}
          {...headingAccessibility(t("direction.title"))}
        >
          {t("direction.title")}
        </Text>
      </View>

      {target ? (
        <Text style={styles.targetText}>
          {t("direction.toTarget", { label: target.label })}
        </Text>
      ) : null}

      {phase === "locating" ? (
        <View>
          <Text style={styles.info}>{t("direction.locating")}</Text>
          {/* Perbaikan 4 Nov 2026: sebelumnya tombol coba lagi hanya
              muncul di fase error, jadi layar yang menggantung di
              "Mencari posisimu…" tidak bisa di-retry dari UI. */}
          <Pressable
            style={({ pressed }) => [
              styles.btn,
              pressed && styles.btnPressed,
            ]}
            onPress={run}
            {...buttonAccessibility(t("direction.retry"))}
          >
            <Text style={styles.btnText}>{t("direction.retry")}</Text>
          </Pressable>
        </View>
      ) : null}
      {phase === "routing" ? (
        <Text style={styles.info}>{t("direction.routeLoading")}</Text>
      ) : null}

      {errorMessage ? (
        <View style={styles.errBox} {...alertAccessibility(errorMessage)}>
          <Text style={styles.errText}>{errorMessage}</Text>
          {errorHint ? <Text style={styles.errHint}>{errorHint}</Text> : null}
          <Pressable
            style={({ pressed }) => [
              styles.btn,
              pressed && styles.btnPressed,
            ]}
            onPress={run}
            {...buttonAccessibility(t("direction.retry"))}
          >
            <Text style={styles.btnText}>{t("direction.retry")}</Text>
          </Pressable>
        </View>
      ) : null}

      {phase === "ready" || phase === "routing" ? (
        <>
          {/* Switcher mode — opsi UI terbaik untuk pilihan biner. */}
          <View style={styles.switcher}>
            <Pressable
              style={[
                styles.switchBtn,
                mode === "route" && styles.switchBtnActive,
              ]}
              onPress={() => setMode("route")}
              {...buttonAccessibility(t("direction.modeRoute"))}
            >
              <Text
                style={[
                  styles.switchText,
                  mode === "route" && styles.switchTextActive,
                ]}
              >
                {t("direction.modeRoute")}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.switchBtn,
                mode === "turns" && styles.switchBtnActive,
              ]}
              onPress={() => setMode("turns")}
              {...buttonAccessibility(t("direction.modeTurns"))}
            >
              <Text
                style={[
                  styles.switchText,
                  mode === "turns" && styles.switchTextActive,
                ]}
              >
                {t("direction.modeTurns")}
              </Text>
            </Pressable>
          </View>

          <WebView
            ref={webViewRef}
            style={styles.map}
            source={{
              html: directionMapHtml(
                target?.lat ?? -6.2,
                target?.lon ?? 106.8,
                14,
              ),
            }}
            onLoadEnd={() => setMapReady(true)}
          />

          {arrived ? (
            <View style={styles.arrivedBox}>
              <Text style={styles.arrivedText}>{t("direction.arrived")}</Text>
            </View>
          ) : null}
          {rerouting ? (
            <Text style={styles.info}>{t("direction.rerouting")}</Text>
          ) : null}

          {mode === "route" && route ? (
            <View style={styles.card}>
              <Text style={styles.cardLine}>
                {formatDistance(route.distanceM, sep)}
                {" · "}
                {t("direction.durationMin", { minutes: String(minutes) })}
              </Text>
            </View>
          ) : null}

          {mode === "turns" && route ? (
            <View style={styles.card}>
              <Text style={styles.stepsTitle}>
                {t("direction.stepsTitle")}
              </Text>
              {remaining !== null ? (
                <Text style={styles.remaining}>
                  {t("direction.remaining", {
                    distance: formatDistance(remaining, sep),
                  })}
                </Text>
              ) : null}
              {route.steps.map((step, i) => (
                <View
                  key={`${i}-${step.maneuver.type}`}
                  style={[
                    styles.stepRow,
                    i === stepIndex && styles.stepRowActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.stepText,
                      i === stepIndex && styles.stepTextActive,
                    ]}
                  >
                    {t(navStepKey(step.maneuver))}
                    {step.roadName ? ` · ${step.roadName}` : ""}
                    {" — "}
                    {formatDistance(step.distanceM, sep)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
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
    targetText: { fontSize: 14, fontWeight: "800", color: c.text, marginBottom: 10 },
    info: { fontSize: 13, color: c.text2, marginVertical: 10 },
    errBox: {
      backgroundColor: c.errBg,
      borderRadius: radii.md,
      paddingVertical: 11,
      paddingHorizontal: 14,
      marginBottom: 12,
      gap: 8,
    },
    errText: { color: c.stSosDark, fontSize: 13, fontWeight: "700" },
    errHint: { color: c.text2, fontSize: 12.5, lineHeight: 12.5 * 1.55 },
    btn: {
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radii.md,
      paddingVertical: 13,
      paddingHorizontal: 18,
      backgroundColor: c.primary,
    },
    btnPressed: { backgroundColor: c.primaryDark, transform: [{ scale: 0.985 }] },
    btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
    switcher: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 12,
    },
    switchBtn: {
      flex: 1,
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.md,
      paddingVertical: 11,
      backgroundColor: c.surface,
    },
    switchBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    switchText: { fontSize: 13, fontWeight: "800", color: c.text2 },
    switchTextActive: { color: "#fff" },
    map: { height: 380, borderRadius: radii.lg, overflow: "hidden" },
    arrivedBox: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.md,
      paddingVertical: 11,
      paddingHorizontal: 14,
      marginTop: 12,
    },
    arrivedText: { fontSize: 13, fontWeight: "800", color: c.text },
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.lg,
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginTop: 12,
      gap: 8,
    },
    cardLine: { fontSize: 14, fontWeight: "800", color: c.text },
    stepsTitle: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.1,
      color: c.text3,
    },
    remaining: { fontSize: 13, fontWeight: "700", color: c.text2 },
    stepRow: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.md,
      paddingVertical: 9,
      paddingHorizontal: 12,
    },
    stepRowActive: { borderColor: c.primary, backgroundColor: c.bg },
    stepText: { fontSize: 13, color: c.text2, lineHeight: 13 * 1.55 },
    stepTextActive: { color: c.text, fontWeight: "700" },
  });
