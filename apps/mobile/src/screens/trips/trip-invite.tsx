// Layar Undang Anggota — INVITE (2 Nov 2026). BERBEDA dari Bagikan:
// undangan membuat orang jadi anggota trip. Hanya leader yang boleh
// membuat/melihat/mencabut (server menolak admin + anggota lain).
// Kuota dihitung dari MEMBER YANG SUDAH JOIN, bukan jumlah link —
// membuat link sebanyak apa pun tidak memakan kuota; tombol buat
// link DISABLED saat anggota >= kuota (lapis UI; server tetap menolak
// join via undangan saat penuh). Kartu kuota (leader/admin) selalu
// bisa diubah, minimal = jumlah anggota saat ini dan minimal 2.
import { useCallback, useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import {
  createTripInvite,
  fetchTripInvites,
  inviteUrlForToken,
  isQuotaFull,
  revokeTripInvite,
  updateTripQuota,
  validateQuotaChange,
  type TripInvite,
} from "@/utils/invite-api";
import { waShareUrl } from "@/utils/share-api";
import { fetchTrip, fetchTripMembers, type Trip } from "@/utils/trips-api";
import { fetchMe, type MeUser } from "@/utils/profile-api";

export function TripInviteScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [me, setMe] = useState<MeUser | null>(null);
  const [invites, setInvites] = useState<TripInvite[]>([]);
  const [label, setLabel] = useState("");
  const [quotaInput, setQuotaInput] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [quotaErrorKey, setQuotaErrorKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tripId) return;
    try {
      const [tripData, members, inviteList, meData] = await Promise.all([
        fetchTrip(tripId),
        fetchTripMembers(tripId).catch(() => []),
        fetchTripInvites(tripId).catch(() => [] as TripInvite[]),
        fetchMe().catch(() => null),
      ]);
      setTrip(tripData);
      setMemberCount(members.length);
      setInvites(inviteList);
      setMe(meData);
      setQuotaInput(
        tripData.quota !== null && tripData.quota !== undefined
          ? String(tripData.quota)
          : "",
      );
      setErrorKey(null);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  const isLeader = !!me && !!trip && trip.leaderId === me.id;
  const isLeaderOrAdmin = isLeader || !!me?.isAdmin;
  const quotaFull = trip ? isQuotaFull(trip.quota, memberCount) : false;

  const makeInvite = async () => {
    if (!tripId || busy || !isLeader || quotaFull) return;
    setBusy(true);
    try {
      const invite = await createTripInvite(
        tripId,
        label.trim() || t("invite.labelDefault"),
      );
      setInvites((prev) => [invite, ...prev]);
      setLabel("");
      setErrorKey(null);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (invite: TripInvite) => {
    if (!tripId) return;
    try {
      await revokeTripInvite(tripId, invite.id);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    }
  };

  const copy = async (invite: TripInvite) => {
    await Clipboard.setStringAsync(inviteUrlForToken(invite.token));
    setCopiedId(invite.id);
  };

  const sendWa = (invite: TripInvite) => {
    const url = inviteUrlForToken(invite.token);
    void Linking.openURL(
      waShareUrl(`${t("invite.waText")} ${trip?.name ?? ""}: ${url}`),
    );
  };

  const saveQuota = async () => {
    if (!tripId || !trip) return;
    const invalid = validateQuotaChange(quotaInput, memberCount);
    if (invalid) {
      setQuotaErrorKey(invalid);
      return;
    }
    setQuotaErrorKey(null);
    try {
      await updateTripQuota(tripId, Number(quotaInput.trim()));
      await load();
    } catch (error) {
      setQuotaErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.appbar}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t("invite.title")}</Text>
      </View>

      {errorKey ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{t(errorKey)}</Text>
        </View>
      ) : null}

      {trip ? (
        <Text style={styles.tripName}>
          {trip.name} · {memberCount}
          {trip.quota !== null && trip.quota !== undefined
            ? `/${trip.quota}`
            : ""}
        </Text>
      ) : null}
      <Text style={styles.note}>{t("invite.noteValidity")}</Text>
      <Text style={styles.note}>{t("invite.noteQuota")}</Text>

      {/* Kartu kuota — leader/admin. Selalu bisa diubah walau penuh. */}
      {isLeaderOrAdmin && trip ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("invite.quotaTitle")}</Text>
          <Text style={styles.cardSub}>
            {t("invite.quotaCurrent", {
              count: String(memberCount),
              quota:
                trip.quota !== null && trip.quota !== undefined
                  ? String(trip.quota)
                  : t("invite.quotaUnlimited"),
            })}
          </Text>
          <TextInput
            style={styles.input}
            value={quotaInput}
            onChangeText={setQuotaInput}
            keyboardType="number-pad"
            placeholder={t("invite.quotaPlaceholder")}
          />
          {quotaErrorKey ? (
            <Text style={styles.fieldError}>{t(quotaErrorKey)}</Text>
          ) : null}
          <Pressable
            style={({ pressed }) => [
              styles.btnMake,
              pressed && styles.btnPressed,
            ]}
            onPress={saveQuota}
          >
            <Text style={styles.btnMakeText}>{t("invite.quotaSave")}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Daftar + buat undangan — hanya leader. */}
      {isLeader ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("invite.listTitle")}</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder={t("invite.labelPlaceholder")}
          />
          <Pressable
            style={({ pressed }) => [
              styles.btnMake,
              pressed && !quotaFull && styles.btnPressed,
              quotaFull && styles.btnDisabled,
            ]}
            disabled={quotaFull || busy}
            onPress={makeInvite}
          >
            <Text style={styles.btnMakeText}>{t("invite.createLink")}</Text>
          </Pressable>
          {quotaFull ? (
            <Text style={styles.fieldError}>{t("invite.quotaFullNote")}</Text>
          ) : null}
          {invites.map((invite) => (
            <View key={invite.id} style={styles.inviteRow}>
              <Text style={styles.inviteLabel}>{invite.label}</Text>
              <View style={styles.linkbox}>
                <Text style={styles.linkboxText} numberOfLines={1}>
                  {inviteUrlForToken(invite.token)}
                </Text>
              </View>
              <View style={styles.actions}>
                <Pressable style={styles.btnCopy} onPress={() => copy(invite)}>
                  <Text style={styles.btnCopyText}>
                    {copiedId === invite.id
                      ? t("share.copied")
                      : t("share.copyLink")}
                  </Text>
                </Pressable>
                <Pressable style={styles.btnWa} onPress={() => sendWa(invite)}>
                  <Text style={styles.btnWaText}>{t("share.sendWa")}</Text>
                </Pressable>
              </View>
              <Pressable
                style={styles.btnRevoke}
                onPress={() => revoke(invite)}
              >
                <Text style={styles.btnRevokeText}>{t("share.revoke")}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, paddingBottom: 32, gap: 12 },
    appbar: { flexDirection: "row", alignItems: "center", gap: 10 },
    back: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface,
      ...shadowCard,
    },
    backGlyph: { fontSize: 22, color: c.text, lineHeight: 24 },
    appbarTitle: { fontSize: 17, fontWeight: "800", color: c.text },
    errBox: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.danger,
      borderRadius: radii.md,
      padding: 12,
    },
    errText: { fontSize: 13, fontWeight: "700", color: c.danger },
    tripName: { fontSize: 15, fontWeight: "800", color: c.text },
    note: { fontSize: 12.5, color: c.text2, lineHeight: 12.5 * 1.55 },
    card: {
      backgroundColor: c.surface,
      borderRadius: radii.lg,
      padding: 14,
      gap: 10,
      ...shadowCard,
    },
    cardTitle: { fontSize: 15, fontWeight: "800", color: c.text },
    cardSub: { fontSize: 13, color: c.text2, lineHeight: 13 * 1.55 },
    input: {
      backgroundColor: c.surface2,
      borderRadius: radii.md,
      paddingVertical: 12,
      paddingHorizontal: 14,
      fontSize: 14,
      color: c.text,
    },
    fieldError: { fontSize: 12.5, fontWeight: "700", color: c.danger },
    btnMake: {
      alignItems: "center",
      backgroundColor: c.primary,
      borderRadius: radii.md,
      paddingVertical: 14,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.32,
      shadowRadius: 18,
      elevation: 6,
    },
    btnPressed: { backgroundColor: c.primaryDark },
    btnDisabled: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
    btnMakeText: { fontSize: 14, fontWeight: "800", color: "#fff" },
    inviteRow: { gap: 8, paddingTop: 6 },
    inviteLabel: { fontSize: 14, fontWeight: "800", color: c.text },
    linkbox: {
      backgroundColor: c.surface2,
      borderRadius: radii.md,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    linkboxText: {
      fontSize: 12.5,
      fontWeight: "700",
      color: c.text,
      fontVariant: ["tabular-nums"],
    },
    actions: { flexDirection: "row", gap: 9 },
    btnCopy: {
      flex: 1,
      alignItems: "center",
      backgroundColor: c.surface,
      borderWidth: 1.5,
      borderColor: c.line,
      borderRadius: radii.md,
      paddingVertical: 12,
    },
    btnCopyText: { fontSize: 13, fontWeight: "800", color: c.text },
    btnWa: {
      flex: 1,
      alignItems: "center",
      backgroundColor: c.primary,
      borderRadius: radii.md,
      paddingVertical: 12,
    },
    btnWaText: { fontSize: 13, fontWeight: "800", color: "#fff" },
    btnRevoke: { alignItems: "center", paddingVertical: 10 },
    btnRevokeText: { fontSize: 12.5, fontWeight: "800", color: c.stSos },
  });
