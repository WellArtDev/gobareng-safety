import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { TripTypeScreen } from "@/screens/create/trip-type";

export default function TripTypeRoute() {
  return (
    <View style={styles.root}>
      <TripTypeScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
