// Detail jalur — cermin layar web (modal Lihat Jalur dashboard
// admin): header gunung + nama jalur, chips jarak/gain/estimasi,
// peta Leaflet (WebView) berisi garis jalur + marker checkpoint
// berwarna per jenis + legenda, dan daftar checkpoint bernomor.
// Data dari endpoint yang sama dengan web
// (GET /mountains/:id/routes/:routeId, tanpa perubahan API).
//
// Penyimpangan sadar dari web: web MENYEMBUNYIKAN peta sepenuhnya
// bila tidak ada track; mobile tetap menampilkan peta marker-only
// (garis fallback lewat checkpoint) plus catatan no-track — supaya
// checkpoint berkoordinat tetap terlihat di HP.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import {
  buildRouteCheckpointRows,
  checkpointMarkerColor,
  type CheckpointKind,
} from "@/utils/route-checkpoint-kind";
import { routeDetailMapHtml } from "@/utils/route-detail-map-html";
import {
  fetchMountain,
  fetchMountainRoute,
  type MountainRouteDetail,
} from "@/utils/mountains-api";

function kindKey(kind: CheckpointKind): string {
  return kind === "peak"
    ? "mountains.routeKindPeak"
    : kind === "camp"
      ? "mountains.routeKindCamp"
      : "mountains.routeKindPost";
}

export function RouteDetailScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { id, routeId } = useLocalSearchParams<{
    id: string;
    routeId: string;
  }>();
  const [route, setRoute] = useState<MountainRouteDetail | null>(null);
  const [mountainName, setMountainName] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!id || !routeId) {
      setFailed(true);
      return;
    }
    try {
      setRoute(await fetchMountainRoute(id, routeId));
    } catch {
      setFailed(true);
    }
    // Nama gunung untuk header: gagal dimuat = header hanya nama
    // jalur (fail-soft, bukan gagal total).
    try {
      setMountainName((await fetchMountain(id)).name);
    } catch {
      setMountainName(null);
    }
  }, [id, routeId]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () =>
      route ? buildRouteCheckpointRows(route.posts, route.checkpoints) : [],
    [route],
  );
  const hasMap = !!route && (route.track !== null || route.checkpoints.length > 0);
  const mapHtml = useMemo(
    () =>
      route
        ? routeDetailMapHtml({
            track: route.track,
            checkpoints: route.checkpoints,
            labels: {
              post: t("mountains.routeKindPost"),
              camp: t("mountains.routeKindCamp"),
              peak: t("mountains.routeKindPeak"),
            },
          })
        : null,
    [route, t],
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable
        style={styles.back}
        onPress={() => router.back()}
        accessibilityLabel={t("common.back")}
      >
        <Text style={styles.backGlyph}>‹</Text>
        <Text style={styles.backText}>{t("common.back")}</Text>
      </Pressable>

      {failed ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t("mountains.routeNotFound")}</Text>
        </View>
      ) : !route ? (
        <Text style={styles.meta}>{t("mountains.routeLoading")}</Text>
      ) : (
        <>
          {mountainName ? (
            <Text style={styles.subtitle}>{mountainName}</Text>
          ) : null}
          <Text style={styles.title}>{route.name}</Text>
          <Text style={styles.meta}>
            {t("mountains.distance")}: {route.distanceKm ?? "—"} km •{" "}
            {t("mountains.gain")}: {route.gainM ?? "—"} m •{" "}
            {t("mountains.duration")}: {route.estHours ?? "—"}{" "}
            {t("mountains.hours")}
          </Text>

          {hasMap && mapHtml ? (
            <WebView
              style={styles.map}
              source={{ html: mapHtml }}
            />
          ) : null}
          {route.track === null ? (
            <Text style={styles.note}>{t("mountains.routeNoTrack")}</Text>
          ) : null}

          <Text style={styles.sectionTitle}>
            {t("mountains.routeCheckpoints")}
          </Text>
          {rows.length === 0 ? (
            <Text style={styles.meta}>
              {t("mountains.routeNoCheckpoints")}
            </Text>
          ) : (
            rows.map((row, i) => (
              <View key={`${row.name}-${i}`} style={styles.rowCard}>
                <View style={styles.rowHead}>
                  <Text style={styles.num}>{i + 1}</Text>
                  <View style={styles.rowMain}>
                    <Text style={styles.name}>{row.name}</Text>
                    <Text style={styles.meta}>
                      {row.checkpoint?.elevationM != null
                        ? `${row.checkpoint.elevationM} m`
                        : "—"}
                    </Text>
                  </View>
                </View>
                <View style={styles.pills}>
                  <View style={styles.pill}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: checkpointMarkerColor(row.kind) },
                      ]}
                    />
                    <Text style={styles.pillText}>{t(kindKey(row.kind))}</Text>
                  </View>
                  {row.checkpoint?.autoCheckpoint ? (
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>
                        {t("mountains.routeAuto")}
                      </Text>
                    </View>
                  ) : null}
                  {row.checkpoint?.isTarget ? (
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>
                        {t("mountains.routeTarget")}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 96 },
    back: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 8,
    },
    backGlyph: {
      fontSize: 22,
      color: c.text2,
    },
    backText: {
      fontSize: 13,
      fontWeight: "700",
      color: c.text2,
    },
    subtitle: {
      fontSize: 13,
      fontWeight: "700",
      color: c.text2,
      marginTop: 4,
    },
    title: {
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.4,
      color: c.text,
      marginTop: 4,
    },
    meta: {
      fontSize: 13,
      color: c.text2,
      marginTop: 4,
    },
    note: {
      fontSize: 13,
      color: c.text2,
      marginTop: 8,
      fontStyle: "italic",
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: c.text,
      marginTop: 20,
      marginBottom: 10,
    },
    map: {
      height: 280,
      marginTop: 16,
      borderRadius: radii.lg,
      overflow: "hidden",
    },
    emptyCard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.lg,
      padding: 24,
      alignItems: "center",
      marginTop: 12,
      ...shadowCard,
    },
    emptyTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: c.text,
    },
    rowCard: {
      backgroundColor: c.surface,
      borderWidth: 1.5,
      borderColor: c.line,
      borderRadius: radii.lg,
      padding: 14,
      marginBottom: 12,
      ...shadowCard,
    },
    rowHead: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    num: {
      fontSize: 13,
      fontWeight: "800",
      color: c.text2,
      width: 22,
      textAlign: "center",
    },
    rowMain: { flex: 1 },
    name: {
      fontSize: 15,
      fontWeight: "800",
      color: c.text,
    },
    pills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 8,
      marginLeft: 32,
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: c.surface2,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: radii.pill,
    },
    pillText: {
      fontSize: 11,
      fontWeight: "700",
      color: c.text2,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
  });
