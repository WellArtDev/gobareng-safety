// Layar Usulanku — daftar usulan gunung & jalur buatan user beserta
// status persetujuan admin (GET /mountains/proposals/mine). Usulan TIDAK
// masuk katalog publik sampai disetujui; layar ini hanya menampilkan
// statusnya, bukan mengedit usulan.
import { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import { formatTripDate } from "@/utils/format-date";
import {
  fetchMyProposals,
  proposalStatusKey,
  type MountainProposal,
  type ProposalStatus,
  type RouteProposal,
} from "@/utils/proposals-api";

function pillStyle(status: ProposalStatus, styles: ReturnType<typeof makeStyles>) {
  if (status === "APPROVED") return [styles.pill, styles.pillOk];
  if (status === "REJECTED") return [styles.pill, styles.pillBad];
  return [styles.pill, styles.pillWait];
}

function pillTextStyle(status: ProposalStatus, styles: ReturnType<typeof makeStyles>) {
  if (status === "APPROVED") return styles.pillOkText;
  if (status === "REJECTED") return styles.pillBadText;
  return styles.pillWaitText;
}

export function MyProposalsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [mountains, setMountains] = useState<MountainProposal[]>([]);
  const [routes, setRoutes] = useState<RouteProposal[]>([]);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const mine = await fetchMyProposals();
      setMountains(mine.mountains);
      setRoutes(mine.routes);
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

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const renderStatus = (status: ProposalStatus, rejectReason: string | null) => (
    <View>
      <View style={pillStyle(status, styles)}>
        <Text style={pillTextStyle(status, styles)}>
          {t(proposalStatusKey(status))}
        </Text>
      </View>
      {status === "REJECTED" && rejectReason ? (
        <Text style={styles.reason}>
          {t("proposal.rejectedReason", { reason: rejectReason })}
        </Text>
      ) : null}
    </View>
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <Text style={styles.title}>{t("proposal.myTitle")}</Text>
      {errorKey ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{t(errorKey)}</Text>
        </View>
      ) : null}

      {mountains.length === 0 && routes.length === 0 && !errorKey ? (
        <Text style={styles.empty}>{t("proposal.myEmpty")}</Text>
      ) : null}

      {mountains.length > 0 ? (
        <View style={styles.teambox}>
          <Text style={styles.boxTitle}>{t("proposal.myMountains")}</Text>
          {mountains.map((m) => (
            <View key={m.id} style={styles.row}>
              <View style={styles.rowTxt}>
                <Text style={styles.rowName}>{m.name}</Text>
                <Text style={styles.rowSub}>
                  {m.location}
                  {m.elevationM
                    ? ` · ${t("proposal.myElevation", { elevation: String(m.elevationM) })}`
                    : ""}
                  {` · ${formatTripDate(m.createdAt)}`}
                </Text>
              </View>
              {renderStatus(m.status, m.rejectReason)}
            </View>
          ))}
        </View>
      ) : null}

      {routes.length > 0 ? (
        <View style={styles.teambox}>
          <Text style={styles.boxTitle}>{t("proposal.myRoutes")}</Text>
          {routes.map((r) => (
            <View key={r.id} style={styles.row}>
              <View style={styles.rowTxt}>
                <Text style={styles.rowName}>{r.name}</Text>
                <Text style={styles.rowSub}>
                  {t("proposal.myCheckpoints", {
                    count: String(r.posts.length),
                  })}
                  {` · ${formatTripDate(r.createdAt)}`}
                </Text>
              </View>
              {renderStatus(r.status, r.rejectReason)}
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
    content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 96 },
    title: { fontSize: 19, fontWeight: "800", color: c.text },
    errBox: {
      backgroundColor: c.errBg,
      borderRadius: radii.md,
      paddingVertical: 11,
      paddingHorizontal: 14,
      marginTop: 12,
    },
    errText: { color: c.stSosDark, fontSize: 13, fontWeight: "700" },
    empty: { fontSize: 13.5, color: c.text2, lineHeight: 13.5 * 1.55, marginTop: 12 },
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
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderStyle: "dashed",
      borderBottomColor: c.line,
    },
    rowTxt: { flex: 1 },
    rowName: { fontSize: 14, fontWeight: "800", color: c.text },
    rowSub: { fontSize: 12, color: c.text2, marginTop: 2 },
    pill: {
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: radii.pill,
      alignSelf: "flex-start",
    },
    pillWait: { backgroundColor: c.warningBg },
    pillWaitText: { fontSize: 12, fontWeight: "800", color: c.warning },
    pillOk: { backgroundColor: c.successBg },
    pillOkText: { fontSize: 12, fontWeight: "800", color: c.success },
    pillBad: { backgroundColor: c.errBg },
    pillBadText: { fontSize: 12, fontWeight: "800", color: c.stSosDark },
    reason: { fontSize: 12, color: c.stSosDark, marginTop: 6, maxWidth: 160 },
  });
