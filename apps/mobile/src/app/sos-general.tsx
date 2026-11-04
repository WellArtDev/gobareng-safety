import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { SosGeneralPickScreen } from "@/screens/sos/sos-general-pick";

export default function SosGeneralRoute() {
  return (
    <View style={styles.root}>
      <SosGeneralPickScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
