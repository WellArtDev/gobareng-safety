// Komponen bersama wizard buat trip — appbar (back + judul + logo kecil
// + chip langkah), progress bar, tombol next sticky.
import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";

import { radii, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";

export function WizardAppbar({
  title,
  step,
  backLabel,
}: {
  title: string;
  step?: string;
  backLabel: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  return (
    <View style={styles.appbar}>
      <Pressable
        style={styles.back}
        onPress={() => router.back()}
        accessibilityLabel={backLabel}
      >
        <Text style={styles.backGlyph}>‹</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Image
        source={require("@/assets/logo.svg")}
        style={styles.logo}
        contentFit="contain"
      />
      {step ? (
        <View style={styles.steps}>
          <Text style={styles.stepsText}>{step}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function WizardProgress({ fraction }: { fraction: number }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.progress}>
      <View style={[styles.progressFill, { width: `${fraction * 100}%` }]} />
    </View>
  );
}

export function WizardFoot({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.foot}>{children}</View>;
}

export function NextButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.btnNext,
        pressed && !disabled && styles.btnNextPressed,
        disabled && styles.btnNextDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.btnNextText, disabled && styles.btnNextTextDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
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
  title: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: c.text,
    flex: 1,
  },
  // .app-logo-sm
  logo: { height: 30, width: 30 * (953.36 / 789.6) },
  // .steps
  steps: {
    backgroundColor: c.surface2,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  stepsText: { fontSize: 11, fontWeight: "800", color: c.text2 },
  // .progress
  progress: {
    height: 6,
    borderRadius: 99,
    backgroundColor: c.surface2,
    overflow: "hidden",
    marginTop: 2,
    marginBottom: 14,
  },
  progressFill: {
    height: "100%",
    backgroundColor: c.primary,
    borderRadius: 99,
  },
  // .wizard-foot (sticky disederhanakan: blok bawah biasa)
  foot: { marginTop: 16, paddingTop: 14 },
  // .btn-next
  btnNext: {
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
  btnNextPressed: {
    backgroundColor: c.primaryDark,
    transform: [{ scale: 0.985 }],
  },
  btnNextDisabled: {
    backgroundColor: c.surface2,
    shadowOpacity: 0,
    elevation: 0,
  },
  btnNextText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnNextTextDisabled: { color: c.text3 },
});
