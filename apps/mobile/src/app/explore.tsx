import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { ExploreScreen } from "@/screens/explore/explore";

export default function ExploreRoute() {
  return (
    <View style={styles.root}>
      <ExploreScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
