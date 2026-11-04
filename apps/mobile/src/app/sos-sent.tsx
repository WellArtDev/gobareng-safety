import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { SosSentScreen } from "@/screens/sos/sos-sent";

export default function SosSentRoute() {
  return (
    <View style={styles.root}>
      <SosSentScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
