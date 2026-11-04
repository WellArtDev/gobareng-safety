import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { GlimmerScreen } from "@/screens/glimmer/glimmer";

export default function GlimmerRoute() {
  return (
    <View style={styles.root}>
      <GlimmerScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
