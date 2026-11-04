// Layar Detail Komunitas — data dari API §12 (GET /communities/:id,
// feed, join/leave). Data contoh hardcode dihapus 3 Nov 2026: tombol
// gabung benar-benar gabung/keluar, anggota dan diskusi benar-benar
// dari server; tanpa data, tampil empty state yang jujur.
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import {
  fetchCommunity,
  fetchCommunityFeed,
  joinCommunity,
  leaveCommunity,
  type CommunityDetail,
  type CommunityFeedPost,
} from "@/utils/communities-api";
import { fetchMe } from "@/utils/profile-api";

export function ClubDetailScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<CommunityDetail | null | undefined>(
    undefined,
  );
  const [feed, setFeed] = useState<CommunityFeedPost[] | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "feed" | "members">(
    "info",
  );
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetchCommunity(id)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch(() => {
        if (alive) {
          setDetail(null);
          setErrorKey("errors.unavailable");
        }
      });
    fetchCommunityFeed(id)
      .then((posts) => {
        if (alive) setFeed(posts);
      })
      .catch(() => {
        if (alive) setFeed([]);
      });
    fetchMe()
      .then((me) => {
        if (alive) setMeId(me.id);
      })
      .catch(() => {
        // Tanpa id user, tombol gabung tetap jalan; status "tergabung"
        // tidak bisa diturunkan dari daftar anggota.
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (detail === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (detail === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundText}>
          {t(errorKey ?? "clubs.notFound")}
        </Text>
      </View>
    );
  }

  const joined =
    meId !== null && detail.members.some((m) => m.userId === meId);

  const toggleJoin = async () => {
    if (busy || !id) return;
    setBusy(true);
    setErrorKey(null);
    try {
      if (joined) await leaveCommunity(id);
      else await joinCommunity(id);
      const fresh = await fetchCommunity(id);
      if (fresh) setDetail(fresh);
    } catch {
      setErrorKey("errors.unavailable");
    } finally {
      setBusy(false);
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
        <Text style={styles.appbarTitle} numberOfLines={1}>
          {detail.name}
        </Text>
      </View>

      {errorKey ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{t(errorKey)}</Text>
        </View>
      ) : null}

      <View style={styles.banner}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{detail.name[0]}</Text>
        </View>
        <Text style={styles.bannerTitle}>{detail.name}</Text>
        <Text style={styles.bannerMeta}>
          {detail.region ? `${detail.region} • ` : ""}
          {detail.memberCount} {t("clubs.membersSuffix")}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.btnJoin,
            pressed && styles.btnJoinPressed,
            joined && styles.btnJoinJoined,
          ]}
          onPress={toggleJoin}
          disabled={busy}
        >
          <Text
            style={[
              styles.btnJoinText,
              joined && styles.btnJoinTextJoined,
            ]}
          >
            {joined ? t("clubs.leave") : t("clubs.join")}
          </Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(["info", "feed", "members"] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab === "info"
                ? t("clubs.tabInfo")
                : tab === "feed"
                  ? t("clubs.tabFeed")
                  : t("clubs.tabMembers")}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "info" ? (
        <View style={styles.pane}>
          <Text style={styles.sectionHeader}>{t("clubs.aboutTitle")}</Text>
          <Text style={styles.desc}>{detail.description ?? "—"}</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("clubs.city")}</Text>
            <Text style={styles.infoVal}>{detail.region ?? "—"}</Text>
          </View>
        </View>
      ) : activeTab === "feed" ? (
        <View style={styles.pane}>
          {feed === null ? (
            <ActivityIndicator />
          ) : feed.length === 0 ? (
            <Text style={styles.emptyText}>{t("clubs.feedEmpty")}</Text>
          ) : (
            feed.map((post) => (
              <View key={post.id} style={styles.post}>
                <Text style={styles.postAuthor}>{post.authorName}</Text>
                <Text style={styles.postBody}>{post.body}</Text>
                <Text style={styles.postMeta}>
                  {post.commentCount} {t("clubs.commentsSuffix")}
                </Text>
              </View>
            ))
          )}
        </View>
      ) : (
        <View style={styles.pane}>
          {detail.members.length === 0 ? (
            <Text style={styles.emptyText}>{t("clubs.membersEmpty")}</Text>
          ) : (
            detail.members.map((m) => (
              <View key={m.userId} style={styles.memberRow}>
                <Text style={styles.memberName}>{m.name}</Text>
              </View>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 26 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    notFoundText: { fontSize: 13, color: c.text3 },
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
      color: c.text,
      flex: 1,
    },
    errBox: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.md,
      padding: 12,
      marginBottom: 12,
    },
    errText: { fontSize: 13, color: c.text2 },
    banner: {
      alignItems: "center",
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.lg,
      padding: 18,
      marginTop: 6,
      marginBottom: 14,
      ...shadowCard,
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
      backgroundColor: c.surface2,
    },
    avatarText: { fontSize: 24, fontWeight: "800", color: c.primary },
    bannerTitle: { fontSize: 17, fontWeight: "800", color: c.text },
    bannerMeta: { fontSize: 12, color: c.text3, marginTop: 3, marginBottom: 14 },
    btnJoin: {
      backgroundColor: c.primary,
      borderRadius: radii.md,
      paddingVertical: 10,
      paddingHorizontal: 20,
    },
    btnJoinPressed: { opacity: 0.8 },
    btnJoinJoined: { backgroundColor: c.surface2 },
    btnJoinText: { color: "#fff", fontSize: 13, fontWeight: "800" },
    btnJoinTextJoined: { color: c.text2 },
    tabs: {
      flexDirection: "row",
      backgroundColor: c.surface2,
      borderRadius: radii.md,
      padding: 3,
      marginBottom: 14,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      alignItems: "center",
      borderRadius: radii.sm,
    },
    tabActive: { backgroundColor: c.surface, ...shadowCard },
    tabText: { fontSize: 13, fontWeight: "700", color: c.text3 },
    tabTextActive: { color: c.text },
    pane: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radii.lg,
      padding: 16,
      ...shadowCard,
    },
    sectionHeader: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.1,
      textTransform: "uppercase",
      color: c.text3,
      marginBottom: 8,
    },
    desc: {
      fontSize: 13,
      lineHeight: 13 * 1.6,
      color: c.text2,
      marginBottom: 14,
    },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: c.line,
    },
    infoLabel: { fontSize: 13, color: c.text2, fontWeight: "600" },
    infoVal: { fontSize: 13, color: c.text, fontWeight: "700" },
    emptyText: { fontSize: 12.5, color: c.text3, textAlign: "center" },
    post: {
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: c.line,
    },
    postAuthor: { fontSize: 13, fontWeight: "800", color: c.text },
    postBody: { fontSize: 13, lineHeight: 13 * 1.5, color: c.text2 },
    postMeta: { fontSize: 12, color: c.text3, marginTop: 4 },
    memberRow: {
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: c.line,
    },
    memberName: { fontSize: 13, fontWeight: "700", color: c.text },
  });
