// Placeholder layar yang belum di-rebuild — appbar + judul saja,
// supaya navigasi tidak crash. Setiap layar diganti versi mockup
// penuh pada PR MOB-1 berikutnya (lihat docs/kanban.md).
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useTranslation } from "@/i18n";
import { type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";

export function PlaceholderScreen({ titleKey }: { titleKey: string }) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  // canGoBack imperatif tidak tersedia saat render statis (SSG) —
  // baca setelah mount supaya export web tidak gagal.
  const [canBack, setCanBack] = useState(false);
  useEffect(() => {
    setCanBack(router.canGoBack());
  }, [router]);
  return (
    <View style={styles.screen}>
      <View style={styles.appbar}>
        {canBack ? (
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title}>{t(titleKey)}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.note}>{t("common.comingSoon")}</Text>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.bg,
    paddingTop: 6,
    paddingHorizontal: 20,
  },
  appbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  back: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  backGlyph: { fontSize: 26, fontWeight: "700", color: c.text },
  title: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: c.text,
    flex: 1,
  },
  body: { flex: 1, alignItems: "center", justifyContent: "center" },
  note: { fontSize: 13, color: c.text3, fontWeight: "600" },
});
