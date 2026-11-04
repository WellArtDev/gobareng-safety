// Detail gunung — dari API (§10): info gunung + daftar jalur
// pendakiannya (basecamp, jarak, elevasi, estimasi).
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import {
  fetchMountain,
  type MountainDetail,
} from "@/utils/mountains-api";
import {
  hasMountainDescription,
  hasMountainProvince,
  mountainPhotoUri,
  mountainRouteCount,
} from "@/utils/mountain-photo";

export function MountainDetailScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [mountain, setMountain] = useState<MountainDetail | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setMountain(await fetchMountain(id));
    } catch {
      setMountain(null);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

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

      {!mountain ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t("mountains.notFound")}</Text>
        </View>
      ) : (
        <>
          {/* Foto header: foto API bila ada, kotak huruf fallback
              bila belum ada foto (kebanyakan gunung belum punya). */}
          {mountainPhotoUri(mountain.imageUrl) ? (
            <Image
              source={{ uri: mountainPhotoUri(mountain.imageUrl)! }}
              style={styles.headerPhoto}
              contentFit="cover"
              accessibilityLabel={mountain.name}
            />
          ) : (
            <View style={styles.headerFallback}>
              <Text style={styles.headerFallbackText}>
                {mountain.name[0]}
              </Text>
            </View>
          )}

          <Text style={styles.title}>{mountain.name}</Text>
          <Text style={styles.meta}>
            {mountain.location} • {mountain.elevationM} m •{" "}
            {t(mountain.difficultyKey)}
          </Text>

          {/* Blok info — hanya dari field yang sudah dikirim API.
              Baris kosong tidak dirender; deskripsi kosong tidak
              pernah diganti karangan. */}
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>{t("mountains.info")}</Text>
            {hasMountainProvince(mountain.province) ? (
              <Text style={styles.infoRow}>
                {t("mountains.province")}: {mountain.province.trim()}
              </Text>
            ) : null}
            <Text style={styles.infoRow}>
              {t("mountains.location")}: {mountain.location}
            </Text>
            <Text style={styles.infoRow}>
              {t("mountains.elevation")}: {mountain.elevationM} m •{" "}
              {t(mountain.difficultyKey)}
            </Text>
            {mountain.volcanoActive ? (
              <Text style={styles.infoRow}>
                {t("mountains.volcanoActive")}
              </Text>
            ) : null}
            {hasMountainDescription(mountain.description) ? (
              <Text style={styles.infoDesc}>
                {mountain.description!.trim()}
              </Text>
            ) : null}
            <Text style={styles.infoRow}>
              {mountainRouteCount(mountain.routeCount, mountain.routes)}{" "}
              {t("mountains.routes")}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>{t("mountains.routes")}</Text>
          {mountain.routes.map((route) => (
            <Pressable
              key={route.id}
              style={styles.card}
              onPress={() =>
                router.push(`/mountains/${mountain.id}/routes/${route.id}`)
              }
              accessibilityLabel={route.name}
            >
              <View style={styles.row}>
                <Text style={styles.name}>{route.name}</Text>
                {route.recommended ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {t("mountains.recommended")}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.meta}>
                {t("mountains.meetingPoint")}: {route.meetingPoint}
              </Text>
              <Text style={styles.meta}>
                {t("mountains.distance")}: {route.distanceKm ?? "—"} km •{" "}
                {t("mountains.gain")}: {route.gainM ?? "—"} m •{" "}
                {t("mountains.duration")}: {route.estHours ?? "—"}{" "}
                {t("mountains.hours")}
              </Text>
            </Pressable>
          ))}
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
    headerPhoto: {
      width: "100%",
      height: 200,
      borderRadius: radii.lg,
      marginTop: 4,
    },
    headerFallback: {
      width: "100%",
      height: 200,
      borderRadius: radii.lg,
      marginTop: 4,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface2,
    },
    headerFallbackText: {
      fontSize: 56,
      fontWeight: "800",
      color: c.text,
    },
    infoCard: {
      backgroundColor: c.surface,
      borderWidth: 1.5,
      borderColor: c.line,
      borderRadius: radii.lg,
      padding: 14,
      marginTop: 16,
      ...shadowCard,
    },
    infoTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: c.text,
      marginBottom: 8,
    },
    infoRow: {
      fontSize: 13,
      color: c.text2,
      marginTop: 4,
    },
    infoDesc: {
      fontSize: 13,
      color: c.text,
      marginTop: 8,
    },
    title: {
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.4,
      color: c.text,
      marginTop: 12,
    },
    meta: {
      fontSize: 13,
      color: c.text2,
      marginTop: 4,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: c.text,
      marginTop: 20,
      marginBottom: 10,
    },
    card: {
      backgroundColor: c.surface,
      borderWidth: 1.5,
      borderColor: c.line,
      borderRadius: radii.lg,
      padding: 14,
      marginBottom: 12,
      ...shadowCard,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    name: {
      fontSize: 15,
      fontWeight: "800",
      color: c.text,
    },
    badge: {
      backgroundColor: c.surface2,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: radii.pill,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: c.text2,
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
  });
