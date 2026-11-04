// Komponen bersama layar pengaturan — bentuk mengikuti CSS mockup:
// .set-sec (seksi lipat), .sw (switch pil 46x27), .radio-row,
// .sw-row, .set-note, .btn-set.
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";

export function SettingsSection({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle: string;
  icon: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.sec}>
      <Pressable
        style={styles.head}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.mic}>
          <Text style={styles.micGlyph}>{icon}</Text>
        </View>
        <View style={styles.ht}>
          <Text style={styles.htTitle}>{title}</Text>
          <Text style={styles.htSub}>{subtitle}</Text>
        </View>
        <Text style={[styles.chev, open && styles.chevOpen]}>›</Text>
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

// .sw: pil 46x27, knob 21px geser kanan saat on
export function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      style={[styles.sw, on && styles.swOn]}
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
    >
      <View style={[styles.swKnob, on && styles.swKnobOn]} />
    </Pressable>
  );
}

export function SwitchRow({
  title,
  desc,
  on,
  onToggle,
  last,
}: {
  title: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
  last?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.swRow, last && styles.swRowLast]}>
      <View style={styles.swTxt}>
        <Text style={styles.swTitle}>{title}</Text>
        <Text style={styles.swDesc}>{desc}</Text>
      </View>
      <Toggle on={on} onToggle={onToggle} label={title} />
    </View>
  );
}

export function RadioRow({
  title,
  desc,
  selected,
  onPress,
}: {
  title: string;
  desc: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      style={[styles.radioRow, selected && styles.radioRowSel]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={[styles.radio, selected && styles.radioSel]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.rrTxt}>
        <Text style={styles.rrTitle}>{title}</Text>
        <Text style={styles.rrDesc}>{desc}</Text>
      </View>
    </Pressable>
  );
}

export function SettingsNote({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.note}>{children}</Text>;
}

export function SettingsButton({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      style={[styles.btnSet, danger && styles.btnSetDanger]}
      onPress={onPress}
    >
      <Text style={[styles.btnSetText, danger && styles.btnSetTextDanger]}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  // .set-sec
  sec: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    marginBottom: 11,
    overflow: "hidden",
    ...shadowCard,
  },
  // .set-head
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  mic: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: c.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  micGlyph: { fontSize: 16, color: c.primaryDark },
  ht: { flex: 1, minWidth: 0 },
  htTitle: { fontSize: 14.5, fontWeight: "800", color: c.text },
  htSub: { fontSize: 12, color: c.text2, marginTop: 1 },
  chev: { color: c.text3, fontSize: 20, fontWeight: "700" },
  chevOpen: { transform: [{ rotate: "90deg" }] },
  // .set-body
  body: {
    paddingTop: 2,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderTopColor: c.line,
  },
  // .sw-row
  swRow: {
    flexDirection: "row",
    gap: 13,
    alignItems: "flex-start",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderBottomColor: c.line,
  },
  swRowLast: { borderBottomWidth: 0 },
  swTxt: { flex: 1, minWidth: 0 },
  swTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: c.text,
    lineHeight: 13.5 * 1.45,
  },
  swDesc: {
    fontSize: 12,
    color: c.text2,
    lineHeight: 12 * 1.55,
    marginTop: 2,
  },
  // .sw 46x27
  sw: {
    width: 46,
    height: 27,
    borderRadius: 99,
    backgroundColor: c.surface2,
    borderWidth: 1,
    borderColor: c.line,
    marginTop: 2,
    justifyContent: "center",
  },
  swOn: { backgroundColor: c.primary, borderColor: c.primary },
  swKnob: {
    position: "absolute",
    left: 2,
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: "#fff",
    shadowColor: "#12212b",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  swKnobOn: { left: 21 },
  // .radio-row
  radioRow: {
    flexDirection: "row",
    gap: 11,
    alignItems: "flex-start",
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: c.line,
    borderRadius: radii.md,
    marginBottom: 8,
    backgroundColor: c.surface,
  },
  radioRowSel: { borderColor: c.primary },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: c.line,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  radioSel: { borderColor: c.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: c.primary,
  },
  rrTxt: { flex: 1 },
  rrTitle: { fontSize: 13.5, fontWeight: "700", color: c.text },
  rrDesc: {
    fontSize: 12,
    color: c.text2,
    lineHeight: 12 * 1.55,
    marginTop: 2,
  },
  // .set-note
  note: {
    fontSize: 12,
    color: c.text3,
    lineHeight: 12 * 1.6,
    marginVertical: 10,
  },
  // .btn-set
  btnSet: {
    width: "100%",
    alignItems: "center",
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.line,
    borderRadius: radii.md,
    padding: 12,
    marginTop: 9,
  },
  btnSetDanger: { borderColor: c.errBg },
  btnSetText: { fontSize: 13.5, fontWeight: "800", color: c.text },
  btnSetTextDanger: { color: c.stSos },
});
