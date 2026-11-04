// Logo GoBareng — sumber: simbol #gobareng-logo di mockup (aspek
// 953.36 x 789.6). .app-logo-lg: tinggi 96; .app-logo-md: tinggi 78.
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import { decorativeAccessibility } from "@/utils/accessibility";

export const LOGO_ASPECT = 953.36 / 789.6;

export function AppLogo({ size }: { size: "lg" | "md" }) {
  const height = size === "lg" ? 96 : 78;
  return (
    <View style={styles.head}>
      <Image
        source={require("@/assets/logo.svg")}
        style={{ height, width: height * LOGO_ASPECT }}
        contentFit="contain"
        {...decorativeAccessibility}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // .auth-head{ display:flex; justify-content:center; padding:30px 0 4px }
  head: {
    alignItems: "center",
    paddingTop: 30,
    paddingBottom: 4,
  },
});
