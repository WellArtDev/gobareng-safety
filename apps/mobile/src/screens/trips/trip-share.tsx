// Layar Bagikan Trip — mockup data-screen="share-trip": appbar + pill
// Live, ld-triphead, shr-note (read-only), kartu KIRIM KE KONTAK
// DARURAT (form kontak A-4 belum ada -> catatan jujur), kartu BAGIKAN
// KE SIAPA SAJA (buat tautan §16 -> linkbox + salin + WA), pratinjau
// tampilan keluarga (watch). Tautan nyata dari POST share-links.
import { useCallback, useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import {
  createShareLink,
  fetchShareLinks,
  revokeShareLink,
  waShareUrl,
  watchUrlForToken,
  type ShareLink,
} from "@/utils/share-api";
import { fetchTrip, fetchTripMembers, type Trip } from "@/utils/trips-api";

export function TripShareScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [leaderName, setLeaderName] = useState("");
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tripId) return;
    try {
      const [tripData, members, linkList] = await Promise.all([
        fetchTrip(tripId),
        fetchTripMembers(tripId).catch(() => []),
        fetchShareLinks(tripId).catch(() => [] as ShareLink[]),
      ]);
      setTrip(tripData);
      setLeaderName(
        members.find((m) => m.role === "LEADER")?.user.name ?? "",
      );
      setLinks(linkList);
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

  const anyoneLink = links.find((l) => l.scope === "ANYONE") ?? null;

  const makeLink = async () => {
    if (!tripId || busy) return;
    setBusy(true);
    try {
      const link = await createShareLink(tripId, t("share.labelAnyone"), "ANYONE");
      setLinks((prev) => [...prev, link]);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!anyoneLink) return;
    await Clipboard.setStringAsync(watchUrlForToken(anyoneLink.token));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // WA nyata (dulu placeholder waComingSoon): kirim teks + URL landing
  // pantau yang kini berfungsi, bukan lagi api base yang mati.
  const sendWa = () => {
    if (!anyoneLink) return;
    const url = watchUrlForToken(anyoneLink.token);
    void Linking.openURL(
      waShareUrl(`${t("share.waText")} ${trip?.name ?? ""}: ${url}`),
    );
  };

  const revoke = async (link: ShareLink) => {
    if (!tripId) return;
    try {
      await revokeShareLink(tripId, link.id);
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.appbar}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          accessibilityLabel={t("share.backLabel")}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t("share.title")}</Text>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.livePillText}>{t("share.live")}</Text>
        </View>
      </View>

      {/* .ld-triphead */}
      <View style={styles.triphead}>
        <Text style={styles.tripName}>{trip?.name ?? ""}</Text>
        <Text style={styles.tripSub}>
          {trip?.date ?? ""}
          {leaderName ? ` • ${t("share.leaderPrefix")}: ${leaderName}` : ""}
        </Text>
      </View>

      {/* .shr-note */}
      <View style={styles.note}>
        <Text style={styles.noteText}>{t("share.note")}</Text>
      </View>

      {errorKey ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{t(errorKey)}</Text>
        </View>
      ) : null}

      {/* KIRIM KE KONTAK DARURAT */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("share.ecTitle")}</Text>
        <Text style={styles.cardSub}>{t("share.ecSub")}</Text>
        {/* Model EmergencyContact belum ada (A-4) — catatan jujur. */}
        <Text style={styles.ecEmpty}>{t("share.ecEmpty")}</Text>
      </View>

      {/* BAGIKAN KE SIAPA SAJA */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("share.anyTitle")}</Text>
        <Text style={styles.cardSub}>{t("share.anySub")}</Text>
        {anyoneLink ? (
          <>
            {/* .shr-linkbox */}
            <View style={styles.linkbox}>
              <Text style={styles.linkboxText} numberOfLines={1}>
                {watchUrlForToken(anyoneLink.token)}
              </Text>
            </View>
            <View style={styles.actions}>
              <Pressable style={styles.btnCopy} onPress={copy}>
                <Text style={styles.btnCopyText}>
                  {copied ? t("share.copied") : t("share.copyLink")}
                </Text>
              </Pressable>
              <Pressable style={styles.btnWa} onPress={sendWa}>
                <Text style={styles.btnWaText}>{t("share.sendWa")}</Text>
              </Pressable>
            </View>
            <Pressable style={styles.btnRevoke} onPress={() => revoke(anyoneLink)}>
              <Text style={styles.btnRevokeText}>{t("share.revoke")}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.btnMake, pressed && styles.btnPressed]}
            onPress={makeLink}
            disabled={busy}
          >
            <Text style={styles.btnMakeText}>{t("share.createLink")}</Text>
          </Pressable>
        )}
      </View>

      {/* .btn-preview */}
      {anyoneLink ? (
        <Pressable
          style={styles.btnPreview}
          onPress={() => router.push(`/pantau/${anyoneLink.token}`)}
        >
          <Text style={styles.btnPreviewText}>{t("share.preview")}</Text>
        </Pressable>
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
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.successBg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.success,
  },
  livePillText: { fontSize: 11, fontWeight: "800", color: c.success },
  // .ld-triphead
  triphead: { marginBottom: 12 },
  tripName: { fontSize: 15.5, fontWeight: "800", color: c.text },
  tripSub: { fontSize: 12.5, color: c.text2, fontWeight: "600", marginTop: 2 },
  // .shr-note
  note: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: c.surface2,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  noteText: {
    flex: 1,
    fontSize: 12.5,
    color: c.text2,
    lineHeight: 12.5 * 1.6,
  },
  errBox: {
    backgroundColor: c.errBg,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  errText: { color: c.stSosDark, fontSize: 13, fontWeight: "700" },
  // .shr-card
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    ...shadowCard,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: c.text3,
    marginBottom: 6,
  },
  cardSub: {
    fontSize: 12.5,
    color: c.text2,
    lineHeight: 12.5 * 1.55,
    marginBottom: 12,
  },
  ecEmpty: {
    fontSize: 12,
    color: c.warning,
    fontWeight: "700",
    lineHeight: 12 * 1.55,
  },
  // .shr-linkbox
  linkbox: {
    backgroundColor: c.surface2,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
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
  btnRevoke: { alignItems: "center", paddingVertical: 10, marginTop: 4 },
  btnRevokeText: { fontSize: 12.5, fontWeight: "800", color: c.stSos },
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
  btnMakeText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  // .btn-preview
  btnPreview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.line,
    borderRadius: radii.md,
    paddingVertical: 13,
    paddingHorizontal: 15,
    ...shadowCard,
  },
  btnPreviewText: { fontSize: 14, fontWeight: "800", color: c.text },
});
