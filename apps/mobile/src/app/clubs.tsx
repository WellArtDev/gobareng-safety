import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { ClubsScreen } from "@/screens/clubs/clubs";

export default function ClubsRoute() {
  return (
    <View style={styles.root}>
      <ClubsScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
