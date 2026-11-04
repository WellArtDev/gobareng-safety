// Tambah gunung buatan user — dari layar pilih gunung (wizard1).
// Form: nama gunung + lokasi + ketinggian (opsional) + tandai titik
// lokasi di peta (Leaflet WebView, pola touring-location). Submit
// masuk ANTRE PERSETUJUAN ADMIN — gunung tidak langsung tampil di
// katalog, dan trip tidak bisa dibuat darinya sampai disetujui.
import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { WebView } from "react-native-webview";

import {
  NextButton,
  WizardAppbar,
  WizardFoot,
  WizardProgress,
} from "@/components/WizardUi";
import { useTranslation } from "@/i18n";
import { radii, type ThemeColors } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme";
import { leafletMapHtml, reverseGeocode } from "@/utils/location-search";
import { submitMountainProposal } from "@/utils/proposals-api";
import { validateMountainProposal } from "@/utils/proposal-validation";

const DEFAULT_CENTER = { lat: -6.2088, lon: 106.8456 };

export function AddMountainScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const webRef = useRef<ComponentRef<typeof WebView>>(null);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [elevation, setElevation] = useState("");
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // HTML peta dihitung SEKALI saat mount dari pusat default Jakarta —
  // BUKAN dari point yang berubah tiap ketuk. Dulu source dihitung
  // ulang tiap render dari center (point ?? default), jadi tiap ketuk
  // peta -> setPoint -> string HTML baru -> WebView reload total ->
  // Leaflet init ulang di zoom 12, dan zoom jalan pengguna hilang.
  // Perubahan point sesudahnya HANYA lewat inject setMapPin (effect
  // di bawah, yang sejak PR #195 memakai panTo tanpa menyentuh zoom).
  const mapHtmlRef = useRef<string | null>(null);
  if (mapHtmlRef.current === null) {
    mapHtmlRef.current = leafletMapHtml(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon, 12);
  }

  useEffect(() => {
    if (!point) return;
    webRef.current?.injectJavaScript(
      `window.setMapPin(${point.lat}, ${point.lon}); true;`,
    );
  }, [point]);

  const onMapMessage = async (event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        lat?: number;
        lon?: number;
      };
      if (msg.type !== "pick" || typeof msg.lat !== "number" || typeof msg.lon !== "number") {
        return;
      }
      setPoint({ lat: msg.lat, lon: msg.lon });
      if (!location.trim()) {
        const place = await reverseGeocode(msg.lat, msg.lon);
        if (place) setLocation(place);
      }
    } catch {
      // Pesan WebView bukan JSON pick — abaikan.
    }
  };

  const submit = async () => {
    const elevationM = elevation.trim() ? Number(elevation.trim()) : null;
    const err = validateMountainProposal({
      name,
      location,
      lat: point?.lat ?? null,
      lon: point?.lon ?? null,
      elevationM:
        elevationM !== null && Number.isFinite(elevationM) ? Math.round(elevationM) : null,
    });
    if (err) {
      setError(t(err));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await submitMountainProposal({
        name: name.trim(),
        location: location.trim(),
        lat: point!.lat,
        lon: point!.lon,
        elevationM:
          elevationM !== null && Number.isFinite(elevationM) ? Math.round(elevationM) : null,
      });
      setSubmitted(true);
    } catch {
      setError(t("errors.unavailable"));
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <View style={styles.root}>
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
          <WizardAppbar title={t("proposal.addMountainTitle")} step={t("wizard.step2")} backLabel={t("wizard.backStep2")} />
          <Text style={styles.successTitle}>{t("proposal.submittedTitle")}</Text>
          <Text style={styles.successBody}>{t("proposal.submittedMountainBody")}</Text>
          <Pressable style={styles.backBtn} onPress={() => router.replace("/create-trip/wizard1")}>
            <Text style={styles.backBtnText}>{t("proposal.backToWizard")}</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <WizardAppbar title={t("proposal.addMountainTitle")} step={t("wizard.step2")} backLabel={t("wizard.backStep2")} />
        <WizardProgress fraction={2 / 3} />
        <Text style={styles.label}>{t("proposal.mountainName")}</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t("proposal.mountainNamePlaceholder")}
          placeholderTextColor={colors.text3}
          autoCorrect={false}
        />
        <Text style={styles.label}>{t("proposal.location")}</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder={t("proposal.locationPlaceholder")}
          placeholderTextColor={colors.text3}
          autoCorrect={false}
        />
        <Text style={styles.label}>{t("proposal.elevationOptional")}</Text>
        <TextInput
          style={styles.input}
          value={elevation}
          onChangeText={setElevation}
          placeholder={t("proposal.elevationPlaceholder")}
          placeholderTextColor={colors.text3}
          keyboardType="number-pad"
        />
        <Text style={styles.label}>{t("proposal.pickPoint")}</Text>
        <Text style={styles.hint}>{t("proposal.pickPointHint")}</Text>
        <WebView
          ref={webRef}
          style={styles.map}
          source={{ html: mapHtmlRef.current }}
          onMessage={onMapMessage}
        />
        {point ? (
          <Text style={styles.coords}>
            {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
          </Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.footer}>
        <WizardFoot>
          <NextButton
            label={saving ? t("proposal.saving") : t("proposal.submit")}
            disabled={saving || !point}
            onPress={() => void submit()}
          />
        </WizardFoot>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    screen: { flex: 1 },
    content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 110 },
    label: { fontSize: 13, fontWeight: "700", color: c.text, marginTop: 12, marginBottom: 6 },
    hint: { fontSize: 12, color: c.text3, marginBottom: 8 },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.md,
      paddingHorizontal: 14,
      height: 46,
      fontSize: 13.5,
      color: c.text,
    },
    map: { height: 280, borderRadius: radii.lg },
    coords: { fontSize: 12, color: c.text3, marginTop: 8 },
    error: { fontSize: 13, color: "#e11d48", marginTop: 10 },
    footer: { paddingHorizontal: 20, paddingBottom: 16, backgroundColor: c.bg },
    successTitle: { fontSize: 17, fontWeight: "800", color: c.text, marginTop: 16 },
    successBody: { fontSize: 13.5, color: c.text2, lineHeight: 13.5 * 1.55, marginTop: 8 },
    backBtn: {
      backgroundColor: c.primary,
      borderRadius: radii.md,
      paddingVertical: 13,
      alignItems: "center",
      marginTop: 20,
    },
    backBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  });
