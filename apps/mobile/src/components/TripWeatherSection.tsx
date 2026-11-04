// Cuaca tujuan di alur buat trip — kondisi SAAT INI via
// /weather/current (BMKG Indonesia, Open-Meteo di luar). Fail-soft
// total: masih memuat / gagal / tanpa data -> render null, form tetap
// bisa disubmit. Beda dari WeatherCard (yang menampilkan catatan
// kosong + gempa): di sini bagian cuaca hilang total bila tak ada data.
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import {
  fetchCurrentWeather,
  type WeatherResult,
} from "@/utils/weather-api";

export function TripWeatherSection({
  lat,
  lon,
}: {
  lat: number;
  lon: number;
}) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [weather, setWeather] = useState<WeatherResult | null>(null);

  useEffect(() => {
    let active = true;
    fetchCurrentWeather(lat, lon).then((w) => {
      if (active) setWeather(w);
    });
    return () => {
      active = false;
    };
  }, [lat, lon]);

  const current = weather?.weather;
  if (!current) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("create.weatherTitle")}</Text>
      <Text style={styles.main}>
        {current.temperatureC !== null ? `${current.temperatureC}°C` : "—"}
        {current.description ? ` · ${current.description}` : ""}
      </Text>
      <Text style={styles.sub}>
        {current.windSpeedKmh !== null
          ? `${t("weather.wind")} ${current.windSpeedKmh} km/j · `
          : ""}
        {t("weather.source")}:{" "}
        {weather.provider === "bmkg" ? "BMKG" : "Open-Meteo"}
      </Text>
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
      marginBottom: 13,
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
  });
