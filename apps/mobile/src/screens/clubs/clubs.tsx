// Layar Komunitas — daftar dari API §12 (GET /communities).
// Data contoh hardcode dihapus 3 Nov 2026: daftar kosong berarti
// memang belum ada komunitas, bukan dialihkan ke data contoh.
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import {
  fetchCommunities,
  type CommunitySummary,
} from "@/utils/communities-api";

export function ClubsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [clubs, setClubs] = useState<CommunitySummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchCommunities()
      .then((list) => {
        if (alive) setClubs(list);
      })
      .catch(() => {
        if (alive) {
          setClubs([]);
          setFailed(true);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.appbar}>
        <Text style={styles.appbarTitle}>{t("clubs.title")}</Text>
      </View>
      <Text style={styles.subtitle}>{t("clubs.subtitle")}</Text>

      {clubs === null ? (
        <ActivityIndicator style={styles.loading} />
      ) : failed ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t("errors.unavailable")}</Text>
        </View>
      ) : clubs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t("clubs.empty")}</Text>
        </View>
      ) : (
        clubs.map((club) => (
          <Pressable
            key={club.id}
            style={styles.card}
            onPress={() => router.push(`/clubs/${club.id}`)}
          >
            <View style={styles.iconWrap}>
              <Text style={styles.iconText}>{club.name[0]}</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.name}>{club.name}</Text>
              <Text style={styles.meta}>
                {club.memberCount} {t("clubs.membersSuffix")}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 96 },
  appbar: { paddingTop: 8, paddingBottom: 6 },
  appbarTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: c.text,
  },
  subtitle: {
    fontSize: 13,
    color: c.text2,
    marginBottom: 14,
  },
  loading: { marginTop: 24 },
  emptyCard: {
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.line,
    borderRadius: radii.lg,
    padding: 16,
    ...shadowCard,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: c.text2,
    textAlign: "center",
  },
  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.line,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 12,
    ...shadowCard,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: c.surface2,
  },
  iconText: {
    fontSize: 18,
    fontWeight: "800",
    color: c.primary,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  name: {
    fontSize: 15,
    fontWeight: "800",
    color: c.text,
    flex: 1,
  },
  meta: {
    fontSize: 12,
    fontWeight: "600",
    color: c.text3,
    marginTop: 2,
  },
});
