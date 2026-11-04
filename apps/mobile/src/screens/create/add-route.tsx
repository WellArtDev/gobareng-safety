// Buat jalur sendiri — dari layar pilih jalur (wizard2).
// Kolom cari lokasi (Nominatim, pola touring-location) memindah peta
// ke hasil yang dipilih; user tetap menandai checkpoint dengan ketuk
// peta (pin bernomor). Aturan
// keras: checkpoint PERTAMA adalah titik kumpul awal di kaki gunung
// (label oranye + validasi API); checkpoint pertama selalu bertanda
// itu, tidak bisa dipindah ke checkpoint lain. Submit masuk antre
// persetujuan admin — jalur tidak langsung live.
import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
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
import {
  searchLocations,
  type LocationResult,
} from "@/utils/location-search";
import { submitRouteProposal } from "@/utils/proposals-api";
import {
  validateRouteProposal,
  type RouteCheckpointInput,
} from "@/utils/proposal-validation";
import { routeMapHtml } from "@/utils/route-map-html";

const DEFAULT_CENTER = { lat: -6.2088, lon: 106.8456 };

export function AddRouteScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { mountainId, mountainName } = useLocalSearchParams<{
    mountainId: string;
    mountainName: string;
  }>();
  const webRef = useRef<ComponentRef<typeof WebView>>(null);

  const [name, setName] = useState("");
  const [checkpoints, setCheckpoints] = useState<RouteCheckpointInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Cari lokasi (pola touring-location): debounce Nominatim, pilih hasil
  // = peta pindah ke titik itu (tanpa menambah checkpoint — checkpoint
  // tetap ditambah dengan ketuk peta).
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearched(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      setResults(await searchLocations(q));
      setSearching(false);
      setSearched(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const pickSearchResult = (r: LocationResult) => {
    webRef.current?.injectJavaScript(
      `window.setMapCenter(${r.lat}, ${r.lon}); true;`,
    );
    setResults([]);
  };

  useEffect(() => {
    const pins = checkpoints.map((c) => [c.lat, c.lon]);
    webRef.current?.injectJavaScript(
      `window.setRoutePins(${JSON.stringify(pins)}); true;`,
    );
  }, [checkpoints]);

  const onMapMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        lat?: number;
        lon?: number;
      };
      if (msg.type !== "pick" || typeof msg.lat !== "number" || typeof msg.lon !== "number") {
        return;
      }
      // Tangkap ke konstanta agar narrowing bertahan di dalam closure
      // setState (TS tidak membawa narrowing lewat closure).
      const lat = msg.lat;
      const lon = msg.lon;
      setCheckpoints((prev) => [
        ...prev,
        {
          name: prev.length === 0 ? t("proposal.gatheringDefaultName") : `Pos ${prev.length + 1}`,
          lat,
          lon,
          isGathering: prev.length === 0,
        },
      ]);
    } catch {
      // Pesan WebView bukan JSON pick — abaikan.
    }
  };

  const removeCheckpoint = (index: number) => {
    setCheckpoints((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((c, i) => ({ ...c, isGathering: i === 0 })),
    );
  };

  const renameCheckpoint = (index: number, value: string) => {
    setCheckpoints((prev) =>
      prev.map((c, i) => (i === index ? { ...c, name: value } : c)),
    );
  };

  const submit = async () => {
    const err = validateRouteProposal(name, checkpoints);
    if (err) {
      setError(t(err));
      return;
    }
    if (!mountainId) {
      setError(t("errors.invalidPayload"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await submitRouteProposal(mountainId, {
        name: name.trim(),
        checkpoints: checkpoints.map((c) => ({
          name: c.name.trim(),
          lat: c.lat!,
          lon: c.lon!,
          isGathering: c.isGathering,
        })),
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
          <WizardAppbar title={t("proposal.addRouteTitle")} step={t("wizard.step3")} backLabel={t("wizard.backStep2")} />
          <Text style={styles.successTitle}>{t("proposal.submittedTitle")}</Text>
          <Text style={styles.successBody}>{t("proposal.submittedRouteBody")}</Text>
          <Pressable
            style={styles.backBtn}
            onPress={() =>
              router.replace({
                pathname: "/create-trip/wizard2",
                params: { mountainId: mountainId ?? "", tripType: "HIKING" },
              })
            }
          >
            <Text style={styles.backBtnText}>{t("proposal.backToWizard")}</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <WizardAppbar
          title={t("proposal.addRouteTitle")}
          step={t("wizard.step3")}
          backLabel={t("wizard.backStep2")}
        />
        <WizardProgress fraction={1} />
        <Text style={styles.mountain}>{mountainName ?? ""}</Text>
        <Text style={styles.label}>{t("proposal.routeName")}</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t("proposal.routeNamePlaceholder")}
          placeholderTextColor={colors.text3}
          autoCorrect={false}
        />
        <Text style={styles.label}>{t("proposal.markCheckpoints")}</Text>
        <Text style={styles.hint}>{t("proposal.markCheckpointsHint")}</Text>
        <Text style={styles.label}>{t("proposal.searchLocation")}</Text>
        <View style={styles.search}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t("location.searchPlaceholder")}
            placeholderTextColor={colors.text3}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching ? <ActivityIndicator color={colors.primary} /> : null}
        </View>
        {results.map((r) => (
          <Pressable
            key={`${r.name}|${r.lat}|${r.lon}`}
            style={styles.result}
            onPress={() => pickSearchResult(r)}
          >
            <Text style={styles.resultName}>{r.name}</Text>
            <Text style={styles.resultCoords}>
              {r.lat.toFixed(5)}, {r.lon.toFixed(5)}
            </Text>
          </Pressable>
        ))}
        {searched && !searching && results.length === 0 ? (
          <Text style={styles.empty}>{t("location.noResults")}</Text>
        ) : null}
        <WebView
          ref={webRef}
          style={styles.map}
          source={{ html: routeMapHtml(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon, 11) }}
          onMessage={onMapMessage}
        />
        {checkpoints.map((c, i) => (
          <View key={i} style={styles.cpRow}>
            <View style={[styles.cpNum, i === 0 && styles.cpNumFirst]}>
              <Text style={styles.cpNumText}>{i + 1}</Text>
            </View>
            <View style={styles.cpBody}>
              <TextInput
                style={styles.cpInput}
                value={c.name}
                onChangeText={(v) => renameCheckpoint(i, v)}
                placeholderTextColor={colors.text3}
                autoCorrect={false}
              />
              <Text style={styles.cpCoords}>
                {c.lat!.toFixed(5)}, {c.lon!.toFixed(5)}
              </Text>
              {i === 0 ? (
                <Text style={styles.cpGathering}>{t("proposal.gatheringLabel")}</Text>
              ) : null}
            </View>
            <Pressable style={styles.cpRemove} onPress={() => removeCheckpoint(i)}>
              <Text style={styles.cpRemoveText}>×</Text>
            </Pressable>
          </View>
        ))}
        {checkpoints.length === 0 ? (
          <Text style={styles.empty}>{t("proposal.noCheckpoints")}</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.footer}>
        <WizardFoot>
          <NextButton
            label={saving ? t("proposal.saving") : t("proposal.submit")}
            disabled={saving || checkpoints.length === 0}
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
    mountain: { fontSize: 14, fontWeight: "800", color: c.primaryDark, marginBottom: 4 },
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
    map: { height: 280, borderRadius: radii.lg, marginTop: 8 },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.md,
      paddingHorizontal: 14,
      height: 46,
    },
    searchInput: { flex: 1, fontSize: 13.5, color: c.text },
    result: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.md,
      paddingVertical: 11,
      paddingHorizontal: 14,
      marginTop: 8,
    },
    resultName: { fontSize: 13.5, fontWeight: "700", color: c.text },
    resultCoords: { fontSize: 12, color: c.text3, marginTop: 2 },
    cpRow: {
      flexDirection: "row",
      gap: 10,
      alignItems: "flex-start",
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.md,
      padding: 10,
      marginTop: 8,
    },
    cpNum: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    cpNumFirst: { backgroundColor: "#f78308" },
    cpNumText: { color: "#fff", fontSize: 12, fontWeight: "800" },
    cpBody: { flex: 1 },
    cpInput: { fontSize: 13.5, fontWeight: "700", color: c.text, paddingVertical: 2 },
    cpCoords: { fontSize: 12, color: c.text3, marginTop: 2 },
    cpGathering: { fontSize: 11, fontWeight: "800", color: "#f78308", marginTop: 2 },
    cpRemove: { paddingHorizontal: 4 },
    cpRemoveText: { fontSize: 22, color: c.text3, lineHeight: 22 },
    empty: { fontSize: 13, color: c.text3, marginTop: 10 },
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
