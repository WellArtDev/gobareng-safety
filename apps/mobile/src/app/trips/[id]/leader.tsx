import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { LeaderScreen } from "@/screens/trips/leader";

export default function LeaderRoute() {
  return (
    <View style={styles.root}>
      <LeaderScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
