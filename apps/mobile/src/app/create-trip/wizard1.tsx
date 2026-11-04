import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { Wizard1Screen } from "@/screens/create/wizard1";

export default function Wizard1Route() {
  return (
    <View style={styles.root}>
      <Wizard1Screen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
