import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { TrackingScreen } from "@/screens/trips/tracking";

export default function TrackingRoute() {
  return (
    <View style={styles.root}>
      <TrackingScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
