import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { SosGeneralConfirmScreen } from "@/screens/sos/sos-general-confirm";

export default function SosGeneralConfirmRoute() {
  return (
    <View style={styles.root}>
      <SosGeneralConfirmScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
