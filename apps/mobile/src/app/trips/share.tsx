import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { TripShareScreen } from "@/screens/trips/trip-share";

export default function TripShareRoute() {
  return (
    <View style={styles.root}>
      <TripShareScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
