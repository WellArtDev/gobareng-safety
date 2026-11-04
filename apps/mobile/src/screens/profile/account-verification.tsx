// Layar "Verifikasi Akun" — dibuka dari menu Profil. TERPISAH dari
// pengajuan organizer: layar ini hanya soal email + WhatsApp akun
// sendiri, dan TIDAK pernah membaca/menulis isVerified / pengajuan
// organizer. Akun otomatis terverifikasi saat kedua kanal terbukti
// (server yang memutuskan; layar hanya menampilkan status).
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { Field, FormError, FormSuccess } from "@/components/AuthUi";
import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import {
  fetchVerificationStatus,
  requestEmailLink,
  requestWhatsappCode,
  verificationErrorKey,
  verifyWhatsappCode,
  type VerificationStatus,
} from "@/utils/account-verification-api";

const K = "profile.accountVerification";

export function AccountVerificationScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchVerificationStatus());
      setErrorKey(null);
    } catch (error) {
      if (error instanceof ApiError && error.i18nKey === "errors.unauthorized") {
        router.replace("/login");
        return;
      }
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = useCallback(
    async (fn: () => Promise<unknown>, doneKey: string) => {
      setBusy(true);
      setErrorKey(null);
      setNoticeKey(null);
      try {
        await fn();
        setNoticeKey(doneKey);
        await load();
      } catch (error) {
        setErrorKey(
          error instanceof ApiError
            ? verificationErrorKey(error.code)
            : "errors.unavailable",
        );
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t(`${K}.title`)}</Text>
      <Text style={styles.note}>{t(`${K}.note`)}</Text>

      {status ? (
        <View
          style={[
            styles.banner,
            status.accountVerified ? styles.bannerOk : styles.bannerWarn,
          ]}
        >
          <Text style={styles.bannerText}>
            {status.accountVerified
              ? t(`${K}.accountVerified`)
              : t(`${K}.accountNotVerified`)}
          </Text>
          {status.organizerVerified ? (
            <Text style={styles.bannerText}>{t(`${K}.organizerVerified`)}</Text>
          ) : null}
        </View>
      ) : null}

      <FormError message={errorKey ? t(errorKey) : null} />
      <FormSuccess message={noticeKey ? t(noticeKey) : null} />

      {/* Email */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t(`${K}.emailTitle`)}</Text>
        <Text style={styles.value}>{status?.email ?? "—"}</Text>
        <Text
          style={[
            styles.status,
            status?.emailVerified ? styles.statusOk : styles.statusBad,
          ]}
        >
          {status?.emailVerified ? t(`${K}.verified`) : t(`${K}.notVerified`)}
        </Text>
        {!status?.emailVerified ? (
          <Pressable
            style={styles.btn}
            disabled={busy}
            onPress={() => run(requestEmailLink, `${K}.linkSent`)}
          >
            <Text style={styles.btnText}>{t(`${K}.sendLink`)}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* WhatsApp */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t(`${K}.phoneTitle`)}</Text>
        <Text style={styles.value}>{status?.phone ?? "—"}</Text>
        <Text
          style={[
            styles.status,
            status?.phoneVerified ? styles.statusOk : styles.statusBad,
          ]}
        >
          {status?.phoneVerified ? t(`${K}.verified`) : t(`${K}.notVerified`)}
        </Text>
        {!status?.phone ? (
          <>
            <Text style={styles.hint}>{t(`${K}.missingHint`)}</Text>
            <Pressable
              style={styles.btn}
              onPress={() => router.push("/profile-data")}
            >
              <Text style={styles.btnText}>{t("profile.menuProfileData")}</Text>
            </Pressable>
          </>
        ) : !status.phoneVerified ? (
          <>
            <Pressable
              style={styles.btn}
              disabled={busy}
              onPress={() => run(requestWhatsappCode, `${K}.codeSent`)}
            >
              <Text style={styles.btnText}>{t(`${K}.sendCode`)}</Text>
            </Pressable>
            <Field
              label={t(`${K}.codePlaceholder`)}
              placeholder={t(`${K}.codePlaceholder`)}
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              maxLength={6}
            />
            <Pressable
              style={styles.btn}
              disabled={busy || code.length !== 6}
              onPress={() =>
                run(
                  async () => {
                    const r = await verifyWhatsappCode(code);
                    if (r.phoneVerified) setCode("");
                    return r;
                  },
                  `${K}.codeVerified`,
                )
              }
            >
              <Text style={styles.btnText}>{t(`${K}.verifyCode`)}</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 12 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    title: { fontSize: 20, fontWeight: "800", color: c.text },
    note: { fontSize: 13, color: c.text2, lineHeight: 18 },
    banner: { borderRadius: radii.md, padding: 12, ...shadowCard },
    bannerOk: { backgroundColor: "#e7f6ec" },
    bannerWarn: { backgroundColor: "#fff4e0" },
    bannerText: { fontSize: 14, fontWeight: "700", color: c.text },
    card: {
      backgroundColor: c.surface,
      borderRadius: radii.md,
      padding: 14,
      gap: 8,
      ...shadowCard,
    },
    cardTitle: { fontSize: 15, fontWeight: "800", color: c.text },
    value: { fontSize: 14, color: c.text },
    status: { fontSize: 13, fontWeight: "700" },
    statusOk: { color: "#268c4a" },
    statusBad: { color: "#b45309" },
    hint: { fontSize: 13, color: c.text2, lineHeight: 18 },
    btn: {
      backgroundColor: c.primary,
      borderRadius: radii.md,
      paddingVertical: 11,
      alignItems: "center",
    },
    btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  });
}
