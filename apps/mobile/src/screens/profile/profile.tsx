// Layar Profil — mockup data-screen="profile": prof-head (avatar 78px +
// nama + email), prof-stats (Trust Level + Poin), INFORMASI AKUN,
// UBAH PROFIL (edit nama + foto via PATCH /auth/me dan POST
// /auth/me/avatar; email TIDAK bisa diubah dari sini — alur ganti email
// urusan agen API), DATA DARURAT (form kontak darurat), menurow
// (Pengaturan / Pengajuan Organizer / Tentang), Logout. Data dari
// GET /auth/me. LENCANA mockup belum dirender — API belum punya badge
// (menyusul).
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

import { Field, FormError } from "@/components/AuthUi";
import {
  createEmergencyContact,
  deleteEmergencyContact,
  fetchEmergencyContacts,
  type EmergencyContact,
} from "@/utils/emergency-contacts-api";
import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import { countryFlag } from "@/utils/countries";
import { nameInitial } from "@/utils/home-logic";
import {
  fetchMe,
  updateMe,
  uploadAvatar,
  validateProfileName,
  type AvatarFile,
  type MeUser,
} from "@/utils/profile-api";
import { clearSession, getRefreshToken } from "@/utils/auth-store";
import { revokeRefreshToken } from "@/utils/auth-api";
import { normalizePhone } from "@/utils/auth-validation";

function roleLabelKey(user: MeUser): string {
  if (user.role === "admin") return "profile.roleAdmin";
  if (user.role === "command_center") return "profile.roleCommandCenter";
  return "profile.roleMember";
}

export function ProfileScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [me, setMe] = useState<MeUser | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Ubah profil — nama + foto saja (email tidak diubah dari sini).
  const [editName, setEditName] = useState("");
  const [editPicked, setEditPicked] = useState<AvatarFile | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaved, setEditSaved] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  // Kontak darurat A-4 — tersimpan nyata di server.
  const [ecName, setEcName] = useState("");
  const [ecWa, setEcWa] = useState("");
  const [ecError, setEcError] = useState<string | null>(null);
  const [ecSaved, setEcSaved] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);

  const load = useCallback(async () => {
    try {
      const user = await fetchMe();
      setMe(user);
      setEditName(user.name);
      setContacts(await fetchEmergencyContacts().catch(() => []));
      setErrorKey(null);
    } catch (error) {
      if (error instanceof ApiError && error.i18nKey === "errors.unauthorized") {
        router.replace("/login");
        return;
      }
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    // Perkecil dulu sebelum upload: foto galeri mentah sering >1 MB,
    // sementara nginx jalur.gobareng.app membatasi body 1 MB (default
    // tanpa client_max_body_size) — upload mentah gagal non-JSON
    // sehingga klien menampilkan "Server tidak terjangkau" dan (di
    // urutan lama) nama ikut batal tersimpan. Lebar maks 1024px +
    // JPEG 0.7 biasanya jauh di bawah 1 MB. Kalau manipulate gagal,
    // pakai file asli — jangan blokir pemilihan foto.
    let picked: AvatarFile = {
      uri: asset.uri,
      name: asset.fileName ?? "avatar.jpg",
      type: asset.mimeType ?? "image/jpeg",
    };
    try {
      const resized = await ImageManipulator.manipulateAsync(
        asset.uri,
        asset.width && asset.width > 1024
          ? [{ resize: { width: 1024 } }]
          : [],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );
      picked = { uri: resized.uri, name: "avatar.jpg", type: "image/jpeg" };
    } catch {
      // pakai file asli
    }
    setEditPicked(picked);
    setEditSaved(false);
  };

  const saveEdit = async () => {
    const invalid = validateProfileName(editName);
    if (invalid) {
      setEditError(invalid);
      setEditSaved(false);
      return;
    }
    if (editSaving) return;
    setEditSaving(true);
    try {
      // Urutan baru: nama dulu, foto sesudahnya, error per langkah.
      // Dulu foto dulu — kalau upload foto gagal, PATCH nama tidak
      // pernah jalan dan banner generik menutupi itu. Sekarang
      // kegagalan foto tidak membatalkan nama yang sudah tersimpan,
      // dan pesannya bilang begitu (bukan sekadar "server tidak
      // terjangkau"). Nama yang gagal tidak memicu upload foto.
      const nameChanged = !!me && editName.trim() !== me.name;
      let nameError: string | null = null;
      let photoError: string | null = null;
      if (nameChanged) {
        try {
          await updateMe({ name: editName.trim() });
        } catch (error) {
          nameError =
            error instanceof ApiError ? error.i18nKey : "errors.unavailable";
        }
      }
      if (!nameError && editPicked) {
        try {
          await uploadAvatar(editPicked);
        } catch (error) {
          photoError =
            error instanceof ApiError ? error.i18nKey : "errors.unavailable";
        }
      }
      // Jangan me-load saat nama gagal, supaya nama yang diketik
      // tidak tertimpa nilai lama dari server.
      if (!nameError) await load();
      if (nameError) {
        setEditError(nameError);
        setEditSaved(false);
      } else if (photoError) {
        setEditError(
          nameChanged
            ? "profile.avatarErrors.photoFailedNameSaved"
            : photoError,
        );
        setEditSaved(false);
      } else {
        setEditPicked(null);
        setEditError(null);
        setEditSaved(true);
      }
    } catch (error) {
      setEditSaved(false);
      setEditError(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setEditSaving(false);
    }
  };

  const saveEc = async () => {
    if (!ecName.trim() || !/^\+?\d{9,15}$/.test(normalizePhone(ecWa))) {
      setEcError("profile.errors.allRequired");
      setEcSaved(false);
      return;
    }
    try {
      const contact = await createEmergencyContact(ecName.trim(), ecWa);
      setContacts((prev) => [...prev, contact]);
      setEcName("");
      setEcWa("");
      setEcError(null);
      setEcSaved(true);
    } catch (error) {
      setEcSaved(false);
      setEcError(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    }
  };

  const removeEc = async (id: string) => {
    try {
      await deleteEmergencyContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch (error) {
      setEcError(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    }
  };

  const logout = async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) await revokeRefreshToken(refreshToken);
    await clearSession();
    router.replace("/login");
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      {errorKey ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{t(errorKey)}</Text>
        </View>
      ) : null}

      {/* .prof-head — ketuk avatar untuk pilih foto baru */}
      <View style={styles.profHead}>
        <Pressable onPress={pickAvatar} accessibilityLabel={t("profile.avatarPick")}>
          {editPicked?.uri ?? me?.avatarUrl ? (
            <Image
              source={{ uri: editPicked?.uri ?? me?.avatarUrl ?? "" }}
              style={styles.profAva}
            />
          ) : (
            <View style={styles.profAva}>
              <Text style={styles.profAvaText}>{nameInitial(me?.name ?? "")}</Text>
            </View>
          )}
        </Pressable>
        <Text style={styles.profName}>{me?.name ?? ""}</Text>
        <Text style={styles.profMail}>{me?.email ?? ""}</Text>
      </View>

      {/* .prof-stats */}
      <View style={styles.profStats}>
        <View style={styles.profStat}>
          <Text style={styles.statLb}>{t("profile.trustLevel")}</Text>
          <View style={styles.trustPill}>
            <Text style={styles.trustPillText}>
              {me?.isVerified
                ? t("profile.trustTrusted")
                : t("profile.trustNew")}
            </Text>
          </View>
        </View>
        <View style={styles.profStat}>
          <Text style={styles.statLb}>{t("profile.points")}</Text>
          <Text style={styles.statVl}>0</Text>
        </View>
      </View>

      {/* INFORMASI AKUN */}
      <View style={styles.teambox}>
        <Text style={styles.boxTitle}>{t("profile.accountTitle")}</Text>
        <View style={styles.kv}>
          <Text style={styles.k}>{t("profile.name")}</Text>
          <Text style={styles.v}>{me?.name ?? "—"}</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.k}>{t("profile.email")}</Text>
          <Text style={styles.v}>{me?.email ?? "—"}</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.k}>{t("profile.phone")}</Text>
          <Text style={styles.v}>{me?.phone ?? "-"}</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.k}>{t("profile.dataAddress")}</Text>
          <Text style={styles.v}>{me?.address ?? "-"}</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.k}>{t("profile.dataCountry")}</Text>
          <Text style={styles.v}>
            {me?.country ? `${countryFlag(me.country)} ${me.country}` : "-"}
          </Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.k}>{t("profile.role")}</Text>
          <Text style={styles.v}>{me ? t(roleLabelKey(me)) : "—"}</Text>
        </View>
      </View>

      {/* UBAH PROFIL — nama + foto saja, email tidak diubah di sini */}
      <View style={styles.teambox}>
        <Text style={styles.boxTitle}>{t("profile.editTitle")}</Text>
        <Pressable style={styles.btnPick} onPress={pickAvatar}>
          <Text style={styles.btnPickText}>{t("profile.avatarPick")}</Text>
        </Pressable>
        {editPicked ? (
          <Text style={styles.note}>{t("profile.avatarPicked")}</Text>
        ) : null}
        <FormError message={editError ? t(editError) : null} />
        <Field
          label={t("profile.name")}
          value={editName}
          onChangeText={setEditName}
          placeholder={t("profile.editNamePlaceholder")}
          autoCapitalize="words"
        />
        <Pressable
          style={({ pressed }) => [styles.btnSave, pressed && styles.btnPressed]}
          onPress={saveEdit}
        >
          <Text style={styles.btnSaveText}>
            {editSaving ? t("profile.saving") : t("profile.editSave")}
          </Text>
        </Pressable>
        {editSaved ? (
          <View style={styles.okBox}>
            <Text style={styles.okText}>{t("profile.editSaved")}</Text>
          </View>
        ) : null}
      </View>

      {/* DATA DARURAT */}
      <View style={styles.teambox}>
        <Text style={styles.boxTitle}>{t("profile.emergencyTitle")}</Text>
        <Text style={styles.note}>{t("profile.emergencyNote")}</Text>
        <Text style={[styles.boxTitle, styles.ecTitle]}>
          {t("profile.ecTitle")}
        </Text>
        {contacts.map((contact) => (
          <View key={contact.id} style={styles.ecRow}>
            <View style={styles.ecTxt}>
              <Text style={styles.ecName}>{contact.name}</Text>
              <Text style={styles.ecPhone}>{contact.phone}</Text>
            </View>
            <Pressable
              style={styles.ecDelete}
              onPress={() => removeEc(contact.id)}
              accessibilityLabel={t("profile.ecDelete")}
            >
              <Text style={styles.ecDeleteText}>{t("profile.ecDelete")}</Text>
            </Pressable>
          </View>
        ))}
        <FormError message={ecError ? t(ecError) : null} />
        <Field
          label={t("profile.ecName")}
          value={ecName}
          onChangeText={setEcName}
          placeholder={t("profile.ecNamePlaceholder")}
          autoCapitalize="words"
        />
        <Field
          label={t("profile.ecWa")}
          value={ecWa}
          onChangeText={setEcWa}
          placeholder={t("profile.ecWaPlaceholder")}
          keyboardType="phone-pad"
          help={t("profile.ecWaHelp")}
        />
        <Pressable
          style={({ pressed }) => [styles.btnSave, pressed && styles.btnPressed]}
          onPress={saveEc}
        >
          <Text style={styles.btnSaveText}>{t("profile.ecSave")}</Text>
        </Pressable>
        {ecSaved ? (
          <View style={styles.okBox}>
            <Text style={styles.okText}>{t("profile.ecSaved")}</Text>
          </View>
        ) : null}
      </View>

      {/* Menu */}
      <View style={styles.teambox}>
        <Pressable
          style={styles.menurow}
          onPress={() => router.push("/profile-data")}
        >
          <View style={styles.mic}>
            <Text style={styles.micGlyph}>📋</Text>
          </View>
          <Text style={styles.menurowText}>
            {t("profile.menuProfileData")}
          </Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
        <Pressable
          style={styles.menurow}
          onPress={() => router.push("/account-verification")}
        >
          <View style={styles.mic}>
            <Text style={styles.micGlyph}>✅</Text>
          </View>
          <Text style={styles.menurowText}>
            {t("profile.menuAccountVerification")}
          </Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
        <Pressable
          style={styles.menurow}
          onPress={() => router.push("/settings")}
        >
          <View style={styles.mic}>
            <Text style={styles.micGlyph}>⚙</Text>
          </View>
          <Text style={styles.menurowText}>{t("profile.menuSettings")}</Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
        
        <Pressable
          style={styles.menurow}
          onPress={() => router.push("/my-proposals")}
        >
          <View style={styles.mic}>
            <Text style={styles.micGlyph}>⛰</Text>
          </View>
          <Text style={styles.menurowText}>
            {t("profile.menuMyProposals")}
          </Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
        <Pressable
          style={styles.menurow}
          onPress={() => router.push("/organizer-application")}
        >
          <View style={styles.mic}>
            <Text style={styles.micGlyph}>🛡️</Text>
          </View>
          <Text style={styles.menurowText}>
            {t("profile.menuOrganizerApplication")}
          </Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
        <Pressable
          style={[styles.menurow, styles.menurowLast]}
          onPress={() => router.push("/about")}
        >
          <View style={styles.mic}>
            <Text style={styles.micGlyph}>ℹ</Text>
          </View>
          <Text style={styles.menurowText}>{t("profile.menuAbout")}</Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      </View>

      {/* .btn-logout */}
      <Pressable style={styles.btnLogout} onPress={logout}>
        <Text style={styles.btnLogoutText}>{t("profile.logout")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 96 },
  errBox: {
    backgroundColor: c.errBg,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  errText: { color: c.stSosDark, fontSize: 13, fontWeight: "700" },
  // .prof-head
  profHead: { alignItems: "center", paddingTop: 12 },
  profAva: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: c.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: c.surface,
    ...shadowCard,
  },
  profAvaText: { color: "#fff", fontSize: 30, fontWeight: "800" },
  profName: {
    fontSize: 19,
    fontWeight: "800",
    color: c.text,
    marginTop: 11,
  },
  profMail: {
    fontSize: 13,
    color: c.text3,
    fontWeight: "600",
    marginTop: 2,
  },
  // .prof-stats
  profStats: { flexDirection: "row", gap: 11, marginTop: 14 },
  profStat: {
    flex: 1,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 13,
    paddingHorizontal: 10,
    alignItems: "center",
    ...shadowCard,
  },
  statLb: {
    fontSize: 11,
    fontWeight: "700",
    color: c.text2,
    marginBottom: 6,
  },
  statVl: { fontSize: 19, fontWeight: "800", color: c.text },
  // .trust-pill
  trustPill: {
    backgroundColor: c.successBg,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
  },
  trustPillText: { fontSize: 12, fontWeight: "800", color: c.success },
  teambox: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 14,
    ...shadowCard,
  },
  boxTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: c.text3,
    marginBottom: 8,
  },
  ecTitle: { marginTop: 18 },
  kv: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 6,
  },
  k: { color: c.text2, fontWeight: "600", fontSize: 13 },
  v: {
    fontWeight: "700",
    fontSize: 13,
    color: c.text,
    textAlign: "right",
    flexShrink: 1,
  },
  note: {
    fontSize: 12.5,
    color: c.text2,
    lineHeight: 12.5 * 1.6,
    marginBottom: 8,
  },
  ecRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderBottomColor: c.line,
  },
  ecTxt: { flex: 1 },
  ecName: { fontSize: 13.5, fontWeight: "700", color: c.text },
  ecPhone: { fontSize: 12, color: c.text2, marginTop: 1 },
  ecDelete: {
    backgroundColor: c.errBg,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
  },
  ecDeleteText: { fontSize: 12, fontWeight: "800", color: c.stSosDark },
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
  okBox: {
    backgroundColor: c.successBg,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  okText: { color: c.success, fontSize: 13, fontWeight: "700" },
  // .menurow
  menurow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderBottomColor: c.line,
  },
  menurowLast: { borderBottomWidth: 0 },
  mic: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: c.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  micGlyph: { fontSize: 15, color: c.text2 },
  menurowText: { fontSize: 14, fontWeight: "700", color: c.text, flex: 1 },
  chev: { color: c.text3, fontSize: 20, fontWeight: "700" },
  // Tombol sekunder netral (pilih foto) — salinan .btn-logout dengan
  // teks netral, bukan merah.
  btnPick: {
    width: "100%",
    alignItems: "center",
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.line,
    borderRadius: radii.md,
    padding: 14,
  },
  btnPickText: { fontSize: 14.5, fontWeight: "800", color: c.text },
  // .btn-logout
  btnLogout: {
    width: "100%",
    alignItems: "center",
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.line,
    borderRadius: radii.md,
    padding: 14,
    marginTop: 14,
  },
  btnLogoutText: { fontSize: 14.5, fontWeight: "800", color: c.stSos },
});
