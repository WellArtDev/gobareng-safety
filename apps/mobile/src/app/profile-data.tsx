import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { ProfileDataScreen } from "@/screens/profile/profile-data";

export default function ProfileDataRoute() {
  return (
    <View style={styles.root}>
      <ProfileDataScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
