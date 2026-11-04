import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { AccountVerificationScreen } from "@/screens/profile/account-verification";

export default function AccountVerificationRoute() {
  return (
    <View style={styles.root}>
      <AccountVerificationScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
