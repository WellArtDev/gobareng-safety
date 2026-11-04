import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { LegalScreen } from "@/screens/about/legal";

export default function LegalRoute() {
  return (
    <View style={styles.root}>
      <LegalScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
