// Layar Jelajahi — mockup data-screen="explore"
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, RefreshControl } from "react-native";
import { router } from "expo-router";

import { TripCard } from "@/components/TripCard";
import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { fetchMyTrips, type Trip } from "@/utils/trips-api";

export function ExploreScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await fetchMyTrips();
      // Jelajahi = trip open/publik yang belum ditutup (mockup: "Trip
      // public terdekat"); GET /trip-groups sudah menyertakan open trip
      // non-member (db.listTripsForUser).
      setTrips(list.filter((x) => x.isOpenTrip && x.status !== "CLOSED"));
    } catch {
      setTrips([]);
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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <View style={styles.appbar}>
        <Text style={styles.appbarTitle}>{t("screens.explore")}</Text>
        <View style={styles.locationBadge}>
          <Text style={styles.locationText}>{t("explore.location")}</Text>
        </View>
      </View>
      <Text style={styles.subtitle}>{t("explore.subtitle")}</Text>

      <Pressable
        style={styles.mountainsCard}
        onPress={() => router.push("/mountains")}
      >
        <Text style={styles.mountainsTitle}>{t("mountains.title")}</Text>
        <Text style={styles.mountainsDesc}>{t("mountains.subtitle")}</Text>
      </Pressable>

      {trips.length > 0 ? (
        trips.map((trip) => (
          <TripCard
            key={trip.id}
            trip={trip}
            memberCount={null}
            statusLabelKey="home.tripStatus"
            onPress={() => router.push(`/trips/${trip.id}`)}
          />
        ))
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t("explore.emptyTitle")}</Text>
          <Text style={styles.emptyDesc}>{t("explore.emptyNote")}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 96 },
  appbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 6,
  },
  appbarTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: c.text,
  },
  locationBadge: {
    backgroundColor: c.surface2,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  locationText: {
    fontSize: 11,
    fontWeight: "700",
    color: c.text2,
  },
  subtitle: {
    fontSize: 13,
    color: c.text2,
    marginBottom: 12,
  },
  mountainsCard: {
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.line,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 12,
    ...shadowCard,
  },
  mountainsTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: c.text,
  },
  mountainsDesc: {
    fontSize: 12,
    color: c.text2,
    marginTop: 2,
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
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 12.5,
    color: c.text3,
  },
});
