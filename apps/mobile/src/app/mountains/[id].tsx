import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { MountainDetailScreen } from "@/screens/mountains/mountain-detail";

export default function MountainDetailRoute() {
  return (
    <View style={styles.root}>
      <MountainDetailScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
