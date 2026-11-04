import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { OrganizerApplicationScreen } from "@/screens/profile/organizer-application";

export default function OrganizerApplicationRoute() {
  return (
    <View style={styles.root}>
      <OrganizerApplicationScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
