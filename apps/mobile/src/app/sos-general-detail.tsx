import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { SosGeneralDetailScreen } from "@/screens/sos/sos-general-detail";

export default function SosGeneralDetailRoute() {
  return (
    <View style={styles.root}>
      <SosGeneralDetailScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
