// Wizard Selesai — mockup data-screen="wizard-done": ring hijau ✓,
// judul + body, kartu kv (gunung/jalur/titik kumpul/kode trip hijau),
// tombol Lihat di Beranda. Kode trip = potongan id trip (API belum
// punya kode pendek; isi boleh beda, kerangka tetap).
import {
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

export function WizardDoneScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { tripId, mountain, route, meet, destination } = useLocalSearchParams<{
    tripId: string;
    mountain: string;
    route: string;
    meet: string;
    destination: string;
  }>();

  const shortCode = tripId
    ? `GB-${(tripId.split("-")[0] ?? "").toUpperCase()}`
    : "—";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.success}>
        <View style={styles.ring}>
          <Text style={styles.ringGlyph}>✓</Text>
        </View>
        <Text style={styles.title}>{t("wizard.doneTitle")}</Text>
        <Text style={styles.body}>{t("wizard.doneBody")}</Text>

        <View style={styles.card}>
          {destination ? (
            <View style={styles.kv}>
              <Text style={styles.k}>{t("create.sumDestination")}</Text>
              <Text style={styles.v}>{destination}</Text>
            </View>
          ) : (
            <>
              <View style={styles.kv}>
                <Text style={styles.k}>{t("wizard.doneMountain")}</Text>
                <Text style={styles.v}>{mountain || "—"}</Text>
              </View>
              <View style={styles.kv}>
                <Text style={styles.k}>{t("wizard.doneRoute")}</Text>
                <Text style={styles.v}>{route || "—"}</Text>
              </View>
            </>
          )}
          <View style={styles.kv}>
            <Text style={styles.k}>{t("wizard.doneMeet")}</Text>
            <Text style={styles.v}>{meet || "—"}</Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.k}>{t("wizard.doneCode")}</Text>
            <Text style={[styles.v, styles.code]}>{shortCode}</Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.btnMain, pressed && styles.btnPressed]}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.btnMainText}>{t("wizard.doneCta")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 26 },
  success: { alignItems: "center", paddingTop: 26, paddingBottom: 10 },
  ring: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: c.successBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  ringGlyph: { fontSize: 40, fontWeight: "800", color: c.success },
  title: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: c.text,
    marginBottom: 8,
  },
  body: {
    fontSize: 13.5,
    color: c.text2,
    lineHeight: 13.5 * 1.6,
    maxWidth: 300,
    textAlign: "center",
    marginBottom: 16,
  },
  card: {
    width: "100%",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    ...shadowCard,
  },
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
  code: { color: c.primaryDark },
  btnMain: {
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
  btnPressed: {
    backgroundColor: c.primaryDark,
    transform: [{ scale: 0.985 }],
  },
  btnMainText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
