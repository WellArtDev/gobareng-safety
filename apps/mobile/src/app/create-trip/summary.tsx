import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { CreateSummaryScreen } from "@/screens/create/create-summary";

export default function CreateSummaryRoute() {
  return (
    <View style={styles.root}>
      <CreateSummaryScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
