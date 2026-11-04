import { StyleSheet, View } from "react-native";

import { BottomNav } from "@/components/BottomNav";
import { SosVoiceScreen } from "@/screens/sos/sos-voice";

export default function SosVoiceRoute() {
  return (
    <View style={styles.root}>
      <SosVoiceScreen />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
