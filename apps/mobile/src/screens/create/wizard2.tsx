// Wizard langkah 2 — pilih jalur dari detail API §10. Katalog statis
// dihapus 3 Nov 2026: gagal memuat tampil error jujur + tombol kembali,
// bukan daftar jalur contoh.
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import {
  NextButton,
  WizardAppbar,
  WizardFoot,
  WizardProgress,
} from "@/components/WizardUi";
import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { type Mountain } from "@/utils/mountains";
import { fetchMountain } from "@/utils/mountains-api";
import { apiMountainToCatalog } from "@/utils/mountains-catalog";

export function Wizard2Screen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { mountainId, tripType } = useLocalSearchParams<{
    mountainId: string;
    tripType: string;
  }>();
  // Sumber = detail API §10 (jalur + checkpoint MDPL). Tanpa data API,
  // tidak ada daftar jalur yang ditampilkan sama sekali.
  const [apiMountain, setApiMountain] = useState<Mountain | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!mountainId) return;
    let alive = true;
    fetchMountain(mountainId)
      .then((detail) => {
        if (alive) setApiMountain(apiMountainToCatalog(detail));
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [mountainId]);
  const mountain = apiMountain;
  const [routeId, setRouteId] = useState<string | null>(null);

  // Jalur rekomendasi terpilih default begitu detail termuat.
  useEffect(() => {
    if (mountain && routeId === null) {
      const rec = mountain.routes.find((r) => r.recommended);
      setRouteId(rec ? rec.id : (mountain.routes[0]?.id ?? null));
    }
  }, [mountain, routeId]);

  if (!mountainId || failed) {
    return (
      <View style={styles.root}>
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
          <View style={styles.errBox}>
            <Text style={styles.errText}>{t("errors.unavailable")}</Text>
          </View>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>{t("common.back")}</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  if (!mountain) {
    return (
      <View style={styles.root}>
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
          <ActivityIndicator style={styles.loading} />
        </ScrollView>
      </View>
    );
  }

  const selectedRoute =
    mountain.routes.find((r) => r.id === routeId) ?? mountain.routes[0];

  return (
    <View style={styles.root}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <WizardAppbar
          title={t("wizard.routeTitle", { mountain: mountain.name })}
          step={t("wizard.step3")}
          backLabel={t("wizard.backStep2")}
        />
        <WizardProgress fraction={1} />

        {/* RouteOption */}
        {mountain.routes.map((r) => {
          const sel = r.id === selectedRoute.id;
          return (
            <Pressable
              key={r.id}
              style={[styles.routeOpt, sel && styles.routeOptSel]}
              onPress={() => setRouteId(r.id)}
            >
              <View style={[styles.radio, sel && styles.radioSel]}>
                {sel ? <View style={styles.radioDot} /> : null}
              </View>
              <View style={styles.routeTxt}>
                <View style={styles.routeRow}>
                  <Text style={styles.routeName}>{r.name}</Text>
                  {r.recommended ? (
                    <View style={styles.rec}>
                      <Text style={styles.recText}>
                        {t("wizard.recommended")}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.routeDesc}>
                  {r.distance} • {r.gain} • {r.duration}
                </Text>
              </View>
            </Pressable>
          );
        })}

        {/* CompareTable */}
        <Text style={styles.secTitle}>{t("wizard.compareTitle")}</Text>
        <View style={styles.cmp}>
          <View style={[styles.cmpRow, styles.cmpHead]}>
            <Text style={[styles.cmpCell, styles.cmpHeadText]}>
              {t("wizard.cmpRoute")}
            </Text>
            <Text style={[styles.cmpCell, styles.cmpHeadText]}>
              {t("wizard.cmpDistance")}
            </Text>
            <Text style={[styles.cmpCell, styles.cmpHeadText]}>
              {t("wizard.cmpGain")}
            </Text>
            <Text style={[styles.cmpCell, styles.cmpHeadText]}>
              {t("wizard.cmpDuration")}
            </Text>
          </View>
          {mountain.routes.map((r, index) => (
            <View
              key={r.id}
              style={[
                styles.cmpRow,
                r.id === selectedRoute.id && styles.cmpHl,
                index === mountain.routes.length - 1 && styles.cmpLast,
              ]}
            >
              <Text style={[styles.cmpCell, styles.cmpFirst]}>{r.name}</Text>
              <Text style={styles.cmpCell}>{r.distance}</Text>
              <Text style={styles.cmpCell}>{r.gain}</Text>
              <Text style={styles.cmpCell}>{r.duration}</Text>
            </View>
          ))}
        </View>

        {/* Jalur tidak ada? Buat jalur sendiri (antre admin). */}
        <Pressable
          style={styles.addBtn}
          onPress={() =>
            router.push({
              pathname: "/create-trip/add-route",
              params: { mountainId: mountain.id, mountainName: mountain.name },
            })
          }
        >
          <Text style={styles.addBtnText}>{t("proposal.addRouteCta")}</Text>
        </Pressable>

      </ScrollView>
      <View style={styles.footer}>
        <WizardFoot>
          <NextButton
            label={t("wizard.toForm")}
            disabled={!selectedRoute}
            onPress={() =>
              selectedRoute &&
              router.push({
                pathname: "/create-trip/form",
                params: {
                  mountainId: mountain.id,
                  routeId: selectedRoute.id,
                  tripType: tripType ?? "HIKING",
                },
              })
            }
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
  footer: { paddingHorizontal: 20, paddingBottom: 16, backgroundColor: c.bg },
  loading: { marginTop: 24 },
  errBox: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 12,
  },
  errText: { fontSize: 13, color: c.text2 },
  backBtn: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  backBtnText: { fontSize: 13, fontWeight: "800", color: c.text },
  // RouteOption (pola .vis-opt)
  routeOpt: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    width: "100%",
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    ...shadowCard,
  },
  routeOptSel: { borderColor: c.primary },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: c.line,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioSel: { borderColor: c.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: c.primary,
  },
  routeTxt: { flex: 1, minWidth: 0 },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  routeName: { fontSize: 14.5, fontWeight: "800", color: c.text },
  rec: {
    backgroundColor: c.primarySoft,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: radii.pill,
  },
  recText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: c.primaryDark,
  },
  routeDesc: {
    fontSize: 12.5,
    color: c.text2,
    lineHeight: 12.5 * 1.55,
    marginTop: 3,
  },
  secTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: c.text3,
    marginTop: 20,
    marginBottom: 10,
  },
  // .cmp
  cmp: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    overflow: "hidden",
    ...shadowCard,
  },
  cmpRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  cmpHead: { backgroundColor: c.surface2 },
  cmpHl: { backgroundColor: c.primarySoft },
  cmpLast: { borderBottomWidth: 0 },
  cmpCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 12.5,
    color: c.text,
  },
  cmpHeadText: { fontSize: 12, fontWeight: "800" },
  cmpFirst: { color: c.text2, fontWeight: "600" },
  // Tombol buat jalur (link aksi, bukan opsi jalur).
  addBtn: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: c.primary,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 14,
  },
  addBtnText: { fontSize: 13.5, fontWeight: "800", color: c.primaryDark },
});
