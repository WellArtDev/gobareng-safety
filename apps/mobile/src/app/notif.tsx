import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { NotifScreen } from "@/screens/notif/notif";

export default function NotifRoute() {
  return (
    <View style={styles.root}>
      <NotifScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
