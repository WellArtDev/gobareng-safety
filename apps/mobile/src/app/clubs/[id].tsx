import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { ClubDetailScreen } from "@/screens/clubs/club-detail";

export default function ClubDetailRoute() {
  return (
    <View style={styles.root}>
      <ClubDetailScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
