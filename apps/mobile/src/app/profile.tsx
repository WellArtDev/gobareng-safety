import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { ProfileScreen } from "@/screens/profile/profile";

export default function ProfileRoute() {
  return (
    <View style={styles.root}>
      <ProfileScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
