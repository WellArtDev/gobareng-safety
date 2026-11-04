// Menu Trip — keputusan Wella 28 Okt 2026: tab Trip berisi daftar kartu
// trip (diikuti + selesai). Klik kartu -> detail trip; tracking dimulai
// dari detail, bukan langsung dari nav. Kartu memakai TripCard mockup.
import { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { TripCard } from "@/components/TripCard";
import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import { splitTripList } from "@/utils/trip-list-logic";
import { fetchMyTrips, type Trip } from "@/utils/trips-api";
import { alertAccessibility, headingAccessibility } from "@/utils/accessibility";
import { useAccessibilityAnnouncement } from "@/hooks/use-accessibility-announcement";

export function TripListScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      setTrips(await fetchMyTrips());
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

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const { ongoing, finished } = splitTripList(trips);
  const errorMessage = errorKey ? t(errorKey) : null;
  useAccessibilityAnnouncement(errorMessage);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <View style={styles.appbar}>
        <Text
          style={styles.appbarTitle}
          {...headingAccessibility(t("tripList.title"))}
        >
          {t("tripList.title")}
        </Text>
      </View>

      {errorKey ? (
        <View style={styles.errBox} {...alertAccessibility(errorMessage!)}>
          <Text style={styles.errText}>{errorMessage}</Text>
        </View>
      ) : null}

      {loaded && trips.length === 0 && !errorKey ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{t("tripList.empty")}</Text>
        </View>
      ) : null}

      {ongoing.length > 0 ? (
        <>
          <Text
            style={styles.secTitle}
            {...headingAccessibility(t("tripList.ongoingTitle"))}
          >
            {t("tripList.ongoingTitle")}
          </Text>
          {ongoing.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              memberCount={null}
              statusLabelKey="home.tripStatus"
              onPress={() => router.push(`/trips/${trip.id}`)}
            />
          ))}
        </>
      ) : null}

      {finished.length > 0 ? (
        <>
          <Text
            style={styles.secTitle}
            {...headingAccessibility(t("tripList.finishedTitle"))}
          >
            {t("tripList.finishedTitle")}
          </Text>
          {finished.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              memberCount={null}
              statusLabelKey="home.tripStatus"
              onPress={() => router.push(`/trips/${trip.id}`)}
            />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 96 },
  appbar: { paddingTop: 8, paddingBottom: 10 },
  appbarTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: c.text,
  },
  errBox: {
    backgroundColor: c.errBg,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  errText: { color: c.stSosDark, fontSize: 13, fontWeight: "700" },
  emptyBox: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    padding: 16,
    marginTop: 8,
    ...shadowCard,
  },
  emptyText: { fontSize: 12.5, color: c.text2, lineHeight: 12.5 * 1.55 },
  secTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: c.text3,
    marginTop: 20,
    marginBottom: -4,
  },
});
