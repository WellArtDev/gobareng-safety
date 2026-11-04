import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { RouteDetailScreen } from "@/screens/mountains/route-detail";

export default function RouteDetailRoute() {
  return (
    <View style={styles.root}>
      <RouteDetailScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
