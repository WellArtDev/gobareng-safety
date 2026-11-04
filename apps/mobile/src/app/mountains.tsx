import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { MountainsScreen } from "@/screens/mountains/mountains";

export default function MountainsRoute() {
  return (
    <View style={styles.root}>
      <MountainsScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
