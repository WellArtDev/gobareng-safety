// Layar Gabung Trip berbayar — mockup data-screen="paid-join":
// intro, ringkasan trip (organizer/kumpul/biaya), INSTRUKSI PEMBAYARAN
// (transfer manual ke organizer), status pembayaran live dari
// GET /trip-groups/:id/payments/me (pill kuning menunggu / hijau
// terkonfirmasi). Kirim bukti transfer = menyusul (catatan jujur).
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import { formatTripDate } from "@/utils/format-date";
import { formatRupiah } from "@/utils/create-trip-logic";
import {
  fetchMyTripPayment,
  type MyTripPayment,
  type OrganizerBankDetails,
} from "@/utils/pay-api";
import { fetchTrip, fetchTripMembers, type Trip } from "@/utils/trips-api";

export function PaidJoinScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  // Rute /trips/[id]/paid-join -> param "id".
  const { id: tripId } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [leaderName, setLeaderName] = useState("");
  const [payment, setPayment] = useState<MyTripPayment | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!tripId) return;
    try {
      const [tripData, members, pay] = await Promise.all([
        fetchTrip(tripId),
        fetchTripMembers(tripId).catch(() => []),
        fetchMyTripPayment(tripId),
      ]);
      setTrip(tripData);
      setLeaderName(members.find((m) => m.role === "LEADER")?.user.name ?? "");
      setPayment(pay);
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

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const amount = formatRupiah(payment?.payment.amount ?? trip?.price ?? 0);
  const confirmed = payment?.payment.status === "CONFIRMED";
  const organizerBank: OrganizerBankDetails | null =
    payment?.organizerBank ?? null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <View style={styles.appbar}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          accessibilityLabel={t("paidJoin.backLabel")}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t("paidJoin.title")}</Text>
      </View>

      {errorKey ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{t(errorKey)}</Text>
        </View>
      ) : null}

      <Text style={styles.intro}>{t("paidJoin.intro")}</Text>

      {trip ? (
        <>
          <View style={styles.summary}>
            <View style={styles.kv}>
              <Text style={styles.k}>{t("paidJoin.trip")}</Text>
              <Text style={styles.v}>{trip.name}</Text>
            </View>
            <View style={styles.kv}>
              <Text style={styles.k}>{t("paidJoin.organizer")}</Text>
              <Text style={styles.v}>{leaderName || "—"}</Text>
            </View>
            <View style={styles.kv}>
              <Text style={styles.k}>{t("paidJoin.meet")}</Text>
              <Text style={styles.v}>{formatTripDate(trip.date)}</Text>
            </View>
            <View style={styles.kv}>
              <Text style={styles.k}>{t("paidJoin.meetPoint")}</Text>
              <Text style={styles.v}>{trip.meetingPoint}</Text>
            </View>
            <View style={styles.kv}>
              <Text style={styles.k}>{t("paidJoin.fee")}</Text>
              <Text style={styles.v}>
                {t("paidJoin.feePerPerson", { amount })}
              </Text>
            </View>
          </View>

          {/* .pay-card */}
          <View style={styles.payCard}>
            <Text style={styles.payTitle}>{t("paidJoin.payTitle")}</Text>
            <Text style={styles.payBig}>
              {t("paidJoin.payBig", { amount, organizer: leaderName || "—" })}
            </Text>
            <Text style={styles.payNote}>
              {t("paidJoin.payNote", { amount })}
            </Text>
            {organizerBank ? (
              <>
                <View style={styles.kv}>
                  <Text style={styles.k}>{t("paidJoin.bankName")}</Text>
                  <Text style={styles.v}>{organizerBank.bankName}</Text>
                </View>
                <View style={styles.kv}>
                  <Text style={styles.k}>{t("paidJoin.bankAccountNumber")}</Text>
                  <Text style={styles.v}>
                    {organizerBank.bankAccountNumber}
                  </Text>
                </View>
                <View style={styles.kv}>
                  <Text style={styles.k}>{t("paidJoin.bankAccountHolder")}</Text>
                  <Text style={styles.v}>
                    {organizerBank.bankAccountHolder}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.payTitle}>
                  {t("paidJoin.bankMissingTitle")}
                </Text>
                <Text style={styles.payNote}>
                  {t("paidJoin.bankMissingNote")}
                </Text>
              </>
            )}
          </View>

          {/* Status pembayaran */}
          <View style={styles.summary}>
            <View style={styles.kv}>
              <Text style={styles.k}>{t("paidJoin.statusLabel")}</Text>
              <View style={[styles.pill, confirmed && styles.pillOk]}>
                <View style={[styles.pdot, confirmed && styles.pdotOk]} />
                <Text style={[styles.pillText, confirmed && styles.pillTextOk]}>
                  {confirmed
                    ? t("paidJoin.statusConfirmed")
                    : t("paidJoin.statusWaiting")}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.note}>{t("paidJoin.confirmNote")}</Text>
          <Text style={styles.noteSoon}>{t("paidJoin.proofSoon")}</Text>
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
  errBox: {
    backgroundColor: c.errBg,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  errText: { color: c.stSosDark, fontSize: 13, fontWeight: "700" },
  intro: {
    fontSize: 12.5,
    color: c.text2,
    lineHeight: 12.5 * 1.6,
    marginBottom: 13,
  },
  summary: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    ...shadowCard,
  },
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
  // .pay-card
  payCard: {
    backgroundColor: c.primarySoft,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
  },
  payTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: c.primaryDark,
    marginBottom: 7,
  },
  payBig: {
    fontSize: 15.5,
    fontWeight: "800",
    color: c.text,
    marginBottom: 6,
  },
  payNote: {
    fontSize: 12.5,
    color: c.text2,
    lineHeight: 12.5 * 1.6,
  },
  // .pill.wait / terkonfirmasi
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.warningBg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  pillOk: { backgroundColor: c.successBg },
  pdot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.warning },
  pdotOk: { backgroundColor: c.success },
  pillText: { fontSize: 11, fontWeight: "800", color: c.warning },
  pillTextOk: { color: c.success },
  note: {
    fontSize: 12.5,
    color: c.text2,
    lineHeight: 12.5 * 1.6,
    marginBottom: 8,
  },
  noteSoon: {
    fontSize: 11.5,
    color: c.warning,
    fontWeight: "700",
    lineHeight: 11.5 * 1.55,
  },
});
