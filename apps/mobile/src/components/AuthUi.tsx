// Komponen bersama layar auth — bentuk mengikuti CSS mockup persis
// (.field, .btn-auth, .auth-link, .form-err, .dd-help, .dd-ok).
import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";

import { radii, type ThemeColors } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme";
import { useAccessibilityAnnouncement } from "@/hooks/use-accessibility-announcement";
import {
  alertAccessibility,
  announcementAccessibility,
  buttonAccessibility,
  linkAccessibility,
  minimumTouchTarget,
} from "@/utils/accessibility";

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "words";
  maxLength?: number;
  centered?: boolean;
  help?: string;
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = "none",
  maxLength,
  centered,
  help,
}: FieldProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, centered && styles.inputCentered]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text3}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        maxLength={maxLength}
        accessibilityLabel={label}
        accessibilityHint={help}
      />
      {help ? <Text style={styles.help}>{help}</Text> : null}
    </View>
  );
}

export function FormError({ message }: { message: string | null }) {
  const styles = useThemedStyles(makeStyles);
  useAccessibilityAnnouncement(message);
  if (!message) return null;
  return (
    <View style={styles.formErr} {...alertAccessibility(message)}>
      <Text style={styles.formErrText}>{message}</Text>
    </View>
  );
}

export function FormSuccess({ message }: { message: string | null }) {
  const styles = useThemedStyles(makeStyles);
  useAccessibilityAnnouncement(message);
  if (!message) return null;
  return (
    <View
      style={styles.formOk}
      {...announcementAccessibility(message, "polite")}
    >
      <Text style={styles.formOkText}>{message}</Text>
    </View>
  );
}

export function AuthButton({
  label,
  onPress,
  busy,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.btnAuth,
        pressed && styles.btnAuthPressed,
      ]}
      onPress={onPress}
      disabled={busy}
      {...buttonAccessibility(label, { busy, disabled: busy })}
    >
      {busy ? (
        <ActivityIndicator color="#fff" accessible={false} />
      ) : (
        <Text style={styles.btnAuthText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function AuthLink({
  text,
  action,
  onPress,
}: {
  text: string;
  action: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      style={styles.authLink}
      onPress={onPress}
      {...linkAccessibility(`${text} ${action}`)}
    >
      <Text style={styles.authLinkText}>
        {text} <Text style={styles.authLinkAction}>{action}</Text>
      </Text>
    </Pressable>
  );
}

export function AuthScreenContainer({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.screen}>{children}</View>;
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  // .screen no-nav: padding 6px 20px 26px, bg var(--bg)
  screen: {
    flex: 1,
    backgroundColor: c.bg,
    paddingTop: 6,
    paddingHorizontal: 20,
    paddingBottom: 26,
  },
  // .field{ margin-bottom:13px }
  field: { marginBottom: 13 },
  // .field label
  label: {
    fontSize: 12.5,
    fontWeight: "800",
    color: c.text2,
    marginBottom: 6,
  },
  // .field input
  input: {
    width: "100%",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: c.text,
  },
  // .otp-input: mono 20px letterSpacing .5em center
  inputCentered: {
    textAlign: "center",
    fontSize: 20,
    letterSpacing: 10,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  // .dd-help
  help: {
    fontSize: 11.5,
    color: c.text3,
    lineHeight: 11.5 * 1.55,
    marginTop: 6,
  },
  // .form-err
  formErr: {
    backgroundColor: c.errBg,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 13,
  },
  formErrText: {
    color: c.stSosDark,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 13 * 1.5,
  },
  // .dd-ok
  formOk: {
    backgroundColor: c.successBg,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  formOkText: {
    color: c.success,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 13 * 1.5,
  },
  // .btn-auth
  btnAuth: {
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
  btnAuthPressed: {
    backgroundColor: c.primaryDark,
    transform: [{ scale: 0.985 }],
  },
  btnAuthText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  // .auth-link
  authLink: {
    width: "100%",
    alignItems: "center",
    padding: 14,
    ...minimumTouchTarget,
  },
  authLinkText: { fontSize: 13.5, color: c.text2, fontWeight: "600" },
  authLinkAction: { color: c.primary, fontWeight: "800" },
});
