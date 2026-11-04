// Layar Daftar Beacon — KERANGKA SAJA (Beacon HOLD, perintah Wella
// 26 Okt 2026: boleh kerangka yang sudah ada — kode BCN-XXX, status
// OK/PANIC/baterai — jangan implementasi penuh, jangan tampil di demo).
// Layar ini TIDAK ditautkan dari mana pun (tombol beacon tracking +
// leader tidak dirender); hanya bisa dibuka via URL langsung. Tanpa
// data perangkat — daftar kosong + catatan pengembangan.
import {
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

export function BeaconsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.appbar}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          accessibilityLabel={t("beacons.backLabel")}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t("beacons.title")}</Text>
      </View>

      <View style={styles.holdBox}>
        <Text style={styles.holdText}>{t("beacons.hold")}</Text>
      </View>

      {/* .bcn-note */}
      <Text style={styles.note}>{t("beacons.note")}</Text>

      <Text style={styles.secTitle}>{t("beacons.listTitle")}</Text>
      <View style={styles.teambox}>
        <Text style={styles.emptyText}>{t("beacons.listEmpty")}</Text>
      </View>
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
  holdBox: {
    backgroundColor: c.warningBg,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  holdText: {
    color: c.warning,
    fontSize: 12.5,
    fontWeight: "700",
    lineHeight: 12.5 * 1.55,
  },
  note: {
    fontSize: 12.5,
    color: c.text2,
    lineHeight: 12.5 * 1.6,
    marginBottom: 14,
  },
  secTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: c.text3,
    marginBottom: 10,
  },
  teambox: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    padding: 16,
    ...shadowCard,
  },
  emptyText: { fontSize: 12.5, color: c.text3 },
});
