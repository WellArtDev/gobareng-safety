// Layar "Isi Data Profil" — dibuka dari menurow pertama di Profil.
// Form data akun pemilik saja (Nama, Alamat, No HP, Negara), prefill
// dari GET /auth/me, simpan via PATCH /auth/me. TIDAK ada upload foto
// di sini (foto tetap lewat UBAH PROFIL). Data ini tidak tampil di
// profil publik — endpoint profil publik memakai allowlist eksplisit.
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

import { Field, FormError } from "@/components/AuthUi";
import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import { countryFlag, filterCountryCodes } from "@/utils/countries";
import {
  fetchMe,
  fetchMyBankDetails,
  profileDataPayload,
  updateMe,
  validateProfileData,
} from "@/utils/profile-api";

export function ProfileDataScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [countryQuery, setCountryQuery] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountHolder, setBankAccountHolder] = useState("");
  // Rekening hanya ikut terkirim bila berhasil dimuat: bila pemuatan
  // gagal, kunci rekening dihilangkan dari payload supaya PATCH tidak
  // menghapus rekening yang sudah tersimpan.
  const [bankLoaded, setBankLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = await fetchMe();
      setName(me.name);
      setAddress(me.address ?? "");
      setPhone(me.phone ?? "");
      setCountry(me.country);
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
    // Rekening dimuat terpisah (endpoint khusus milik sendiri); gagal
    // memuat = field dibiarkan kosong dan tidak ikut terkirim.
    try {
      const bank = await fetchMyBankDetails();
      if (bank) {
        setBankName(bank.bankName);
        setBankAccountNumber(bank.bankAccountNumber);
        setBankAccountHolder(bank.bankAccountHolder);
      }
      setBankLoaded(true);
    } catch {
      setBankLoaded(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const invalid = validateProfileData({
      name,
      address,
      phone,
      country,
      ...(bankLoaded
        ? { bankName, bankAccountNumber, bankAccountHolder }
        : {}),
    });
    if (invalid) {
      setErrorKey(invalid);
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await updateMe(
        profileDataPayload({
          name,
          address,
          phone,
          country,
          ...(bankLoaded
            ? { bankName, bankAccountNumber, bankAccountHolder }
            : {}),
        }),
      );
      // replace (bukan back) supaya Profil me-remount dan INFORMASI
      // AKUN menampilkan nilai baru, bukan data lama yang di-cache.
      router.replace("/profile");
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Text style={styles.backGlyph}>‹</Text>
      </Pressable>
      <Text style={styles.title}>{t("profile.dataTitle")}</Text>
      <Text style={styles.note}>{t("profile.dataNote")}</Text>

      {loading ? (
        <ActivityIndicator />
      ) : (
        <>
          <FormError message={errorKey ? t(errorKey) : null} />
          <Field
            label={t("profile.name")}
            value={name}
            onChangeText={setName}
            placeholder={t("profile.editNamePlaceholder")}
            autoCapitalize="words"
          />
          <Field
            label={t("profile.dataAddress")}
            value={address}
            onChangeText={setAddress}
            placeholder={t("profile.dataAddressPlaceholder")}
          />
          <Field
            label={t("profile.phone")}
            value={phone}
            onChangeText={setPhone}
            placeholder={t("profile.dataPhonePlaceholder")}
            keyboardType="phone-pad"
          />
          <Text style={styles.countryLabel}>{t("profile.dataCountry")}</Text>
          <View style={styles.countryBox}>
            <TextInput
              style={styles.countrySearch}
              value={countryQuery}
              onChangeText={setCountryQuery}
              placeholder={t("profile.dataCountrySearch")}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel={t("profile.dataCountrySearch")}
            />
            <Pressable
              style={styles.countryRow}
              onPress={() => setCountry(null)}
            >
              <Text style={styles.countryFlag}>—</Text>
              <Text style={styles.countryText}>
                {t("profile.dataCountryNone")}
              </Text>
              {country === null ? (
                <Text style={styles.countryCheck}>✓</Text>
              ) : null}
            </Pressable>
            {filterCountryCodes(countryQuery).map((code) => (
              <Pressable
                key={code}
                style={styles.countryRow}
                onPress={() => setCountry(code)}
              >
                <Text style={styles.countryFlag}>{countryFlag(code)}</Text>
                <Text style={styles.countryText}>{code}</Text>
                {country === code ? (
                  <Text style={styles.countryCheck}>✓</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
          {/* Rekening organizer — hanya tampil ke member trip berbayar
              yang sudah gabung (paid-join); tidak tampil di profil publik. */}
          <Text style={styles.title}>{t("profile.dataBankTitle")}</Text>
          <Text style={styles.note}>{t("profile.dataBankNote")}</Text>
          <Field
            label={t("profile.dataBankName")}
            value={bankName}
            onChangeText={setBankName}
            placeholder={t("profile.dataBankNamePlaceholder")}
          />
          <Field
            label={t("profile.dataBankAccountNumber")}
            value={bankAccountNumber}
            onChangeText={setBankAccountNumber}
            placeholder={t("profile.dataBankAccountNumberPlaceholder")}
            keyboardType="number-pad"
          />
          <Field
            label={t("profile.dataBankAccountHolder")}
            value={bankAccountHolder}
            onChangeText={setBankAccountHolder}
            placeholder={t("profile.dataBankAccountHolderPlaceholder")}
            autoCapitalize="words"
          />
          <Pressable
            style={({ pressed }) => [
              styles.btnSave,
              pressed && styles.btnPressed,
            ]}
            onPress={save}
          >
            <Text style={styles.btnSaveText}>
              {saving ? t("profile.saving") : t("profile.dataSave")}
            </Text>
          </Pressable>
        </>
      )}
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
    backGlyph: { fontSize: 26, fontWeight: "700", color: c.text },
    title: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.1,
      color: c.text3,
      marginTop: 16,
      marginBottom: 8,
    },
    note: {
      fontSize: 12.5,
      color: c.text2,
      lineHeight: 12.5 * 1.6,
      marginBottom: 8,
    },
    countryLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: c.text,
      marginTop: 4,
      marginBottom: 6,
    },
    countryBox: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.lg,
      paddingHorizontal: 16,
      marginBottom: 14,
      ...shadowCard,
    },
    countrySearch: {
      fontSize: 14,
      color: c.text,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderStyle: "dashed",
      borderBottomColor: c.line,
    },
    countryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderStyle: "dashed",
      borderBottomColor: c.line,
    },
    countryFlag: { fontSize: 16 },
    countryText: { fontSize: 14, fontWeight: "700", color: c.text, flex: 1 },
    countryCheck: { fontSize: 16, fontWeight: "800", color: c.primary },
    btnSave: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      borderRadius: radii.md,
      paddingVertical: 15,
      paddingHorizontal: 18,
      backgroundColor: c.primary,
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
    btnSaveText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  });
