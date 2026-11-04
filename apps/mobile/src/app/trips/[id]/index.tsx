import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { TripDetailScreen } from "@/screens/trips/trip-detail";

export default function TripDetailRoute() {
  return (
    <View style={styles.root}>
      <TripDetailScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
