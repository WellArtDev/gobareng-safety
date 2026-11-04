// Beranda — layar home 31-layar + bottom nav mockup.
import { View, StyleSheet } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { HomeScreen } from "@/screens/home/home";

export default function HomeRoute() {
  return (
    <View style={styles.root}>
      <HomeScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
