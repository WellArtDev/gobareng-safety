import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { TripInviteScreen } from "@/screens/trips/trip-invite";

export default function TripInviteRoute() {
  return (
    <View style={styles.root}>
      <TripInviteScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
