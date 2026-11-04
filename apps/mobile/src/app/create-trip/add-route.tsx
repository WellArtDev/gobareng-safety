import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { AddRouteScreen } from "@/screens/create/add-route";

export default function AddRouteRoute() {
  return (
    <View style={styles.root}>
      <AddRouteScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
