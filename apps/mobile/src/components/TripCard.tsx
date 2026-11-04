// Kartu trip anggota — mockup .mtrip (MemberTripCard): foto 150px
// dengan tag pill kiri-bawah, body berisi judul, tanggal, baris kv,
// pill status. Expired: foto grayscale + tag abu.
import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme";
import {
  tripCardTagKey,
  tripDisplayPill,
  type PillKind,
} from "@/utils/home-logic";
import { isTripExpired } from "@/utils/trip-dates";
import {
  TRIP_CARD_MAP_ATTRIBUTION,
  resolveTripCardHeader,
  tripCardTileSource,
} from "@/utils/trip-card-map";
import type { Trip } from "@/utils/trips-api";
import { cardAccessibility, decorativeAccessibility } from "@/utils/accessibility";
import { LOGO_ASPECT } from "./AppLogo";
import { formatTripDate } from "@/utils/format-date";

const pillStyle = (c: ThemeColors): Record<PillKind, { bg: string; fg: string }> => ({
  idle: { bg: c.surface2, fg: c.text2 },
  live: { bg: c.successBg, fg: c.success },
  expired: { bg: c.surface2, fg: c.text3 },
});

export function StatusPillView({
  kind,
  label,
}: {
  kind: PillKind;
  label: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const palette = pillStyle(colors)[kind];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <View style={[styles.pdot, { backgroundColor: palette.fg }]} />
      <Text style={[styles.pillText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export function KvRow({ label, children }: { label: string; children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.kv}>
      <Text style={styles.k}>{label}</Text>
      {typeof children === "string" ? (
        <Text style={styles.v}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

export function TripCard({
  trip,
  memberCount,
  statusLabelKey,
  onPress,
}: {
  trip: Trip;
  memberCount: number | null;
  // "home.yourStatus" (kartu utama) atau "home.tripStatus" (kartu lain)
  statusLabelKey: string;
  onPress?: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  // "Expired" di sini = PLANNED + tanggal lewat (tampilan saja, enum
  // tidak berubah). Kartu yang expired tampil abu seperti kartu
  // selesai, tapi tag-nya "EXPIRED", bukan "SELESAI".
  const expired = trip.status === "CLOSED" || isTripExpired(trip);
  const pill = tripDisplayPill(trip);
  const isTouring = trip.type === "TOURING";
  // Header kartu: foto > peta tujuan > logo di tengah area (di atas
  // warna kategori). Trip belum punya field foto di API, jadi photoUri
  // masih undefined — peta tampil kalau koordinat ada, expired tetap
  // abu, tile gagal / tanpa koordinat -> logo GoBareng di tengah.
  const [headerWidth, setHeaderWidth] = useState(0);
  const [mapFailed, setMapFailed] = useState(false);
  const header = resolveTripCardHeader({ trip, expired, mapFailed });
  const accessibilityLabel = [
    trip.name,
    formatTripDate(trip.date),
    `${t("home.meetingPoint")}: ${trip.meetingPoint}`,
    `${t(statusLabelKey)}: ${t(pill.labelKey)}`,
  ].join(". ");
  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      disabled={!onPress}
      {...cardAccessibility(
        accessibilityLabel,
        t("accessibility.openTripDetails"),
        Boolean(onPress),
      )}
    >
      {/* Foto trip belum ada di API — area foto memakai peta tujuan
          kalau koordinat ada, kalau tidak logo GoBareng di tengah area
          (kerangka 150px + tag tetap). Tile OSM digeser vertikal supaya
          titik tujuan jatuh di tengah header, dijepit supaya tidak ada
          celah saat titik di tepi tile. Logo dirender setelah tile dan
          sebelum tag, jadi tag kiri-bawah tetap di atas logo. */}
      <View
        style={[
          styles.photo,
          {
            backgroundColor: expired
              ? colors.surface2
              : isTouring
                ? colors.catTouringBg
                : colors.catPendakianBg,
          },
        ]}
        onLayout={(e) => setHeaderWidth(e.nativeEvent.layout.width)}
      >
        {header.kind === "map" && header.tile && headerWidth > 0 ? (
          <>
            <Image
              source={tripCardTileSource(header.tile)}
              style={[
                styles.mapTile,
                {
                  width: headerWidth,
                  height: headerWidth,
                  top: Math.min(
                    0,
                    Math.max(
                      150 - headerWidth,
                      75 - header.tile.fracY * headerWidth,
                    ),
                  ),
                },
              ]}
              cachePolicy="memory-disk"
              accessible={false}
              onError={() => setMapFailed(true)}
            />
            <View
              style={[
                styles.mapPin,
                { left: `${header.tile.fracX * 100}%` },
              ]}
            />
            <Text style={styles.mapCredit}>
              {TRIP_CARD_MAP_ATTRIBUTION}
            </Text>
          </>
        ) : null}
        {header.kind === "logo" ? (
          <View style={styles.logoWrap}>
            <Image
              source={require("@/assets/logo.svg")}
              style={styles.logo}
              contentFit="contain"
              {...decorativeAccessibility}
            />
          </View>
        ) : null}
        <View style={[styles.tag, expired && styles.tagExpired]}>
          <Text style={styles.tagText}>
            {t(tripCardTagKey(trip.status, expired))}
          </Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{trip.name}</Text>
        <Text style={styles.date}>
          {formatTripDate(trip.date)}
          {memberCount !== null
            ? ` • ${t("home.memberCount", { count: String(memberCount) })}`
            : ""}
        </Text>
        <KvRow label={t("home.meetingPoint")}>{trip.meetingPoint}</KvRow>
        <KvRow label={t(statusLabelKey)}>
          <StatusPillView kind={pill.kind} label={t(pill.labelKey)} />
        </KvRow>
      </View>
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  // .mtrip
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    overflow: "hidden",
    marginTop: 14,
    width: "100%",
    ...shadowCard,
  },
  // .mtrip .photo
  photo: { position: "relative", height: 150, overflow: "hidden" },
  // Logo fallback: memenuhi area header, logo ditengahkan. Tinggi 72
  // (lebar ikut aspek logo) cukup menonjol tanpa menabrak tag
  // kiri-bawah; tag dirender sesudahnya sehingga tetap terbaca.
  logoWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { height: 72, width: 72 * LOGO_ASPECT },
  // Tile peta tujuan (kotak, digeser vertikal supaya titik di tengah).
  mapTile: { position: "absolute", left: 0 },
  // Pin titik tujuan, diposisikan di tengah header secara vertikal.
  mapPin: {
    position: "absolute",
    top: 62,
    width: 26,
    height: 26,
    marginLeft: -13,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: c.primary,
  },
  // Kredit tile OSM (kebijakan pemakaian tile; teks atribusi, bukan
  // copy UI — tidak masuk i18n).
  mapCredit: {
    position: "absolute",
    right: 8,
    bottom: 8,
    fontSize: 8,
    color: "#fff",
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: "hidden",
  },
  // .mtrip .tag
  tag: {
    position: "absolute",
    left: 12,
    bottom: 12,
    backgroundColor: c.primary,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  tagExpired: { backgroundColor: c.text2 },
  tagText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  // .mtrip .body
  body: { paddingTop: 13, paddingHorizontal: 15, paddingBottom: 15 },
  // .mtrip h3
  title: { fontSize: 16, fontWeight: "800", letterSpacing: -0.16, color: c.text },
  // .mtrip .date
  date: {
    fontSize: 12.5,
    color: c.text2,
    fontWeight: "600",
    marginTop: 3,
    marginBottom: 6,
  },
  // .kv
  kv: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 6,
  },
  k: { color: c.text2, fontWeight: "600", fontSize: 13 },
  v: {
    fontWeight: "700",
    fontSize: 13,
    color: c.text,
    textAlign: "right",
    flexShrink: 1,
  },
  // .pill
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  pdot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 11, fontWeight: "800" },
});
