import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { SosPickScreen } from "@/screens/sos/sos-pick";

export default function SosPickRoute() {
  return (
    <View style={styles.root}>
      <SosPickScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
