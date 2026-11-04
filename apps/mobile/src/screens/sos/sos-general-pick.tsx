// Layar Pilih Alasan SOS Umum — tanpa trip, untuk sehari-hari.
// 9 template alasan dikunci Wella 2 Nov 2026 (tanpa anak hilang).
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { useTranslation } from "@/i18n";
import { radii, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import {
  GENERAL_SOS_REASONS,
  generalReasonLabelKey,
  type GeneralSosReason,
} from "@/utils/sos-logic";
import {
  buttonAccessibility,
  decorativeAccessibility,
  headingAccessibility,
  selectableButtonAccessibility,
} from "@/utils/accessibility";

export function SosGeneralPickScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [reason, setReason] = useState<GeneralSosReason | null>(null);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          {...buttonAccessibility(t("sos.general.detail.backLabel"))}
        >
          <Text style={styles.backGlyph} {...decorativeAccessibility}>‹</Text>
        </Pressable>
        <Text style={styles.headTitle} {...headingAccessibility(t("sos.general.title"))}>
          {t("sos.general.title")}
        </Text>
        <Text style={styles.headSub}>{t("sos.general.subtitle")}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.note}>
          <Text style={styles.noteText}>{t("sos.general.verifiedNote")}</Text>
        </View>

        {GENERAL_SOS_REASONS.map((item) => {
          const selected = reason === item;
          return (
            <Pressable
              key={item}
              style={[styles.reason, selected && styles.reasonSel]}
              onPress={() => setReason(item)}
              {...selectableButtonAccessibility(
                t(generalReasonLabelKey(item)),
                selected,
              )}
            >
              <View style={styles.ric}>
                <Text style={styles.ricGlyph}>!</Text>
              </View>
              <Text style={styles.reasonText}>
                {t(generalReasonLabelKey(item))}
              </Text>
              <Text style={styles.chev}>›</Text>
            </Pressable>
          );
        })}

        <Pressable
          style={[styles.btnSend, !reason && styles.btnSendDisabled]}
          onPress={() => {
            if (reason) {
              router.push({
                pathname: "/sos-general-confirm",
                params: { reason },
              });
            }
          }}
          disabled={!reason}
          {...buttonAccessibility(t("sos.general.toConfirm"), {
            disabled: !reason,
          })}
        >
          <Text
            style={[
              styles.btnSendText,
              !reason && styles.btnSendTextDisabled,
            ]}
          >
            {t("sos.general.toConfirm")}
          </Text>
        </Pressable>

        <Pressable
          style={styles.btnCancel}
          onPress={() => router.back()}
          {...buttonAccessibility(t("sos.general.cancel"))}
        >
          <Text style={styles.btnCancelText}>{t("sos.general.cancel")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { paddingBottom: 26 },
    head: {
      backgroundColor: c.stSosDark,
      paddingTop: 16,
      paddingHorizontal: 20,
      paddingBottom: 20,
    },
    back: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: "rgba(255,255,255,.16)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    backGlyph: { fontSize: 24, fontWeight: "700", color: "#fff" },
    headTitle: {
      fontSize: 21,
      fontWeight: "800",
      letterSpacing: -0.21,
      color: "#fff",
    },
    headSub: {
      fontSize: 13,
      lineHeight: 13 * 1.55,
      color: "rgba(255,255,255,.85)",
      marginTop: 5,
    },
    body: { paddingTop: 16, paddingHorizontal: 20 },
    note: {
      backgroundColor: c.surface2,
      borderRadius: radii.md,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 12,
    },
    noteText: { color: c.text2, fontSize: 13, lineHeight: 13 * 1.55 },
    reason: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: c.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.line,
      paddingVertical: 13,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    reasonSel: { borderColor: c.stSos, backgroundColor: c.surface2 },
    ric: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.stSos,
      alignItems: "center",
      justifyContent: "center",
    },
    ricGlyph: { color: "#fff", fontSize: 16, fontWeight: "800" },
    reasonText: { flex: 1, color: c.text, fontSize: 15, fontWeight: "700" },
    chev: { color: c.text3, fontSize: 22 },
    btnSend: {
      width: "100%",
      backgroundColor: c.stSos,
      borderRadius: radii.md,
      padding: 16,
      marginTop: 12,
      alignItems: "center",
    },
    btnSendDisabled: { backgroundColor: c.surface2 },
    btnSendText: { color: "#fff", fontSize: 15.5, fontWeight: "800" },
    btnSendTextDisabled: { color: c.text3 },
    btnCancel: { width: "100%", alignItems: "center", padding: 13, marginTop: 6 },
    btnCancelText: { color: c.text2, fontSize: 14, fontWeight: "700" },
  });
