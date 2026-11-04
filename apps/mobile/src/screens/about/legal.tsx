// Layar Dokumen Legal — mockup data-screen="legal": appbar judul
// dokumen + isi .legal-doc (meta + h3 + paragraf + bullet). Isi dari
// utils/legal-docs (teks produk final dari desain).
import { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useTranslation } from "@/i18n";
import { type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { LEGAL_DOCS } from "@/utils/legal-docs";

export function LegalScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const legal = useMemo(() => {
    if (doc === "terms" || doc === "disclaimer" || doc === "privacy") {
      return LEGAL_DOCS[doc];
    }
    return LEGAL_DOCS.privacy;
  }, [doc]);

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
        <Text style={styles.appbarTitle}>{t(legal.titleKey)}</Text>
      </View>

      {/* .lg-meta */}
      <Text style={styles.meta}>{t("legal.updated")}</Text>

      {legal.sections.map((section, index) => (
        <View key={index}>
          {section.heading ? (
            <Text style={styles.h3}>{section.heading}</Text>
          ) : null}
          {section.paragraphs?.map((p) => (
            <Text key={p.slice(0, 40)} style={styles.p}>
              {p}
            </Text>
          ))}
          {section.bullets?.map((b) => (
            <View key={b.slice(0, 40)} style={styles.li}>
              <Text style={styles.liDot}>•</Text>
              <Text style={styles.liText}>{b}</Text>
            </View>
          ))}
        </View>
      ))}
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
  // .legal-doc
  meta: { fontSize: 12, color: c.text2, marginBottom: 4 },
  h3: {
    fontSize: 14.5,
    fontWeight: "800",
    color: c.text,
    marginTop: 17,
    marginBottom: 6,
  },
  p: {
    fontSize: 13.5,
    lineHeight: 13.5 * 1.7,
    color: c.text,
    marginBottom: 9,
  },
  li: { flexDirection: "row", gap: 8, marginBottom: 5, paddingLeft: 4 },
  liDot: { fontSize: 13.5, color: c.text },
  liText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.7,
    color: c.text,
  },
});
