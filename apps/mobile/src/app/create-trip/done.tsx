import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { WizardDoneScreen } from "@/screens/create/wizard-done";

export default function WizardDoneRoute() {
  return (
    <View style={styles.root}>
      <WizardDoneScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
