import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { TripDirectionScreen } from "@/screens/trips/trip-direction";

export default function TripDirectionRoute() {
  return (
    <View style={styles.root}>
      <TripDirectionScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
