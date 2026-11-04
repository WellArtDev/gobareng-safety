import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { AboutScreen } from "@/screens/about/about";

export default function AboutRoute() {
  return (
    <View style={styles.root}>
      <AboutScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
