// Layar Gunung — katalog gunung dari API (§10): daftar gunung,
// ketuk kartu untuk detail + jalur pendakiannya.
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import {
  fetchMountains,
  type Mountain,
} from "@/utils/mountains-api";
import { mountainPhotoUri } from "@/utils/mountain-photo";

export function MountainsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [mountains, setMountains] = useState<Mountain[]>([]);

  const load = useCallback(async () => {
    try {
      setMountains(await fetchMountains());
    } catch {
      setMountains([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.appbar}>
        <Text style={styles.appbarTitle}>{t("mountains.title")}</Text>
      </View>
      <Text style={styles.subtitle}>{t("mountains.subtitle")}</Text>

      {mountains.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t("mountains.empty")}</Text>
        </View>
      ) : (
        mountains.map((mountain) => (
          <Pressable
            key={mountain.id}
            style={styles.card}
            onPress={() => router.push(`/mountains/${mountain.id}`)}
          >
            {/* Foto gunung bila API punya imageUrl (seperti kartu
                wizard1); kotak huruf HANYA fallback bila belum ada
                foto — kebanyakan gunung memang belum punya foto. */}
            {mountainPhotoUri(mountain.imageUrl) ? (
              <Image
                source={{ uri: mountainPhotoUri(mountain.imageUrl)! }}
                style={styles.thumbPhoto}
                contentFit="cover"
                accessibilityLabel={mountain.name}
              />
            ) : (
              <View style={styles.iconWrap}>
                <Text style={styles.iconText}>{mountain.name[0]}</Text>
              </View>
            )}
            <View style={styles.cardBody}>
              <Text style={styles.name}>{mountain.name}</Text>
              <Text style={styles.meta}>
                {mountain.location} • {mountain.elevationM} m
              </Text>
              <Text style={styles.desc}>
                {t(mountain.difficultyKey)}
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
      color: c.text,
    },
    thumbPhoto: {
      width: 44,
      height: 44,
      borderRadius: 14,
      flexShrink: 0,
    },
    cardBody: { flex: 1 },
    name: {
      fontSize: 15,
      fontWeight: "800",
      color: c.text,
    },
    meta: {
      fontSize: 12,
      color: c.text2,
      marginTop: 2,
    },
    desc: {
      fontSize: 12,
      color: c.text2,
      marginTop: 4,
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
    },
  });
