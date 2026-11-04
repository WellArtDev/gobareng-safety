// Layar Tentang — mockup data-screen="about"
import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { router } from "expo-router";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";

export function AboutScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();

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
        <Text style={styles.appbarTitle}>{t("about.title")}</Text>
      </View>

      <View style={styles.cardHeader}>
        <Text style={styles.logoText}>GoBareng</Text>
        <View style={styles.versionPill}>
          <Text style={styles.versionText}>{t("about.version")}</Text>
        </View>
        <Text style={styles.tagline}>{t("about.tagline")}</Text>
      </View>

      <View style={styles.menuBox}>
        <Pressable
          style={styles.menuRow}
          onPress={() => router.push("/legal?doc=privacy")}
        >
          <Text style={styles.menuLabel}>{t("about.privacy")}</Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
        <Pressable
          style={styles.menuRow}
          onPress={() => router.push("/legal?doc=terms")}
        >
          <Text style={styles.menuLabel}>{t("about.terms")}</Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
        <Pressable
          style={[styles.menuRow, styles.menuRowLast]}
          onPress={() => router.push("/legal?doc=disclaimer")}
        >
          <Text style={styles.menuLabel}>{t("about.disclaimer")}</Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
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
  cardHeader: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    padding: 24,
    alignItems: "center",
    marginBottom: 14,
    ...shadowCard,
  },
  logoText: {
    fontSize: 24,
    fontWeight: "800",
    color: c.primaryDark,
  },
  versionPill: {
    backgroundColor: c.surface2,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    marginVertical: 10,
  },
  versionText: {
    fontSize: 11,
    fontWeight: "800",
    color: c.text2,
  },
  tagline: {
    fontSize: 13,
    color: c.text2,
    textAlign: "center",
  },
  menuBox: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    ...shadowCard,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  menuRowLast: {
    borderBottomWidth: 0,
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: c.text,
  },
  chev: {
    fontSize: 18,
    fontWeight: "700",
    color: c.text3,
  },
});
