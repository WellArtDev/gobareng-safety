import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { PaidJoinScreen } from "@/screens/trips/paid-join";

export default function PaidJoinRoute() {
  return (
    <View style={styles.root}>
      <PaidJoinScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
