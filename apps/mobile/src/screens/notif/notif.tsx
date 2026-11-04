// Layar Notifikasi — daftar dari GET /notifications. Baris SOS umum
// (GENERAL_SOS_ALERT / GENERAL_SOS_CLOSED) mengetuk ke halaman detail
// SOS umum; baris lain ditandai dibaca saja.
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import {
  fetchNotifications,
  markNotificationRead,
  type AppNotification,
} from "@/utils/notifications-api";
import { buttonAccessibility } from "@/utils/accessibility";

const GENERAL_SOS_KINDS = ["GENERAL_SOS_ALERT", "GENERAL_SOS_CLOSED"];

function kindLabel(kind: string, t: (key: string) => string): string {
  if (kind === "GENERAL_SOS_ALERT") return t("notif.generalSosAlert");
  if (kind === "GENERAL_SOS_CLOSED") return t("notif.generalSosClosed");
  if (kind === "TRIP_STARTED") return t("notif.tripStarted");
  return t("notif.otherKind");
}

export function NotifScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchNotifications()
      .then(setItems)
      .catch(() => setFailed(true));
  }, []);

  const open = (item: AppNotification) => {
    if (GENERAL_SOS_KINDS.includes(item.kind) && item.refId) {
      markNotificationRead(item.id).catch(() => {});
      router.push({
        pathname: "/sos-general-detail",
        params: { id: item.refId },
      });
      return;
    }
    // TRIP_STARTED: refId = id trip -> detail trip; dari sana anggota
    // mengetuk tracking dan pengirim posisi mulai jalan.
    if (item.kind === "TRIP_STARTED" && item.refId) {
      markNotificationRead(item.id).catch(() => {});
      router.push(`/trips/${item.refId}`);
      return;
    }
    if (!item.readAt) {
      markNotificationRead(item.id)
        .then(() =>
          setItems((prev) =>
            prev?.map((n) =>
              n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n,
            ) ?? prev,
          ),
        )
        .catch(() => {});
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.appbar}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          accessibilityLabel={t("common.back")}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t("notif.title")}</Text>
      </View>

      {failed ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t("notif.loadError")}</Text>
        </View>
      ) : items === null ? (
        <View style={styles.emptyCard}>
          <ActivityIndicator />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t("notif.empty")}</Text>
        </View>
      ) : (
        items.map((item) => (
          <Pressable
            key={item.id}
            style={[styles.row, !item.readAt && styles.rowUnread]}
            onPress={() => open(item)}
            {...buttonAccessibility(
              `${kindLabel(item.kind, t)}${item.actorName ? ` — ${item.actorName}` : ""}`,
            )}
          >
            <Text style={styles.rowTitle}>{kindLabel(item.kind, t)}</Text>
            {item.actorName ? (
              <Text style={styles.rowSub}>{item.actorName}</Text>
            ) : null}
            {GENERAL_SOS_KINDS.includes(item.kind) || item.kind === "TRIP_STARTED" ? (
              <Text style={styles.rowAction}>{t("notif.openDetail")} ›</Text>
            ) : null}
          </Pressable>
        ))
      )}
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
    emptyCard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.lg,
      padding: 24,
      alignItems: "center",
      marginTop: 12,
      ...shadowCard,
    },
    emptyTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: c.text,
      marginBottom: 4,
    },
    row: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.md,
      paddingVertical: 13,
      paddingHorizontal: 14,
      marginTop: 10,
    },
    rowUnread: { borderColor: c.stSos },
    rowTitle: { fontSize: 14, fontWeight: "800", color: c.text },
    rowSub: { fontSize: 13, color: c.text2, marginTop: 2 },
    rowAction: { fontSize: 13, fontWeight: "700", color: c.stSos, marginTop: 6 },
  });
