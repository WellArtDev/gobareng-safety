import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { TripQaScreen } from "@/screens/trips/trip-qa";

export default function TripQaRoute() {
  return (
    <View style={styles.root}>
      <TripQaScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
