// Wizard touring — search lokasi: kolom search (Nominatim) + peta
// Leaflet di WebView. Pilih dari hasil search, atau ketuk peta (pin
// pindah, nama didapat dari reverse-geocode). Tombol konfirmasi
// mengembalikan lokasi terpilih ke form buat trip.
// Mode: "pick" (fresh dari pilih jenis, field=tujuan) atau "return"
// (dari form, field=tujuan|tikum, nilai form lain dipertahankan).
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
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
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme";
import { getCurrentPosition } from "@/utils/geo";
import {
  applyPickedLocation,
  resolveMapPickerCenter,
  type CreateFormLocationParams,
} from "@/utils/create-trip-location";
import {
  leafletMapHtml,
  resolvePickedName,
  reverseGeocode,
  searchLocationsDetailed,
  type LocationResult,
} from "@/utils/location-search";

const DEFAULT_CENTER = { lat: -6.2088, lon: 106.8456 };

export function TouringLocationScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    tripType: string;
    field: string;
    mode: string;
    mountainId: string;
    routeId: string;
    mountainLat: string;
    mountainLon: string;
    name: string;
    date: string;
    time: string;
    meet: string;
    tujuan: string;
    tujuanLat: string;
    tujuanLon: string;
    tikumLat: string;
    tikumLon: string;
    desc: string;
    quota: string;
  }>();
  const field = params.field === "tikum" ? "tikum" : "tujuan";
  const webRef = useRef<ComponentRef<typeof WebView>>(null);

  const initial = useMemo(() => {
    const lat =
      field === "tikum" ? Number(params.tikumLat) : Number(params.tujuanLat);
    const lon =
      field === "tikum" ? Number(params.tikumLon) : Number(params.tujuanLon);
    const name = field === "tikum" ? params.meet : params.tujuan;
    if (name && Number.isFinite(lat) && Number.isFinite(lon)) {
      return { name, lat, lon };
    }
    return null;
  }, [field, params.meet, params.tujuan, params.tikumLat, params.tikumLon, params.tujuanLat, params.tujuanLon]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [selected, setSelected] = useState<LocationResult | null>(initial);
  const [deviceCenter, setDeviceCenter] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [gpsFailed, setGpsFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Pusat awal peta: pilihan > gunung (hiking: basecamp, bukan GPS) >
  // Jakarta. Touring tak mengirim koordinat gunung, jadi perilakunya
  // tidak berubah.
  const mountainCenter = (() => {
    const lat = Number(params.mountainLat);
    const lon = Number(params.mountainLon);
    return Number.isFinite(lat) && Number.isFinite(lon)
      ? { lat, lon }
      : null;
  })();

  // HTML peta dihitung SEKALI saat mount dari pusat awal di atas —
  // BUKAN dari deviceCenter yang datang async belakangan. Dulu source
  // dihitung ulang tiap render dari center (pilihan > gunung > GPS >
  // Jakarta), jadi tiap ketuk peta -> setSelected -> center berubah ->
  // string HTML baru -> WebView reload total -> Leaflet init ulang di
  // zoom 12, dan zoom jalan pengguna hilang. Perubahan selected
  // sesudahnya HANYA lewat inject setMapPin (effect di bawah).
  const mapHtmlRef = useRef<string | null>(null);
  if (mapHtmlRef.current === null) {
    const start = resolveMapPickerCenter({
      selected: initial,
      mountain: mountainCenter,
      device: null,
      fallback: DEFAULT_CENTER,
    });
    mapHtmlRef.current = leafletMapHtml(start.lat, start.lon, 12);
  }

  // Pusatkan peta ke GPS perangkat saat layar dibuka, hanya bila belum
  // ada lokasi terpilih (mode fresh). Gagal/ditolak -> diam-diam tetap
  // di default Jakarta, layar tidak pernah diblokir.
  useEffect(() => {
    if (initial) return;
    let alive = true;
    getCurrentPosition().then((pos) => {
      if (alive && pos) setDeviceCenter(pos);
    });
    return () => {
      alive = false;
    };
  }, [initial]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearchFailed(false);
      setSearched(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const { results: found, failed } = await searchLocationsDetailed(q);
      setResults(found);
      setSearchFailed(failed);
      setSearching(false);
      setSearched(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!selected) return;
    webRef.current?.injectJavaScript(
      `window.setMapPin(${selected.lat}, ${selected.lon}); true;`,
    );
  }, [selected]);

  // Pusatkan ke GPS saat deviceCenter tiba (dan peta sudah siap),
  // hanya bila belum ada lokasi terpilih. Lewat inject, bukan
  // regenerasi source — zoom awal 12 tetap, tanpa reload WebView.
  // mapReady menjaga inject tidak hilang sebelum Leaflet dimuat.
  useEffect(() => {
    if (!mapReady || !deviceCenter || selected) return;
    webRef.current?.injectJavaScript(
      `window.setMapPin(${deviceCenter.lat}, ${deviceCenter.lon}); true;`,
    );
  }, [mapReady, deviceCenter, selected]);

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
      const name = resolvePickedName(
        await reverseGeocode(msg.lat, msg.lon),
        msg.lat,
        msg.lon,
      );
      setGpsFailed(false);
      setSelected({ name, lat: msg.lat, lon: msg.lon });
    } catch {
      // Pesan WebView bukan JSON pick — abaikan.
    }
  };

  // Tombol "Lokasi saya": pusatkan peta ke GPS perangkat DAN jadikan
  // titik itu lokasi terpilih (nama dari reverse-geocode, fallback
  // koordinat mentah — sama seperti alur ketuk peta). Gagal -> pesan
  // saja, pilihan yang sudah ada tidak hilang.
  const useMyLocation = async () => {
    setLocating(true);
    setGpsFailed(false);
    const pos = await getCurrentPosition();
    if (!pos) {
      setLocating(false);
      setGpsFailed(true);
      return;
    }
    const name = resolvePickedName(
      await reverseGeocode(pos.lat, pos.lon),
      pos.lat,
      pos.lon,
    );
    setSelected({ name, lat: pos.lat, lon: pos.lon });
    setLocating(false);
  };

  const confirm = () => {
    if (!selected) return;
    // Kembalikan SEMUA field form (termasuk mountainId/routeId hiking)
    // lewat helper murni — dulu field gunung hilang di jalur kembali.
    const base: CreateFormLocationParams = {
      tripType: params.tripType ?? "TOURING",
      mountainId: params.mountainId ?? "",
      routeId: params.routeId ?? "",
      name: params.name ?? "",
      date: params.date ?? "",
      time: params.time ?? "",
      meet: params.meet ?? "",
      tujuan: params.tujuan ?? "",
      tujuanLat: params.tujuanLat ?? "",
      tujuanLon: params.tujuanLon ?? "",
      tikumLat: params.tikumLat ?? "",
      tikumLon: params.tikumLon ?? "",
      desc: params.desc ?? "",
      quota: params.quota ?? "",
    };
    const next = applyPickedLocation(base, field, selected);
    router.push({ pathname: "/create-trip/form", params: next });
  };

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <WizardAppbar
          title={t("location.title")}
          step={t("wizard.step2")}
          backLabel={
            params.mode === "return"
              ? t("create.backLabel")
              : t("wizard.backStep1")
          }
        />
        <WizardProgress fraction={2 / 3} />
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
      </View>

      <WebView
        ref={webRef}
        style={styles.map}
        source={{ html: mapHtmlRef.current ?? "" }}
        onMessage={onMapMessage}
        onLoadEnd={() => setMapReady(true)}
      />
      <View style={styles.gpsRow}>
        <Pressable
          style={styles.gpsButton}
          onPress={useMyLocation}
          disabled={locating}
        >
          {locating ? <ActivityIndicator color={colors.primary} /> : null}
          <Text style={styles.gpsButtonText}>{t("location.myLocation")}</Text>
        </Pressable>
      </View>
      {gpsFailed ? (
        <Text style={styles.gpsError}>{t("location.gpsUnavailable")}</Text>
      ) : null}
      <Text style={styles.tapHint}>{t("location.tapHint")}</Text>

      <ScrollView style={styles.results}>
        {results.map((r) => {
          const sel = selected?.name === r.name;
          return (
            <Pressable
              key={`${r.name}|${r.lat}|${r.lon}`}
              style={[styles.result, sel && styles.resultSel]}
              onPress={() => {
                setGpsFailed(false);
                setSelected(r);
              }}
            >
              <Text style={styles.resultName}>{r.name}</Text>
              <Text style={styles.resultCoords}>
                {r.lat.toFixed(5)}, {r.lon.toFixed(5)}
              </Text>
            </Pressable>
          );
        })}
        {searched && !searching && searchFailed ? (
          <Text style={styles.empty}>{t("location.searchFailed")}</Text>
        ) : null}
        {searched && !searching && !searchFailed && results.length === 0 ? (
          <Text style={styles.empty}>{t("location.noResults")}</Text>
        ) : null}
        {selected ? (
          <View style={styles.selectedCard}>
            <Text style={styles.selectedLabel}>{t("location.selected")}</Text>
            <Text style={styles.selectedName}>{selected.name}</Text>
            <Text style={styles.resultCoords}>
              {selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <WizardFoot>
          <NextButton
            label={t("location.pickThis")}
            disabled={!selected}
            onPress={confirm}
          />
        </WizardFoot>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    top: { paddingTop: 20, paddingHorizontal: 20 },
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
      marginBottom: 12,
    },
    searchInput: { flex: 1, fontSize: 13.5, color: c.text },
    map: { height: 280, marginHorizontal: 20, borderRadius: radii.lg },
    gpsRow: { flexDirection: "row", paddingHorizontal: 20, paddingTop: 10 },
    gpsButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: radii.md,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    gpsButtonText: { fontSize: 13.5, fontWeight: "700", color: c.primaryDark },
    gpsError: {
      fontSize: 12.5,
      color: c.danger,
      paddingHorizontal: 20,
      paddingTop: 6,
    },
    tapHint: {
      fontSize: 12,
      color: c.text3,
      paddingHorizontal: 20,
      paddingTop: 8,
    },
    results: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
    result: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.md,
      paddingVertical: 11,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    resultSel: { borderColor: c.primary },
    resultName: { fontSize: 13.5, fontWeight: "700", color: c.text },
    resultCoords: { fontSize: 12, color: c.text3, marginTop: 2 },
    empty: { fontSize: 13, color: c.text3, paddingVertical: 8 },
    selectedCard: {
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: radii.md,
      paddingVertical: 11,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    selectedLabel: {
      fontSize: 10.5,
      fontWeight: "800",
      letterSpacing: 0.5,
      color: c.primaryDark,
    },
    selectedName: {
      fontSize: 13.5,
      fontWeight: "700",
      color: c.text,
      marginTop: 3,
    },
    footer: { paddingHorizontal: 20, paddingBottom: 16, backgroundColor: c.bg },
  });
