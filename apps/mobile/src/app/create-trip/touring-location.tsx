import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { TouringLocationScreen } from "@/screens/create/touring-location";

export default function TouringLocationRoute() {
  return (
    <View style={styles.root}>
      <TouringLocationScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
