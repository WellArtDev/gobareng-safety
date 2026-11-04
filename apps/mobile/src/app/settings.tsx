import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { SettingsScreen } from "@/screens/settings/settings";

export default function SettingsRoute() {
  return (
    <View style={styles.root}>
      <SettingsScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
