import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { SosConfirmScreen } from "@/screens/sos/sos-confirm";

export default function SosConfirmRoute() {
  return (
    <View style={styles.root}>
      <SosConfirmScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
