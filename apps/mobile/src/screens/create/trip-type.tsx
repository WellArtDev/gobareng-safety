// Wizard langkah 1 — pilih jenis trip dulu (keputusan Wella 1 Nov 2026):
// Pendakian lanjut ke pilih gunung, Touring lanjut ke search lokasi
// (peta + search). Tombol Lanjut disabled tanpa pilihan.
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import {
  NextButton,
  WizardAppbar,
  WizardFoot,
  WizardProgress,
} from "@/components/WizardUi";
import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";

type TripType = "HIKING" | "TOURING";

export function TripTypeScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [selected, setSelected] = useState<TripType | null>(null);

  const go = () => {
    if (!selected) return;
    if (selected === "HIKING") {
      router.push({
        pathname: "/create-trip/wizard1",
        params: { tripType: "HIKING" },
      });
    } else {
      router.push({
        pathname: "/create-trip/touring-location",
        params: { tripType: "TOURING", field: "tujuan" },
      });
    }
  };

  const card = (
    type: TripType,
    icon: string,
    nameKey: string,
    descKey: string,
  ) => {
    const sel = selected === type;
    return (
      <Pressable
        style={[styles.card, sel && styles.cardSel]}
        onPress={() => setSelected(type)}
      >
        <Text style={styles.icon}>{icon}</Text>
        <View style={styles.row}>
          <Text style={styles.name}>{t(nameKey)}</Text>
          {sel ? (
            <View style={styles.check}>
              <Text style={styles.checkText}>{t("wizard.selected")}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.desc}>{t(descKey)}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <WizardAppbar
          title={t("wizard.title")}
          step={t("wizard.step1")}
          backLabel={t("wizard.backHome")}
        />
        <WizardProgress fraction={1 / 3} />
        <Text style={styles.question}>{t("wizard.typeQuestion")}</Text>
        {card("HIKING", "🥾", "wizard.typeHiking", "wizard.typeHikingDesc")}
        {card("TOURING", "🏍️", "wizard.typeTouring", "wizard.typeTouringDesc")}
      </ScrollView>
      <View style={styles.footer}>
        <WizardFoot>
          <NextButton
            label={selected ? t("wizard.continue") : t("wizard.pickTypeFirst")}
            disabled={!selected}
            onPress={go}
          />
        </WizardFoot>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    screen: { flex: 1 },
    content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 110 },
    footer: { paddingHorizontal: 20, paddingBottom: 16, backgroundColor: c.bg },
    question: {
      fontSize: 15,
      fontWeight: "700",
      color: c.text,
      marginBottom: 12,
    },
    card: {
      width: "100%",
      backgroundColor: c.surface,
      borderWidth: 1.5,
      borderColor: c.line,
      borderRadius: radii.lg,
      paddingVertical: 16,
      paddingHorizontal: 16,
      marginBottom: 12,
      ...shadowCard,
    },
    cardSel: { borderColor: c.primary },
    icon: { fontSize: 40, marginBottom: 6 },
    row: { flexDirection: "row", alignItems: "center", gap: 9 },
    name: { fontSize: 15.5, fontWeight: "800", color: c.text, flex: 1 },
    check: {
      backgroundColor: c.primary,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: radii.pill,
    },
    checkText: {
      color: "#fff",
      fontSize: 9.5,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    desc: {
      fontSize: 12.5,
      color: c.text2,
      lineHeight: 12.5 * 1.55,
      marginTop: 5,
    },
  });
