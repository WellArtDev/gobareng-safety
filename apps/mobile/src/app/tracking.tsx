// Tab Trip di bottom nav = daftar trip (diikuti + selesai).
// Tracking live pindah ke /trips/[id]/tracking, dibuka dari detail trip
// (keputusan Wella 28 Okt 2026).
import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { TripListScreen } from "@/screens/trips/trip-list";

export default function TripTabRoute() {
  return (
    <View style={styles.root}>
      <TripListScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
