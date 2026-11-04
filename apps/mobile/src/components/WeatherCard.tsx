// Kartu cuaca + gempa WX-1 untuk layar trip — fail-soft: tanpa data
// tampil catatan kosong, tidak pernah memblokir layar.
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import {
  fetchCurrentWeather,
  fetchQuakes,
  type Quake,
  type WeatherResult,
} from "@/utils/weather-api";

const MAX_QUAKES_SHOWN = 2;

export function WeatherCard({ lat, lon }: { lat: number; lon: number }) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [quakes, setQuakes] = useState<Quake[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([fetchCurrentWeather(lat, lon), fetchQuakes(lat, lon)]).then(
      ([w, q]) => {
        if (!active) return;
        setWeather(w);
        setQuakes(q);
      },
    );
    return () => {
      active = false;
    };
  }, [lat, lon]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("weather.title")}</Text>
      {weather?.weather ? (
        <>
          <Text style={styles.main}>
            {weather.weather.temperatureC !== null
              ? `${weather.weather.temperatureC}°C`
              : "—"}
            {weather.weather.windSpeedKmh !== null
              ? ` · ${t("weather.wind")} ${weather.weather.windSpeedKmh} km/j`
              : ""}
          </Text>
          <Text style={styles.sub}>
            {t("weather.source")}:{" "}
            {weather.provider === "bmkg" ? "BMKG" : "Open-Meteo"}
          </Text>
        </>
      ) : (
        <Text style={styles.sub}>{t("weather.empty")}</Text>
      )}

      <Text style={styles.quakeTitle}>{t("weather.quakeTitle")}</Text>
      {quakes.length > 0 ? (
        quakes.slice(0, MAX_QUAKES_SHOWN).map((quake) => (
          <View key={`${quake.time}-${quake.region}`} style={styles.quakeRow}>
            <Text style={styles.quakeMag}>
              {t("weather.magnitude")}
              {quake.magnitude ?? "—"}
            </Text>
            <Text style={styles.quakeRegion} numberOfLines={1}>
              {quake.region ?? "—"}
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.sub}>{t("weather.quakeEmpty")}</Text>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 12,
    ...shadowCard,
  },
  title: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: c.text3,
    marginBottom: 6,
  },
  main: { fontSize: 17, fontWeight: "800", color: c.text },
  sub: { fontSize: 12, color: c.text2, marginTop: 2 },
  quakeTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: c.text3,
    marginTop: 10,
    marginBottom: 4,
  },
  quakeRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    paddingVertical: 3,
  },
  quakeMag: { fontSize: 13, fontWeight: "800", color: c.stSosDark },
  quakeRegion: { flex: 1, fontSize: 12.5, color: c.text },
});
