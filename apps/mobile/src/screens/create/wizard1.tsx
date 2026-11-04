// Wizard langkah 1 — pilih gunung dari katalog API §10 (125 gunung
// MDPL shifted). Katalog statis 4 gunung dihapus 3 Nov 2026: tanpa
// data API, tampil error/kosong yang jujur, bukan daftar contoh.
import { useEffect, useMemo, useState } from "react";
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
import { Image } from "expo-image";

import {
  NextButton,
  WizardAppbar,
  WizardFoot,
  WizardProgress,
} from "@/components/WizardUi";
import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme";
import { type Mountain } from "@/utils/mountains";
import { fetchMountains } from "@/utils/mountains-api";
import { apiMountainListToCatalog } from "@/utils/mountains-catalog";

export function Wizard1Screen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { tripType } = useLocalSearchParams<{ tripType: string }>();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [list, setList] = useState<Mountain[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchMountains()
      .then((apiList) => {
        if (alive) setList(apiList.map(apiMountainListToCatalog));
      })
      .catch(() => {
        if (alive) {
          setList([]);
          setFailed(true);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = list ?? [];
    if (!q) return base;
    return base.filter(
      (m) =>
        m.name.toLowerCase().includes(q) || m.location.toLowerCase().includes(q),
    );
  }, [query, list]);

  return (
    <View style={styles.root}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <WizardAppbar
          title={t("wizard.title")}
          step={t("wizard.step2")}
          backLabel={t("wizard.backStep1")}
        />
        <WizardProgress fraction={2 / 3} />
        <Text style={styles.question}>{t("wizard.question")}</Text>

        {/* .search */}
        <View style={styles.search}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t("wizard.searchPlaceholder")}
            placeholderTextColor={colors.text3}
            autoCorrect={false}
          />
        </View>

        {/* MountainCard — dari API; gagal/kosong tampil jujur. */}
        {list === null ? (
          <ActivityIndicator style={styles.loading} />
        ) : failed ? (
          <View style={styles.errBox}>
            <Text style={styles.errText}>{t("errors.unavailable")}</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t("mountains.empty")}</Text>
          </View>
        ) : (
          filtered.map((m) => {
          const sel = selected === m.id;
          return (
            <Pressable
              key={m.id}
              style={[styles.mtn, sel && styles.mtnSel]}
              onPress={() => setSelected(m.id)}
            >
              {/* Foto gunung: tampil bila API punya imageUrl,
                  fallback area warna bila belum ada foto. */}
              {m.imageUrl ? (
                <Image
                  source={{ uri: m.imageUrl }}
                  style={styles.mtnPhoto}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.mtnPhoto} />
              )}
              <View style={styles.mtnBody}>
                <View style={styles.mtnRow}>
                  <Text style={styles.mtnName}>{m.name}</Text>
                  <Text style={styles.mtnElev}>{m.elevation}</Text>
                  {sel ? (
                    <View style={styles.check}>
                      <Text style={styles.checkText}>
                        {t("wizard.selected")}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.mtnDesc}>
                  {m.location} • {t(m.difficultyKey)}
                </Text>
              </View>
            </Pressable>
          );
        }) )}

        {/* Gunung tidak ada? Tambah gunung buatan user (antre admin). */}
        <Pressable
          style={styles.addBtn}
          onPress={() => router.push("/create-trip/add-mountain")}
        >
          <Text style={styles.addBtnText}>{t("proposal.addMountainCta")}</Text>
        </Pressable>

      </ScrollView>
      <View style={styles.footer}>
        <WizardFoot>
          <NextButton
            label={selected ? t("wizard.toRoute") : t("wizard.pickFirst")}
            disabled={!selected}
            onPress={() =>
              selected &&
              router.push({
                pathname: "/create-trip/wizard2",
                params: { mountainId: selected, tripType: tripType ?? "HIKING" },
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
  question: {
    fontSize: 15,
    fontWeight: "700",
    color: c.text,
    marginBottom: 12,
  },
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
  emptyCard: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
    ...shadowCard,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: c.text2,
    textAlign: "center",
  },
  // .search 46px
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
    marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 13.5, color: c.text },
  // .mtn
  mtn: {
    width: "100%",
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.line,
    borderRadius: radii.lg,
    overflow: "hidden",
    marginBottom: 12,
    ...shadowCard,
  },
  mtnSel: { borderColor: c.primary },
  // .mtn img 118px
  mtnPhoto: { height: 118, backgroundColor: c.catPendakianBg },
  mtnBody: { paddingTop: 12, paddingHorizontal: 15, paddingBottom: 14 },
  mtnRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  mtnName: { fontSize: 15.5, fontWeight: "800", color: c.text, flex: 1 },
  mtnElev: { fontSize: 12, fontWeight: "800", color: c.primaryDark },
  // .check (DIPILIH)
  check: {
    backgroundColor: c.primary,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
  },
  checkText: {
    color: "#fff",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  mtnDesc: {
    fontSize: 12.5,
    color: c.text2,
    lineHeight: 12.5 * 1.55,
    marginTop: 5,
  },
  // Tombol tambah gunung (link aksi, bukan kartu gunung).
  addBtn: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: c.primary,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  addBtnText: { fontSize: 13.5, fontWeight: "800", color: c.primaryDark },
});
