// Alat bantu darurat SOS — sirine + flashlight morse NYATA.
// Sirine: Web Audio (web); native menyusul dev build (expo-av aset
// biner tidak bisa ikut; Web Audio tidak ada di native runtime).
// Morse: satu penjadwal (utils/morse) menggerakkan DUA keluaran
// sekaligus — overlay layar putih (semua platform, juga menarik
// perhatian) + torch kamera belakang via expo-camera enableTorch
// (native; di web torch tidak tersedia, overlay yang bekerja).
import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView } from "expo-camera";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { startMorseFlash } from "@/utils/morse";
import { isSirenSupported, startSiren, stopSiren } from "@/utils/siren";

function ToolButton({
  title,
  desc,
  on,
  onToggle,
  labelOn,
  labelOff,
}: {
  title: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
  labelOn: string;
  labelOff: string;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      style={[styles.toolBtn, on && styles.toolBtnOn]}
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
    >
      <View style={styles.tic}>
        <Text style={styles.ticGlyph}>!</Text>
      </View>
      <View style={styles.ttext}>
        <Text style={styles.ttextTitle}>{title}</Text>
        <Text style={styles.ttextDesc}>{desc}</Text>
      </View>
      <View style={[styles.st, on && styles.stOn]}>
        <Text style={[styles.stText, on && styles.stTextOn]}>
          {on ? labelOn : labelOff}
        </Text>
      </View>
    </Pressable>
  );
}

export function SosTools() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [siren, setSiren] = useState(false);
  const [morse, setMorse] = useState(false);
  // Keluaran morse: overlay layar + torch kamera (native).
  const [flashOn, setFlashOn] = useState(false);
  const stopMorseRef = useRef<(() => void) | null>(null);

  const toggleSiren = () => {
    // Harus di dalam handler gestur: AudioContext web terkunci di luar.
    if (siren) {
      stopSiren();
      setSiren(false);
    } else {
      startSiren();
      setSiren(true);
    }
  };

  const toggleMorse = () => {
    if (morse) {
      stopMorseRef.current?.();
      stopMorseRef.current = null;
      setMorse(false);
    } else {
      stopMorseRef.current = startMorseFlash(setFlashOn);
      setMorse(true);
    }
  };

  // Bersih-bersih saat layar ditutup — sirine/torch tidak boleh
  // tertinggal menyala.
  useEffect(() => {
    return () => {
      stopMorseRef.current?.();
      stopSiren();
    };
  }, []);

  return (
    <View style={styles.tools}>
      <Text style={styles.toolsTitle}>{t("sos.sent.toolsTitle")}</Text>
      <ToolButton
        title={t("sos.sent.sirenTitle")}
        desc={
          isSirenSupported()
            ? t("sos.sent.sirenDesc")
            : t("sos.sent.sirenNativeSoon")
        }
        on={siren}
        onToggle={toggleSiren}
        labelOn={t("sos.sent.toolOn")}
        labelOff={t("sos.sent.toolOff")}
      />
      <ToolButton
        title={t("sos.sent.morseTitle")}
        desc={t("sos.sent.morseDesc")}
        on={morse}
        onToggle={toggleMorse}
        labelOn={t("sos.sent.toolOn")}
        labelOff={t("sos.sent.toolOff")}
      />

      {/* Torch native: CameraView 1x1 tersembunyi dengan enableTorch
          mengikuti pola morse. Web mengabaikan torch — overlay yang
          bekerja. */}
      {morse && Platform.OS !== "web" ? (
        <CameraView style={styles.hiddenCamera} enableTorch={flashOn} />
      ) : null}

      {/* Overlay layar putih berkedip pola morse (semua platform). */}
      <Modal visible={morse && flashOn} transparent animationType="none">
        <View style={styles.flashOverlay} />
      </Modal>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  tools: { width: "100%", marginBottom: 16 },
  toolsTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: c.text3,
    marginBottom: 9,
  },
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.line,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 9,
    ...shadowCard,
  },
  toolBtnOn: { borderColor: c.stSos },
  tic: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: c.errBg,
    alignItems: "center",
    justifyContent: "center",
  },
  ticGlyph: { color: c.stSos, fontSize: 18, fontWeight: "800" },
  ttext: { flex: 1, minWidth: 0 },
  ttextTitle: { fontSize: 14, fontWeight: "800", color: c.text },
  ttextDesc: {
    fontSize: 12,
    color: c.text2,
    lineHeight: 12 * 1.45,
    marginTop: 2,
  },
  st: {
    backgroundColor: c.surface2,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: radii.pill,
  },
  stOn: { backgroundColor: c.stSos },
  stText: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: c.text3,
  },
  stTextOn: { color: "#fff" },
  hiddenCamera: { position: "absolute", width: 1, height: 1, opacity: 0 },
  flashOverlay: { flex: 1, backgroundColor: "#ffffff" },
});
