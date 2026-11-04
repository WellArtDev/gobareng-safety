import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { Wizard2Screen } from "@/screens/create/wizard2";

export default function Wizard2Route() {
  return (
    <View style={styles.root}>
      <Wizard2Screen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
