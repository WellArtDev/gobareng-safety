// Layar Pengajuan Organizer — form yang diisi pendaftar sendiri di
// app (nama organizer, alamat, jenis, wilayah, foto KTP) + tombol
// "Lihat Data" untuk melihat data yang sudah diajukan. Verifikasi
// tetap MANUAL oleh admin: layar ini tidak pernah mengubah status
// verifikasi akun, hanya mengirim data untuk ditinjau.
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { useTranslation } from "@/i18n";
import { radii, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import {
  fetchMyOrganizerApplication,
  submitOrganizerApplication,
  validateOrganizerApplication,
  type OrganizerApplication,
} from "@/utils/organizer-api";

export function OrganizerApplicationScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [application, setApplication] = useState<OrganizerApplication | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [type, setType] = useState<"HIKING" | "TOURING" | null>(null);
  const [region, setRegion] = useState("");
  const [ktp, setKtp] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [showData, setShowData] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const app = await fetchMyOrganizerApplication();
      setApplication(app);
      if (app?.organizerName) setName(app.organizerName);
      if (app?.address) setAddress(app.address);
      if (app?.organizerType) setType(app.organizerType);
      if (app?.region) setRegion(app.region);
      setErrorKey(null);
    } catch (error) {
      setErrorKey(error instanceof ApiError ? error.i18nKey : "errors.unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pickKtp = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setKtp({
      uri: asset.uri,
      name: asset.fileName ?? "ktp.jpg",
      type: asset.mimeType ?? "image/jpeg",
    });
    setSaved(false);
  };

  const submit = async () => {
    const invalid = validateOrganizerApplication({
      organizerName: name,
      address,
      organizerType: type,
      region: region || null,
    });
    if (invalid) {
      setErrorKey(invalid);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const app = await submitOrganizerApplication(
        { organizerName: name, address, organizerType: type, region: region || null },
        ktp,
      );
      setApplication(app);
      setKtp(null);
      setSaved(true);
      setErrorKey(null);
    } catch (error) {
      setErrorKey(error instanceof ApiError ? error.i18nKey : "errors.unavailable");
    } finally {
      setBusy(false);
    }
  };

  const statusKey =
    application?.status === "APPROVED"
      ? "profile.orgStatusApproved"
      : application?.status === "REJECTED"
        ? "profile.orgStatusRejected"
        : "profile.orgStatusPending";

  return (
    <ScrollView style={styles.screen}>
      <View style={styles.content}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{t("profile.orgTitle")}</Text>
        <Text style={styles.note}>{t("profile.orgNote")}</Text>

        {loading ? (
          <ActivityIndicator />
        ) : (
          <>
            {errorKey ? (
              <View style={styles.errBox}>
                <Text style={styles.errText}>{t(errorKey)}</Text>
              </View>
            ) : null}
            {saved ? (
              <View style={styles.okBox}>
                <Text style={styles.okText}>{t("profile.orgSaved")}</Text>
              </View>
            ) : null}

            {application?.organizerName ? (
              <Pressable
                style={styles.btnData}
                onPress={() => setShowData((v) => !v)}
              >
                <Text style={styles.btnDataText}>
                  {showData ? t("profile.orgHideData") : t("profile.orgViewData")}
                </Text>
              </Pressable>
            ) : null}
            {showData && application ? (
              <View style={styles.dataBox}>
                <Text style={styles.dataRow}>
                  {t("profile.orgName")}: {application.organizerName ?? "—"}
                </Text>
                <Text style={styles.dataRow}>
                  {t("profile.orgAddress")}: {application.address ?? "—"}
                </Text>
                <Text style={styles.dataRow}>
                  {t("profile.orgType")}: {application.organizerType ?? "—"}
                </Text>
                <Text style={styles.dataRow}>
                  {t("profile.orgRegion")}: {application.region ?? "—"}
                </Text>
                <Text style={styles.dataRow}>
                  {t("profile.orgKtp")}:{" "}
                  {application.hasIdentityDocument
                    ? t("profile.orgKtpOnFile")
                    : t("profile.orgKtpNone")}
                </Text>
                <Text style={styles.dataRow}>{t(statusKey)}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>{t("profile.orgName")}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setSaved(false);
              }}
              placeholder={t("profile.orgNamePlaceholder")}
            />
            <Text style={styles.label}>{t("profile.orgAddress")}</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={address}
              onChangeText={(v) => {
                setAddress(v);
                setSaved(false);
              }}
              placeholder={t("profile.orgAddressPlaceholder")}
              multiline
            />
            <Text style={styles.label}>{t("profile.orgType")}</Text>
            <View style={styles.typeRow}>
              {(["HIKING", "TOURING"] as const).map((opt) => (
                <Pressable
                  key={opt}
                  style={[styles.typeBtn, type === opt && styles.typeBtnActive]}
                  onPress={() => setType(opt)}
                >
                  <Text style={styles.typeBtnText}>
                    {opt === "HIKING" ? t("profile.orgTypeHiking") : t("profile.orgTypeTouring")}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>{t("profile.orgRegion")}</Text>
            <TextInput
              style={styles.input}
              value={region}
              onChangeText={setRegion}
              placeholder={t("profile.orgRegionPlaceholder")}
            />
            <Text style={styles.label}>{t("profile.orgKtp")}</Text>
            <Pressable style={styles.btnKtp} onPress={pickKtp}>
              <Text style={styles.btnKtpText}>
                {ktp
                  ? `${t("profile.orgKtpPicked")}: ${ktp.name}`
                  : application?.hasIdentityDocument
                    ? t("profile.orgKtpOnFile")
                    : t("profile.orgKtpPick")}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btnMain, pressed && styles.btnPressed]}
              onPress={submit}
              disabled={busy}
            >
              <Text style={styles.btnMainText}>{t("profile.orgSubmit")}</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 96 },
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
    title: { fontSize: 20, fontWeight: "800", color: c.text, marginTop: 12 },
    note: { fontSize: 13, color: c.text2, marginTop: 6, marginBottom: 12 },
    errBox: {
      backgroundColor: c.errBg,
      borderRadius: radii.md,
      paddingVertical: 11,
      paddingHorizontal: 14,
      marginBottom: 10,
    },
    errText: { color: c.stSosDark, fontSize: 13, fontWeight: "700" },
    okBox: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.md,
      paddingVertical: 11,
      paddingHorizontal: 14,
      marginBottom: 10,
    },
    okText: { color: c.primaryDark, fontSize: 13, fontWeight: "700" },
    btnData: {
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      borderRadius: radii.md,
      paddingVertical: 12,
      alignItems: "center",
      marginBottom: 10,
    },
    btnDataText: { fontWeight: "800", color: c.text, fontSize: 14 },
    dataBox: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.md,
      padding: 14,
      marginBottom: 12,
      gap: 6,
    },
    dataRow: { fontSize: 13, color: c.text },
    label: { fontSize: 13, fontWeight: "700", color: c.text, marginTop: 10, marginBottom: 6 },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      color: c.text,
    },
    inputMulti: { minHeight: 72, textAlignVertical: "top" },
    typeRow: { flexDirection: "row", gap: 10 },
    typeBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      borderRadius: radii.md,
      paddingVertical: 12,
      alignItems: "center",
    },
    typeBtnActive: { borderColor: c.primary, backgroundColor: c.surface },
    typeBtnText: { fontWeight: "700", color: c.text, fontSize: 14 },
    btnKtp: {
      borderWidth: 1,
      borderColor: c.line,
      borderStyle: "dashed",
      borderRadius: radii.md,
      paddingVertical: 14,
      alignItems: "center",
    },
    btnKtpText: { color: c.text2, fontSize: 13, fontWeight: "700" },
    btnMain: {
      borderRadius: radii.md,
      paddingVertical: 15,
      paddingHorizontal: 18,
      backgroundColor: c.primary,
      marginTop: 16,
      alignItems: "center",
    },
    btnPressed: { opacity: 0.7 },
    btnMainText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  });
