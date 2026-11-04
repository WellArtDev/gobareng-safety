import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { UpgradeScreen } from "@/screens/profile/upgrade";

export default function UpgradeRoute() {
  return (
    <View style={styles.root}>
      <UpgradeScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
