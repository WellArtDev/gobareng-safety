// Bottom nav — mockup <nav class="bottomnav"> persis: 7 kolom
// (3 navitem + FAB 58px + 3 navitem), FAB hijau menonjol -22px,
// item SOS merah saat aktif. Ikon = path SVG mockup (assets/icons).
import { Image } from "expo-image";
import { usePathname, useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/i18n";
import { type ThemeColors } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme";
import {
  buttonAccessibility,
  decorativeAccessibility,
  minimumTouchTarget,
  tabAccessibility,
} from "@/utils/accessibility";

type NavTarget = {
  route: Href;
  icon: number;
  labelKey: string;
  sos?: boolean;
};

const LEFT_ITEMS: NavTarget[] = [
  { route: "/", icon: require("@/assets/icons/nav-home.svg"), labelKey: "nav.home" },
  {
    route: "/explore",
    icon: require("@/assets/icons/nav-explore.svg"),
    labelKey: "nav.explore",
  },
  {
    route: "/tracking",
    icon: require("@/assets/icons/nav-trip.svg"),
    labelKey: "nav.trip",
  },
];

const RIGHT_ITEMS: NavTarget[] = [
  {
    route: "/sos",
    icon: require("@/assets/icons/nav-sos.svg"),
    labelKey: "nav.sos",
    sos: true,
  },
  {
    route: "/clubs",
    icon: require("@/assets/icons/nav-community.svg"),
    labelKey: "nav.community",
  },
  {
    route: "/profile",
    icon: require("@/assets/icons/nav-profile.svg"),
    labelKey: "nav.profile",
  },
];

function NavItem({ item }: { item: NavTarget }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const route = item.route as string;
  const active =
    pathname === route || (route !== "/" && pathname.startsWith(`${route}/`));
  const tint = active
    ? item.sos
      ? colors.stSos
      : colors.primary
    : colors.text3;
  return (
    <Pressable
      style={styles.navitem}
      onPress={() => router.push(item.route)}
      {...tabAccessibility(t(item.labelKey), active)}
    >
      <Image
        source={item.icon}
        style={styles.icon}
        tintColor={tint}
        {...decorativeAccessibility}
      />
      <Text style={[styles.label, { color: tint }]}>{t(item.labelKey)}</Text>
    </Pressable>
  );
}

export function BottomNav() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View style={[styles.bar, { paddingBottom: 10 + insets.bottom }]}>
      {LEFT_ITEMS.map((item) => (
        <NavItem key={item.labelKey} item={item} />
      ))}
      <View style={styles.fabSlot}>
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          onPress={() => router.push("/create-trip")}
          {...buttonAccessibility(t("nav.create"))}
        >
          <Image
            source={require("@/assets/icons/plus.svg")}
            style={styles.fabIcon}
            tintColor="#fff"
            {...decorativeAccessibility}
          />
        </Pressable>
      </View>
      {RIGHT_ITEMS.map((item) => (
        <NavItem key={item.labelKey} item={item} />
      ))}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  // .bottomnav: grid 1fr x3 + 58px + 1fr x3, border-top, padding 8 6 10
  bar: {
    flexDirection: "row",
    backgroundColor: c.surface,
    borderTopWidth: 1,
    borderTopColor: c.line,
    paddingTop: 8,
    paddingHorizontal: 6,
    alignItems: "flex-start",
  },
  // .navitem
  navitem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
    ...minimumTouchTarget,
  },
  icon: { width: 21, height: 21 },
  label: { fontSize: 9.5, fontWeight: "700" },
  fabSlot: { width: 58, alignItems: "center" },
  // .navfab: 50px bulat, margin-top -22, border 4 warna bg
  fab: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: c.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -22,
    borderWidth: 4,
    borderColor: c.bg,
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  fabPressed: { transform: [{ scale: 0.94 }] },
  fabIcon: { width: 23, height: 23 },
});
