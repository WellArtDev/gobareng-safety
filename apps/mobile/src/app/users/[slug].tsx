import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { PublicProfileScreen } from "@/screens/profile/public-profile";

export default function PublicProfileRoute() {
  return (
    <View style={styles.root}>
      <PublicProfileScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
