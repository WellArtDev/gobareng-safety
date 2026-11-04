// Layar beranda — mockup data-screen="home". Kerangka persis HTML:
// brandbar logo, greet (ava+sapaan+bell), kartu trip utama, tombol
// Mulai Trip, teambox TIM TRIP INI, "TRIP SAYA LAINNYA" + kartu
// expired + tombol nonaktif + catatan. Data dari API live.
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";

import { TripCard } from "@/components/TripCard";
import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import {
  greetingAccessibilityLabel,
  greetingKey,
  nameInitial,
  pickHomeTrips,
  profileWarning,
  type ProfileWarning,
} from "@/utils/home-logic";
import { fetchMe } from "@/utils/profile-api";
import { fetchEmergencyContacts } from "@/utils/emergency-contacts-api";
import { getSessionName } from "@/utils/session-token";
import { pickPaidTrips, pickPublicTrips, pickWeatherCoords } from "@/utils/home-sections";
import { fetchCurrentWeather, type WeatherResult } from "@/utils/weather-api";
import { formatRupiah } from "@/utils/create-trip-logic";
import { useAccessibilityAnnouncement } from "@/hooks/use-accessibility-announcement";
import {
  alertAccessibility,
  buttonAccessibility,
  decorativeAccessibility,
  headingAccessibility,
} from "@/utils/accessibility";
import {
  fetchMyTrips,
  fetchTripMembers,
  startTrip,
  type Trip,
  type TripMember,
  type TripRole,
} from "@/utils/trips-api";

const ROLE_LABEL_KEYS: Record<TripRole, string> = {
  LEADER: "home.roleLeader",
  MEMBER: "home.roleMember",
  SWEEPER: "home.roleSweeper",
  MEDIC: "home.roleMedic",
};

// Baris cuaca kartu trip utama — fail-soft penuh: tanpa koordinat
// atau cuaca gagal dimuat, baris ini hilang total (bukan placeholder
// rusak). Cuaca = kondisi SAAT INI di lokasi trip via endpoint
// /weather/current yang sudah ada (BMKG untuk Indonesia, Open-Meteo
// di luar) — bukan prakiraan per tanggal trip, karena endpoint
// prakiraan per tanggal belum ada di server.
function HomeWeatherRow({ trip }: { trip: Trip }) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const coords = pickWeatherCoords(trip);
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  useEffect(() => {
    if (!coords) return;
    let active = true;
    fetchCurrentWeather(coords.lat, coords.lon).then((w) => {
      if (active) setWeather(w);
    });
    return () => {
      active = false;
    };
  }, [coords?.lat, coords?.lon]);
  const current = weather?.weather;
  if (!coords || !current) return null;
  return (
    <View style={styles.weatherBox}>
      <Text style={styles.weatherTitle}>{t("home.weatherTitle")}</Text>
      <Text style={styles.weatherMain}>
        {current.temperatureC !== null ? `${current.temperatureC}°C` : "—"}
        {current.description ? ` · ${current.description}` : ""}
      </Text>
      <Text style={styles.weatherSub}>
        {t("weather.source")}:{" "}
        {weather.provider === "bmkg" ? "BMKG" : "Open-Meteo"}
        {current.windSpeedKmh !== null
          ? ` · ${t("weather.wind")} ${current.windSpeedKmh} km/j`
          : ""}
      </Text>
    </View>
  );
}

const roleDotColors = (c: ThemeColors): Record<TripRole, string> => ({
  LEADER: c.stLeader,
  MEMBER: c.stMember,
  SWEEPER: c.stSweeper,
  MEDIC: c.surface,
});

export function HomeScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);
  // Banner profil (2 Nov 2026): fail-soft — gagal memuat = sembunyi,
  // bukan banner palsu. "none" juga dipakai saat belum dimuat.
  const [warning, setWarning] = useState<ProfileWarning>("none");

  const load = useCallback(async () => {
    try {
      const list = await fetchMyTrips();
      setTrips(list);
      setErrorKey(null);
      const { primary } = pickHomeTrips(list);
      if (primary) {
        setMembers(await fetchTripMembers(primary.id).catch(() => []));
      } else {
        setMembers([]);
      }
      // Profil + kontak darurat (DATA DARURAT yang sudah ada) untuk
      // banner peringatan; gagal memuat salah satu = banner sembunyi.
      const [me, contacts] = await Promise.all([
        fetchMe().catch(() => null),
        fetchEmergencyContacts().catch(() => null),
      ]);
      if (me && contacts) {
        setWarning(profileWarning(me.phone, contacts.length));
      } else {
        setWarning("none");
      }
    } catch (error) {
      if (error instanceof ApiError && error.i18nKey === "errors.unauthorized") {
        router.replace("/login");
        return;
      }
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
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

  const { primary, others } = pickHomeTrips(trips);
  // Seksi discovery: dari daftar yang sama (member + open trip).
  // Trip utama dikeluarkan supaya tidak tampil ganda; trip expired
  // sudah tersaring di dalam pick* (semantik trip-dates.ts).
  const paidTrips = pickPaidTrips(trips, new Date(), primary?.id);
  const publicTrips = pickPublicTrips(trips, new Date(), primary?.id);
  const name = getSessionName() ?? "";
  const greeting = t(greetingKey(new Date().getHours()));
  const errorMessage = errorKey ? t(errorKey) : null;
  useAccessibilityAnnouncement(errorMessage);

  const onStart = async () => {
    if (!primary || starting) return;
    setStarting(true);
    try {
      await startTrip(primary.id);
      await load();
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      {/* .brandbar */}
      <View style={styles.brandbar}>
        <Image
          source={require("@/assets/logo.svg")}
          style={styles.appLogo}
          contentFit="contain"
          {...decorativeAccessibility}
        />
      </View>

      {/* .greet */}
      <View style={styles.greet}>
        <View style={styles.ava}>
          <Text style={styles.avaText}>{nameInitial(name)}</Text>
        </View>
        <View
          {...headingAccessibility(
            greetingAccessibilityLabel(greeting, name),
          )}
        >
          <Text style={styles.greetSmall}>
            {greeting}
          </Text>
          <Text style={styles.greetName}>{name}</Text>
        </View>
        <Pressable
          style={styles.bell}
          onPress={() => router.push("/notif")}
          {...buttonAccessibility(t("home.bellLabel"))}
        >
          <Image
            source={require("@/assets/icons/bell.svg")}
            style={styles.bellIcon}
            tintColor={colors.text2}
            {...decorativeAccessibility}
          />
        </Pressable>
        <Pressable
          style={styles.bell}
          onPress={() => router.push("/glimmer")}
          {...buttonAccessibility(t("home.glimmerLabel"))}
        >
          <Text style={styles.glimmerIcon}>✦</Text>
        </Pressable>
      </View>

      {errorKey ? (
        <View style={styles.errBox} {...alertAccessibility(errorMessage!)}>
          <Text style={styles.errText}>{errorMessage}</Text>
        </View>
      ) : null}

      {/* Banner peringatan profil (2 Nov 2026): PERSISTEN selama HP
          dan/atau kontak darurat kosong; hilang hanya bila keduanya
          terisi. Ketuk -> Isi Data Profil bila HP kosong (perbaiki HP
          dulu, karena HP juga syarat buat trip); bila hanya kontak
          darurat yang kosong -> Profil (bagian DATA DARURAT). */}
      {warning !== "none" ? (
        <Pressable
          style={styles.warnBox}
          onPress={() =>
            router.push(warning === "contacts" ? "/profile" : "/profile-data")
          }
          {...buttonAccessibility(
            t(
              warning === "both"
                ? "home.profileWarnBoth"
                : warning === "phone"
                  ? "home.profileWarnPhone"
                  : "home.profileWarnContacts",
            ),
          )}
        >
          <Text style={styles.warnText}>
            {t(
              warning === "both"
                ? "home.profileWarnBoth"
                : warning === "phone"
                  ? "home.profileWarnPhone"
                  : "home.profileWarnContacts",
            )}
          </Text>
        </Pressable>
      ) : null}

      {primary ? (
        <>
          <TripCard
            trip={primary}
            memberCount={members.length > 0 ? members.length : null}
            statusLabelKey="home.yourStatus"
            onPress={() => router.push(`/trips/${primary.id}`)}
          />

          <HomeWeatherRow trip={primary} />

          <View style={styles.gap14} />
          {/* .btn-depart */}
          <Pressable
            style={({ pressed }) => [
              styles.btnDepart,
              pressed && styles.btnDepartPressed,
              primary.status !== "PLANNED" && styles.btnDepartDisabled,
            ]}
            onPress={onStart}
            disabled={primary.status !== "PLANNED" || starting}
            {...buttonAccessibility(t("home.startTrip"), {
              busy: starting,
              disabled: primary.status !== "PLANNED" || starting,
            })}
          >
            <Image
              source={require("@/assets/icons/play.svg")}
              style={styles.playIcon}
              tintColor="#fff"
              {...decorativeAccessibility}
            />
            <Text style={styles.btnDepartText}>{t("home.startTrip")}</Text>
          </Pressable>

          {members.length > 0 ? (
            <View style={styles.teambox}>
              <Text style={styles.teamTitle}>{t("home.teamTitle")}</Text>
              {members.map((m, index) => (
                <View
                  key={m.userId}
                  style={[
                    styles.member,
                    index === members.length - 1 && styles.memberLast,
                  ]}
                >
                  <View
                    style={[
                      styles.mdot,
                      { backgroundColor: roleDotColors(colors)[m.role] },
                      m.role === "MEDIC" && styles.mdotMedic,
                    ]}
                  />
                  <Text style={styles.memberName}>{m.user.name}</Text>
                  <Text style={styles.memberRole}>
                    {t(ROLE_LABEL_KEYS[m.role])}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.teambox}>
          <Text style={styles.emptyTitle}>{t("home.emptyTitle")}</Text>
          <Text style={styles.emptyNote}>{t("home.emptyNote")}</Text>
        </View>
      )}

      {others.length > 0 ? (
        <>
          <Text
            style={styles.secTitle}
            {...headingAccessibility(t("home.otherTrips"))}
          >
            {t("home.otherTrips")}
          </Text>
          {others.map((trip) => {
            const expired = trip.status === "CLOSED";
            return (
              <View key={trip.id}>
                <TripCard
                  trip={trip}
                  memberCount={null}
                  statusLabelKey="home.tripStatus"
                  onPress={() => router.push(`/trips/${trip.id}`)}
                />
                {expired ? (
                  <>
                    <View style={styles.gap12} />
                    <View
                      style={[styles.btnDepart, styles.btnDepartDisabled]}
                      {...buttonAccessibility(t("home.startTrip"), {
                        disabled: true,
                      })}
                    >
                      <Image
                        source={require("@/assets/icons/play.svg")}
                        style={styles.playIcon}
                        tintColor="#fff"
                        {...decorativeAccessibility}
                      />
                      <Text style={styles.btnDepartText}>
                        {t("home.startTrip")}
                      </Text>
                    </View>
                    <Text style={styles.expiredNote}>
                      {t("home.expiredNote")}
                    </Text>
                  </>
                ) : null}
              </View>
            );
          })}
        </>
      ) : null}

      {paidTrips.length > 0 ? (
        <>
          <Text
            style={styles.secTitle}
            {...headingAccessibility(t("home.paidTripsTitle"))}
          >
            {t("home.paidTripsTitle")}
          </Text>
          {paidTrips.map((trip) => (
            <View key={trip.id}>
              <TripCard
                trip={trip}
                memberCount={null}
                statusLabelKey="home.tripStatus"
                onPress={() => router.push(`/trips/${trip.id}`)}
              />
              <Text style={styles.priceText}>
                {formatRupiah(trip.price ?? 0)} {t("home.perPerson")}
              </Text>
            </View>
          ))}
        </>
      ) : null}

      {publicTrips.length > 0 ? (
        <>
          <Text
            style={styles.secTitle}
            {...headingAccessibility(t("home.publicTripsTitle"))}
          >
            {t("home.publicTripsTitle")}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContent}
          >
            {publicTrips.map((trip) => (
              <View key={trip.id} style={styles.carouselCard}>
                <TripCard
                  trip={trip}
                  memberCount={null}
                  statusLabelKey="home.tripStatus"
                  onPress={() => router.push(`/trips/${trip.id}`)}
                />
              </View>
            ))}
          </ScrollView>
        </>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  // .screen padding 6 20 96 (96 = ruang bottomnav)
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 96 },
  // .brandbar + .app-logo
  brandbar: { alignItems: "center", paddingTop: 4, paddingBottom: 2 },
  appLogo: { height: 46, width: 46 * (953.36 / 789.6) },
  // .greet
  greet: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  ava: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avaText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  greetSmall: { fontSize: 12, color: c.text2, fontWeight: "600" },
  greetName: { fontSize: 16, fontWeight: "800", color: c.text },
  bell: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
  bellIcon: { width: 19, height: 19 },
  glimmerIcon: { color: c.text2, fontSize: 19, fontWeight: "800" },
  errBox: {
    backgroundColor: c.errBg,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  warnBox: {
    backgroundColor: c.warningBg,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  warnText: {
    color: c.warning,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 13 * 1.55,
  },
  errText: {
    color: c.stSosDark,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 13 * 1.5,
  },
  gap14: { height: 14 },
  gap12: { height: 12 },
  // .btn-depart (sama dengan .btn-auth)
  btnDepart: {
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
  btnDepartPressed: {
    backgroundColor: c.primaryDark,
    transform: [{ scale: 0.985 }],
  },
  btnDepartDisabled: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
  btnDepartText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  playIcon: { width: 20, height: 20 },
  // .teambox
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
  teamTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: c.text3,
    marginBottom: 8,
  },
  // .member
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
  // .sec-title
  secTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: c.text3,
    marginTop: 20,
    marginBottom: 10 - 14, // TripCard punya marginTop 14
  },
  // .expired-note
  expiredNote: {
    fontSize: 12,
    color: c.text3,
    lineHeight: 12 * 1.55,
    marginTop: 9,
    textAlign: "center",
  },
  emptyTitle: { fontSize: 14, fontWeight: "800", color: c.text },
  emptyNote: { fontSize: 12.5, color: c.text2, marginTop: 4 },
  // .weather-box (baris cuaca kartu utama)
  weatherBox: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 14,
    ...shadowCard,
  },
  weatherTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: c.text3,
    marginBottom: 4,
  },
  weatherMain: { fontSize: 17, fontWeight: "800", color: c.text },
  weatherSub: { fontSize: 12, color: c.text2, marginTop: 2 },
  priceText: {
    fontSize: 13,
    fontWeight: "800",
    color: c.primary,
    marginTop: 6,
  },
  carouselContent: { paddingBottom: 4 },
  carouselCard: { width: 280, marginRight: 12 },
});
