import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { MyProposalsScreen } from "@/screens/profile/my-proposals";

export default function MyProposalsRoute() {
  return (
    <View style={styles.root}>
      <MyProposalsScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
