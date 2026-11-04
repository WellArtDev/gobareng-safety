// Layar auth OTP passwordless (Wella 1 Nov 2026) — SATU alur untuk
// login maupun register, semua peran. Menggantikan total layar login
// password dan layar register-verify mockup lama (yang hanya cek format
// 6 digit di klien lalu membuat akun lewat POST /auth/register).
// Langkah: (1) pilih kanal + identifier, (2) minta kode sungguhan,
// (3) masukkan kode -> verify sungguhan, (4) HANYA bila identifier
// baru: isi nama (dan email bila identifier-nya nomor HP), verify lagi
// dengan kode yang sama. Sukses -> simpan sesi -> beranda.
// Pilihan kanal HANYA menampilkan kanal yang AKTIF menurut
// GET /auth/otp/channels (toggle Pengaturan admin); kanal nonaktif
// tidak pernah tampil sebagai pilihan. Tidak ada sukses palsu: semua
// error server ditampilkan apa adanya lewat kunci i18n.
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { AppLogo } from "@/components/AppLogo";
import {
  AuthButton,
  AuthScreenContainer,
  Field,
  FormError,
  FormSuccess,
} from "@/components/AuthUi";
import { useTranslation } from "@/i18n";
import {
  ApiError,
  getOtpChannels,
  requestOtp,
  verifyOtp,
  type OtpChannel,
  type OtpChannels,
} from "@/utils/auth-api";
import { saveSession } from "@/utils/auth-store";
import { setupPushTokens } from "@/utils/push-tokens";
import {
  normalizePhone,
  isPhoneIdentifier,
  validateIdentifier,
  validateName,
  validateNewEmail,
  validateOtp,
} from "@/utils/auth-validation";
import { COUNTRY_CODES, countryFlag } from "@/utils/countries";
import { validateProfilePhone } from "@/utils/profile-api";
import { type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { headingAccessibility } from "@/utils/accessibility";

type Step = "identifier" | "otp" | "name";

const CHANNEL_ORDER: OtpChannel[] = ["email", "sms", "whatsapp"];

export function OtpAuthScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [channels, setChannels] = useState<OtpChannels | null>(null);
  const [channelsError, setChannelsError] = useState(false);
  const [channel, setChannel] = useState<OtpChannel>("email");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  // Opsional langkah pembuatan akun (bukan login): No HP + Negara di
  // bawah Nama, sebelum "Buat Akun & Masuk". Tanpa default yang
  // dipaksa — negara null = tidak dipilih. Bila identifier-nya HP,
  // telepon sudah jadi identifier, jadi field telepon disembunyikan.
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [countryOpen, setCountryOpen] = useState(false);
  const [needsEmail, setNeedsEmail] = useState(false);
  const [step, setStep] = useState<Step>("identifier");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const loadChannels = async () => {
    setChannelsError(false);
    try {
      const c = await getOtpChannels();
      setChannels(c);
      // Kanal default: kanal aktif pertama sesuai urutan; bila kanal
      // yang sedang dipilih ternyata nonaktif, pindah ke yang aktif.
      const active = CHANNEL_ORDER.filter((ch) => c[ch]);
      if (active.length > 0 && !c[channel]) {
        setChannel(active[0]);
      }
    } catch {
      setChannelsError(true);
    }
  };

  useEffect(() => {
    void loadChannels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeChannels = channels
    ? CHANNEL_ORDER.filter((ch) => channels[ch])
    : [];

  const toErrorKey = (error: unknown) =>
    error instanceof ApiError ? error.i18nKey : "auth.errors.unavailable";

  const submitIdentifier = async () => {
    if (submitting) return;
    const invalid = validateIdentifier(channel, identifier);
    if (invalid) {
      setErrorKey(invalid);
      return;
    }
    const ident =
      channel === "email"
        ? identifier.trim().toLowerCase()
        : normalizePhone(identifier);
    setSubmitting(true);
    setErrorKey(null);
    setNoticeKey(null);
    try {
      const res = await requestOtp(ident, channel);
      setIdentifier(ident);
      setStep("otp");
      // Fallback SMS -> WhatsApp dari server dilaporkan lewat
      // channelSent; user diberitahu kanalnya, bukan sukses generik.
      setNoticeKey(
        res.channelSent === "whatsapp" && channel === "sms"
          ? "auth.otpSentViaWhatsapp"
          : "auth.otpSent",
      );
    } catch (error) {
      setErrorKey(toErrorKey(error));
    } finally {
      setSubmitting(false);
    }
  };

  const submitOtp = async () => {
    if (submitting || done) return;
    const invalid = validateOtp(otp);
    if (invalid) {
      setErrorKey(invalid);
      return;
    }
    setSubmitting(true);
    setErrorKey(null);
    try {
      const result = await verifyOtp(identifier, otp);
      if ("needsName" in result) {
        setNeedsEmail(result.needsEmail);
        setStep("name");
        return;
      }
      await saveSession(
        result.session.token,
        result.session.user.name,
        result.session.refreshToken,
      );
      // M2: login sukses -> daftarkan token push (fire-and-forget,
      // fail-soft; layout juga memanggil setup saat sesi aktif).
      void setupPushTokens();
      setDone(true);
      setTimeout(() => router.replace("/"), 900);
    } catch (error) {
      setErrorKey(toErrorKey(error));
    } finally {
      setSubmitting(false);
    }
  };

  const submitName = async () => {
    if (submitting || done) return;
    const invalidName = validateName(name);
    if (invalidName) {
      setErrorKey(invalidName);
      return;
    }
    if (needsEmail) {
      const invalidEmail = validateNewEmail(newEmail);
      if (invalidEmail) {
        setErrorKey(invalidEmail);
        return;
      }
    }
    // Telepon opsional: kosong = tidak dikirim; terisi tapi tak valid
    // = error di layar (bukan diam-diam disimpan null seperti PATCH
    // /me — di langkah daftar, user masih di depan formnya).
    if (phone !== "") {
      const invalidPhone = validateProfilePhone(phone);
      if (invalidPhone) {
        setErrorKey("auth.errors.invalidPhone");
        return;
      }
    }
    setSubmitting(true);
    setErrorKey(null);
    try {
      const result = await verifyOtp(
        identifier,
        otp,
        name.trim(),
        needsEmail ? newEmail.trim().toLowerCase() : undefined,
        phone === "" ? undefined : phone,
        country,
      );
      if ("needsName" in result) {
        // Server tetap meminta nama (mis. nama terlalu pendek menurut
        // server) — tampilkan error validasi, jangan sukses palsu.
        setErrorKey("auth.errors.invalidName");
        return;
      }
      await saveSession(
        result.session.token,
        result.session.user.name,
        result.session.refreshToken,
      );
      // M2: daftar sukses -> daftarkan token push (sama seperti login).
      void setupPushTokens();
      setDone(true);
      setTimeout(() => router.replace("/"), 900);
    } catch (error) {
      setErrorKey(toErrorKey(error));
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorKey(null);
    try {
      const res = await requestOtp(identifier, channel);
      setNoticeKey(
        res.channelSent === "whatsapp" && channel === "sms"
          ? "auth.otpSentViaWhatsapp"
          : "auth.otpSent",
      );
    } catch (error) {
      setErrorKey(toErrorKey(error));
    } finally {
      setSubmitting(false);
    }
  };

  const backToIdentifier = () => {
    setStep("identifier");
    setOtp("");
    setErrorKey(null);
    setNoticeKey(null);
  };

  return (
    <AuthScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView keyboardShouldPersistTaps="handled">
          <AppLogo size="lg" />
          <Text style={styles.sub} {...headingAccessibility(t("auth.otpTitle"))}>
            {t("auth.tagline")}
          </Text>
          <FormError message={errorKey ? t(errorKey) : null} />
          <FormSuccess message={noticeKey ? t(noticeKey) : null} />
          {channelsError ? (
            <AuthButton label={t("auth.retryChannels")} onPress={loadChannels} />
          ) : channels === null ? (
            <Text style={styles.loading}>{t("auth.loadingChannels")}</Text>
          ) : activeChannels.length === 0 ? (
            <Text style={styles.loading}>{t("auth.errors.noOtpChannels")}</Text>
          ) : step === "identifier" ? (
            <>
              <Text style={styles.channelLabel}>{t("auth.channelLabel")}</Text>
              <View style={styles.channelRow}>
                {activeChannels.map((ch) => (
                  <Pressable
                    key={ch}
                    onPress={() => setChannel(ch)}
                    style={[
                      styles.channelBtn,
                      channel === ch && styles.channelBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.channelText,
                        channel === ch && styles.channelTextActive,
                      ]}
                    >
                      {t(`auth.channel${ch === "email" ? "Email" : ch === "sms" ? "Sms" : "Whatsapp"}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Field
                label={
                  channel === "email" ? t("auth.email") : t("auth.phone")
                }
                value={identifier}
                onChangeText={setIdentifier}
                placeholder={
                  channel === "email"
                    ? t("auth.emailPlaceholder")
                    : t("auth.phonePlaceholder")
                }
                keyboardType={
                  channel === "email" ? "email-address" : "phone-pad"
                }
              />
              {channel !== "email" && (
                <Text style={styles.help}>{t("auth.phoneHelp")}</Text>
              )}
              <AuthButton
                label={t("auth.sendOtp")}
                onPress={submitIdentifier}
                busy={submitting}
              />
            </>
          ) : step === "otp" ? (
            <>
              <Text style={styles.intro}>
                {t("auth.otpIntro", { identifier })}
              </Text>
              <Field
                label={t("auth.otpLabel")}
                value={otp}
                onChangeText={setOtp}
                placeholder="••••••"
                keyboardType="number-pad"
                maxLength={6}
                centered
              />
              <Text style={styles.help}>{t("auth.otpHelp")}</Text>
              <AuthButton
                label={t("auth.verifyOtp")}
                onPress={submitOtp}
                busy={submitting}
              />
              <Pressable onPress={resend} style={styles.linkBtn}>
                <Text style={styles.link}>{t("auth.resendOtp")}</Text>
              </Pressable>
              <Pressable onPress={backToIdentifier} style={styles.linkBtn}>
                <Text style={styles.link}>{t("auth.changeIdentifier")}</Text>
              </Pressable>
              <FormSuccess message={done ? t("auth.otpDone") : null} />
            </>
          ) : (
            <>
              <Text style={styles.intro}>{t("auth.nameIntro")}</Text>
              <Field
                label={t("auth.name")}
                value={name}
                onChangeText={setName}
                placeholder={t("auth.namePlaceholder")}
                autoCapitalize="words"
              />
              {needsEmail && (
                <Field
                  label={t("auth.email")}
                  value={newEmail}
                  onChangeText={setNewEmail}
                  placeholder={t("auth.registerEmailPlaceholder")}
                  keyboardType="email-address"
                />
              )}
              {!isPhoneIdentifier(identifier) && (
                <Field
                  label={t("auth.phone")}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder={t("auth.phonePlaceholder")}
                  keyboardType="phone-pad"
                />
              )}
              <Text style={styles.countryLabel}>
                {t("auth.registerCountry")}
              </Text>
              <Pressable
                onPress={() => setCountryOpen((v) => !v)}
                style={styles.countryBox}
              >
                <View style={styles.countryRow}>
                  <Text style={styles.countryFlag}>
                    {country ? countryFlag(country) : "—"}
                  </Text>
                  <Text style={styles.countryText}>
                    {country ?? t("auth.registerCountryPlaceholder")}
                  </Text>
                  <Text style={styles.countryCheck}>
                    {countryOpen ? "▴" : "▾"}
                  </Text>
                </View>
              </Pressable>
              {countryOpen && (
                <View style={styles.countryBox}>
                  <Pressable
                    onPress={() => {
                      setCountry(null);
                      setCountryOpen(false);
                    }}
                    style={styles.countryRow}
                  >
                    <Text style={styles.countryFlag}>—</Text>
                    <Text style={styles.countryText}>
                      {t("profile.dataCountryNone")}
                    </Text>
                    {country === null && (
                      <Text style={styles.countryCheck}>✓</Text>
                    )}
                  </Pressable>
                  {COUNTRY_CODES.map((code) => (
                    <Pressable
                      key={code}
                      onPress={() => {
                        setCountry(code);
                        setCountryOpen(false);
                      }}
                      style={styles.countryRow}
                    >
                      <Text style={styles.countryFlag}>
                        {countryFlag(code)}
                      </Text>
                      <Text style={styles.countryText}>{code}</Text>
                      {country === code && (
                        <Text style={styles.countryCheck}>✓</Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              )}
              <AuthButton
                label={t("auth.createAccount")}
                onPress={submitName}
                busy={submitting}
              />
              <FormSuccess message={done ? t("auth.otpDone") : null} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </AuthScreenContainer>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    sub: {
      textAlign: "center",
      fontSize: 14,
      fontWeight: "700",
      color: c.text2,
      marginBottom: 22,
    },
    loading: {
      textAlign: "center",
      fontSize: 13.5,
      color: c.text2,
      marginVertical: 16,
    },
    channelLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: c.text2,
      marginBottom: 8,
    },
    channelRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 16,
      flexWrap: "wrap",
    },
    channelBtn: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
    },
    channelBtnActive: {
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
    },
    channelText: { fontSize: 13, fontWeight: "700", color: c.text2 },
    channelTextActive: { color: c.primary },
    intro: {
      fontSize: 13.5,
      lineHeight: 13.5 * 1.6,
      color: c.text2,
      marginBottom: 14,
    },
    help: {
      fontSize: 11.5,
      color: c.text3,
      lineHeight: 11.5 * 1.55,
      marginBottom: 16,
    },
    linkBtn: { paddingVertical: 8, alignItems: "center" },
    link: { fontSize: 13, fontWeight: "700", color: c.primary },
    countryLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: c.text2,
      marginBottom: 8,
    },
    countryBox: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 12,
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    countryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 10,
    },
    countryFlag: { fontSize: 16 },
    countryText: { fontSize: 14, fontWeight: "700", color: c.text, flex: 1 },
    countryCheck: { fontSize: 16, fontWeight: "800", color: c.primary },
  });
