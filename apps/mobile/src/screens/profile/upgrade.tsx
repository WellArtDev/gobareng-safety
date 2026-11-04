// Layar Upgrade ke Pro — mockup data-screen="upgrade": hero bintang +
// harga, blok status (pending kuning / aktif hijau), MANFAAT PRO,
// BAYAR VIA QRIS + 'Saya sudah bayar' -> POST /auth/me/upgrade.
// Gambar QRIS merchant diunggah admin dari dashboard (kartu Pro
// Payment) dan dibaca dari GET /auth/me/upgrade proQrisUrl; bila belum
// ada, placeholder tetap tampil. Tombol 'simulasikan verifikasi'
// mockup TIDAK dirender (tanpa mode demo).
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import { formatRupiah } from "@/utils/create-trip-logic";
import {
  fetchUpgradeStatus,
  requestUpgrade,
  resolveProQrisUrl,
  type UpgradeStatus,
} from "@/utils/pay-api";

export function UpgradeScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [status, setStatus] = useState<UpgradeStatus | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchUpgradeStatus());
      setErrorKey(null);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await requestUpgrade();
      await load();
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setBusy(false);
    }
  };

  const isPro = status?.isPro ?? false;
  const pending = !isPro && status?.request?.status === "PENDING";
  const price = formatRupiah(status?.price ?? 150000);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.appbar}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          accessibilityLabel={t("upgrade.backLabel")}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t("upgrade.title")}</Text>
      </View>

      {/* .upg-hero */}
      <View style={styles.hero}>
        <View style={styles.star}>
          <Text style={styles.starGlyph}>★</Text>
        </View>
        <Text style={styles.heroName}>{t("upgrade.heroName")}</Text>
        <Text style={styles.heroPrice}>{price}</Text>
        <Text style={styles.heroSub}>{t("upgrade.heroSub")}</Text>
      </View>

      {errorKey ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{t(errorKey)}</Text>
        </View>
      ) : null}

      {/* .upg-status pending */}
      {pending ? (
        <View style={[styles.statusBox, styles.statusPending]}>
          <Text style={styles.statusTitle}>{t("upgrade.pendingTitle")}</Text>
          <Text style={styles.statusDesc}>{t("upgrade.pendingDesc")}</Text>
        </View>
      ) : null}

      {/* .upg-status aktif */}
      {isPro ? (
        <View style={[styles.statusBox, styles.statusActive]}>
          <Text style={[styles.statusTitle, styles.statusTitleOk]}>
            {t("upgrade.activeTitle")}
          </Text>
          <Text style={styles.statusDesc}>{t("upgrade.activeDesc")}</Text>
          <Pressable
            style={({ pressed }) => [styles.btnMain, pressed && styles.btnPressed]}
            onPress={() => router.push("/explore")}
          >
            <Text style={styles.btnMainText}>{t("upgrade.activeCta")}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* .upg-benefits */}
      <View style={styles.benefits}>
        <Text style={styles.benefitsTitle}>{t("upgrade.benefitsTitle")}</Text>
        {(["benefit1", "benefit2", "benefit3", "benefit4"] as const).map(
          (key) => (
            <View key={key} style={styles.benefitRow}>
              <View style={styles.check}>
                <Text style={styles.checkGlyph}>✓</Text>
              </View>
              <Text style={styles.benefitText}>{t(`upgrade.${key}`)}</Text>
            </View>
          ),
        )}
      </View>

      {/* .qris-card + 'Saya sudah bayar' — hanya saat belum Pro/pending */}
      {!isPro && !pending ? (
        <>
          <View style={styles.qrisCard}>
            <Text style={styles.qrisTitle}>{t("upgrade.qrisTitle")}</Text>
            {/* QRIS aktif dari dashboard; placeholder bila admin belum
                mengunggah. Harga + verifikasi admin tidak berubah. */}
            {resolveProQrisUrl(status?.proQrisUrl) ? (
              <Image
                source={{ uri: resolveProQrisUrl(status?.proQrisUrl) ?? "" }}
                style={styles.qrisImage}
                resizeMode="contain"
                accessibilityLabel={t("upgrade.qrisTitle")}
              />
            ) : (
              <View style={styles.qrisPlaceholder}>
                <Text style={styles.qrisPlaceholderText}>
                  {t("upgrade.qrisComingSoon")}
                </Text>
              </View>
            )}
            <Text style={styles.qrisNote}>
              {t("upgrade.qrisNote", { amount: price })}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.btnMain, pressed && styles.btnPressed]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnMainText}>{t("upgrade.paid")}</Text>
            )}
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 26 },
  appbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: "center",
    justifyContent: "center",
  },
  backGlyph: { fontSize: 24, fontWeight: "700", color: c.text },
  appbarTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: c.text,
    flex: 1,
  },
  hero: {
    alignItems: "center",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 12,
    ...shadowCard,
  },
  star: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: c.goldBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  starGlyph: { fontSize: 24, color: c.gold },
  heroName: { fontSize: 17, fontWeight: "800", color: c.text },
  heroPrice: {
    fontSize: 24,
    fontWeight: "800",
    color: c.primaryDark,
    marginTop: 4,
  },
  heroSub: {
    fontSize: 12.5,
    color: c.text2,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 12.5 * 1.55,
  },
  errBox: {
    backgroundColor: c.errBg,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  errText: { color: c.stSosDark, fontSize: 13, fontWeight: "700" },
  statusBox: {
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
  },
  statusPending: { backgroundColor: c.warningBg },
  statusActive: { backgroundColor: c.successBg },
  statusTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: c.warning,
    marginBottom: 5,
  },
  statusTitleOk: { color: c.success },
  statusDesc: {
    fontSize: 12.5,
    color: c.text2,
    lineHeight: 12.5 * 1.6,
  },
  benefits: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
    ...shadowCard,
  },
  benefitsTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: c.text3,
    marginBottom: 10,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 9,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: c.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkGlyph: { fontSize: 10, fontWeight: "800", color: c.primaryDark },
  benefitText: {
    flex: 1,
    fontSize: 13,
    color: c.text,
    lineHeight: 13 * 1.5,
  },
  qrisCard: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
    alignItems: "center",
    ...shadowCard,
  },
  qrisTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: c.text3,
    marginBottom: 10,
  },
  qrisImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radii.md,
    marginBottom: 10,
  },
  qrisPlaceholder: {
    width: "100%",
    minHeight: 120,
    borderRadius: radii.md,
    backgroundColor: c.surface2,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    marginBottom: 10,
  },
  qrisPlaceholderText: {
    fontSize: 12,
    color: c.text2,
    textAlign: "center",
    lineHeight: 12 * 1.55,
  },
  qrisNote: {
    fontSize: 12,
    color: c.text2,
    textAlign: "center",
    lineHeight: 12 * 1.55,
  },
  btnMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    borderRadius: radii.md,
    paddingVertical: 15,
    paddingHorizontal: 18,
    backgroundColor: c.primary,
    marginTop: 10,
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 6,
  },
  btnPressed: {
    backgroundColor: c.primaryDark,
    transform: [{ scale: 0.985 }],
  },
  btnMainText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
