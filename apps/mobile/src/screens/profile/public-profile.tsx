// Layar Profil Publik — mockup data-screen="public-profile": appbar +
// tombol Laporkan, prof-head (avatar + nama + pill verified), kartu
// rating organizer (API ratings §13 belum ada -> 'Belum ada rating'),
// prof-stats, LENCANA TERBUKA (badge belum ada -> catatan), RIWAYAT
// TRIP SELESAI dari GET /users/:slug/profile.
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import { formatTripDate } from "@/utils/format-date";
import { nameInitial } from "@/utils/home-logic";
import {
  fetchPublicProfile,
  type PublicProfile,
} from "@/utils/public-profile-api";

export function PublicProfileScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      setProfile(await fetchPublicProfile(slug));
      setErrorKey(null);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.appbar}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          accessibilityLabel={t("common.back")}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t("publicProfile.title")}</Text>
        {/* .btn-report */}
        <Pressable
          style={styles.btnReport}
          onPress={() =>
            Alert.alert(t("app.name"), t("publicProfile.reportComingSoon"))
          }
        >
          <Text style={styles.btnReportText}>{t("publicProfile.report")}</Text>
        </Pressable>
      </View>

      {errorKey ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{t(errorKey)}</Text>
        </View>
      ) : null}

      {profile ? (
        <>
          {/* .prof-head */}
          <View style={styles.profHead}>
            <View style={styles.profAva}>
              <Text style={styles.profAvaText}>
                {nameInitial(profile.name)}
              </Text>
            </View>
            <Text style={styles.profName}>{profile.name}</Text>
            {profile.isVerified ? (
              <View style={styles.verifiedPill}>
                <Text style={styles.verifiedPillText}>
                  {t("publicProfile.verified")}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Rating organizer — API §13 belum ada */}
          <View style={[styles.teambox, styles.center]}>
            <Text style={styles.ratingValue}>
              {t("publicProfile.ratingEmpty")}
            </Text>
            <Text style={styles.ratingLabel}>
              {t("publicProfile.ratingLabel")}
            </Text>
          </View>

          {/* .prof-stats */}
          <View style={styles.profStats}>
            <View style={styles.profStat}>
              <Text style={styles.statVl}>{profile.stats.totalTrips}</Text>
              <Text style={styles.statLb}>{t("publicProfile.statTrips")}</Text>
            </View>
            <View style={styles.profStat}>
              <Text style={styles.statVl}>{profile.stats.finishedTrips}</Text>
              <Text style={styles.statLb}>
                {t("publicProfile.statFinished")}
              </Text>
            </View>
          </View>

          {/* LENCANA TERBUKA */}
          <Text style={styles.secTitle}>{t("publicProfile.badgesTitle")}</Text>
          <View style={styles.teambox}>
            <Text style={styles.emptyText}>
              {t("publicProfile.badgesEmpty")}
            </Text>
          </View>

          {/* RIWAYAT TRIP SELESAI */}
          <Text style={styles.secTitle}>{t("publicProfile.historyTitle")}</Text>
          <View style={styles.teambox}>
            {profile.finishedTrips.length > 0 ? (
              profile.finishedTrips.map((trip, index) => (
                <View
                  key={trip.id}
                  style={[
                    styles.historyRow,
                    index === profile.finishedTrips.length - 1 &&
                      styles.historyRowLast,
                  ]}
                >
                  <Text style={styles.historyName}>{trip.name}</Text>
                  <Text style={styles.historyDate}>
                    {formatTripDate(trip.date)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>
                {t("publicProfile.historyEmpty")}
              </Text>
            )}
          </View>
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
  btnReport: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.errBg,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
  },
  btnReportText: { fontSize: 12, fontWeight: "800", color: c.stSosDark },
  errBox: {
    backgroundColor: c.errBg,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  errText: { color: c.stSosDark, fontSize: 13, fontWeight: "700" },
  profHead: { alignItems: "center", paddingTop: 12 },
  profAva: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: c.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: c.surface,
    ...shadowCard,
  },
  profAvaText: { color: "#fff", fontSize: 30, fontWeight: "800" },
  profName: {
    fontSize: 19,
    fontWeight: "800",
    color: c.text,
    marginTop: 11,
  },
  verifiedPill: {
    backgroundColor: c.successBg,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    marginTop: 9,
  },
  verifiedPillText: { fontSize: 12, fontWeight: "800", color: c.success },
  teambox: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 14,
    ...shadowCard,
  },
  center: { alignItems: "center" },
  ratingValue: { fontSize: 14, fontWeight: "800", color: c.text },
  ratingLabel: { fontSize: 12, color: c.text2, marginTop: 5 },
  profStats: { flexDirection: "row", gap: 11, marginTop: 14 },
  profStat: {
    flex: 1,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 13,
    paddingHorizontal: 10,
    alignItems: "center",
    ...shadowCard,
  },
  statVl: { fontSize: 19, fontWeight: "800", color: c.text },
  statLb: {
    fontSize: 11,
    fontWeight: "700",
    color: c.text2,
    marginTop: 4,
  },
  secTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: c.text3,
    marginTop: 18,
    marginBottom: -4,
  },
  emptyText: { fontSize: 12.5, color: c.text3 },
  historyRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderBottomColor: c.line,
  },
  historyRowLast: { borderBottomWidth: 0 },
  historyName: { fontSize: 13.5, fontWeight: "700", color: c.text },
  historyDate: { fontSize: 11.5, color: c.text3, marginTop: 2 },
});
