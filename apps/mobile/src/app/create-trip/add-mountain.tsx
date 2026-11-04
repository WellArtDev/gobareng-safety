import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { AddMountainScreen } from "@/screens/create/add-mountain";

export default function AddMountainRoute() {
  return (
    <View style={styles.root}>
      <AddMountainScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
