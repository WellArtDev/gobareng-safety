import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { CreateFormScreen } from "@/screens/create/create-form";

export default function CreateFormRoute() {
  return (
    <View style={styles.root}>
      <CreateFormScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
