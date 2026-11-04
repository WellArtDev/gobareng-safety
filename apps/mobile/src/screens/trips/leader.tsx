// Dashboard Leader — mockup data-screen="leader": appbar + pill Live,
// ld-triphead (headcount X/Y + progress bar), peta live semua anggota,
// LEGENDA WARNA, stats 3 kolom (SOS/baterai/sinyal), NOTIFIKASI TIM
// (SOS aktif), DAFTAR ANGGOTA + status Berangkat. Trip dari rute
// /trips/[id]/leader; guard: non-leader -> pesan. Segmen touring
// (PTT + regroup) TIDAK dirender — butuh infrastruktur audio/kanal
// belum ada; tombol beacon TIDAK dirender — Beacon HOLD (26 Okt).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { LiveMap } from "@/components/LiveMap";
import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { buttonAccessibility } from "@/utils/accessibility";
import { ApiError } from "@/utils/auth-api";
import {
  fetchAttendanceSummary,
  type AttendanceSummary,
} from "@/utils/leader-api";
import {
  LEADER_ASSISTANT_TIMEOUT_MS,
  fetchLeaderAssistant,
  type LeaderAssistant,
  type OverdueKind,
} from "@/utils/leader-assistant-api";
import { tripCheckpointKindFromName } from "@/utils/trip-checkpoint-map-html";
import { withTimeout } from "@/utils/timeout";
import {
  findLeaderMember,
  headcountPercent,
  leaderCheckInState,
  leaderLoadOutcome,
  leaderScreenState,
  teamStats,
} from "@/utils/leader-logic";
import {
  fetchActiveSos,
  fetchPositions,
  type MemberPosition,
  type SosAlert,
} from "@/utils/locations-api";
import { getSessionName } from "@/utils/session-token";
import {
  checkInMeetingPoint,
  fetchTrip,
  fetchTripCheckpoints,
  fetchTripMembers,
  type Trip,
  type TripCheckpoint,
  type TripMember,
} from "@/utils/trips-api";

const POLL_MS = 15000;

// Kode alasan risiko server (§19) -> kunci i18n; kode tak dikenal
// jatuh ke label "tidak ada penanda" daripada crash.
const RISK_REASON_KEYS: Record<string, string> = {
  PEAK_ELEVATION: "leader.assistantRiskPeakElevation",
  DURATION: "leader.assistantRiskDuration",
  PARTICIPANTS: "leader.assistantRiskParticipants",
  RAINFALL: "leader.assistantRiskRainfall",
  FEMALE_MAJORITY: "leader.assistantRiskFemaleMajority",
};

const LEGEND: Array<{ color: string; labelKey: string; border?: boolean }> = [
  { color: "#22c55e", labelKey: "leader.legendMember" },
  { color: "#e3a008", labelKey: "leader.legendLeader" },
  { color: "#f97316", labelKey: "leader.legendSweeper" },
  { color: "#ffffff", labelKey: "leader.legendMedic", border: true },
  { color: "#dc2626", labelKey: "leader.legendSos" },
];

export function LeaderScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [positions, setPositions] = useState<MemberPosition[]>([]);
  const [sos, setSos] = useState<SosAlert[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [assistant, setAssistant] = useState<LeaderAssistant | null>(null);
  // Daftar anggota (fail-soft): sumber status sampai leader; gagal
  // muat tidak menghalangi layar maupun tombol (server idempotent).
  const [members, setMembers] = useState<TripMember[] | null>(null);
  const [checkpoints, setCheckpoints] = useState<TripCheckpoint[]>([]);
  // Urutan request asisten: polling 15 detik bisa tumpang tindih
  // dengan fetch asisten yang lambat — hasil basi diabaikan.
  const assistantSeqRef = useRef(0);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInErrorKey, setCheckInErrorKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Muat pertama: selama false, layar menampilkan loading — BUKAN
  // cangkang kosong 0/0 (penyebab "kosong diam-diam" lama: tidak ada
  // status loading sama sekali, dan `if (!id) return` diam tanpa error).
  const [loaded, setLoaded] = useState(false);
  // Pernah tampil data trip untuk id ini? Menentukan apakah gagal
  // muat berarti layar error penuh (muat pertama) atau hanya banner
  // dengan data lama dipertahankan (polling susulan). Di-reset saat
  // id berganti supaya data trip lama tidak pernah tampil.
  const everLoadedRef = useRef(false);

  // Reset saat trip berganti — dideklarasikan SEBELUM efek load di
  // bawah supaya reset jalan dulu, baru fetch trip yang baru.
  useEffect(() => {
    everLoadedRef.current = false;
    setTrip(null);
    setPositions([]);
    setSos([]);
    setAttendance(null);
    setAssistant(null);
    setMembers(null);
    setCheckpoints([]);
    setCheckingIn(false);
    setCheckInErrorKey(null);
    setErrorKey(null);
    setLoaded(false);
  }, [id]);

  const load = useCallback(async () => {
    if (!id) {
      // Param rute hilang (deep link / navigasi pulih): tampilkan
      // error eksplisit, jangan kembali diam-diam ke cangkang kosong.
      setErrorKey("leader.noTrip");
      setLoaded(true);
      return;
    }
    let positionsFailed = false;
    let attendanceFailed = false;
    try {
      // Perbaikan 4 Nov 2026: asisten AI TIDAK lagi ikut Promise.all
      // inti — panggilan AI yang menggantung dulu memblokir seluruh
      // layar di "Loading leader dashboard…". Asisten dimuat
      // independen (timeout + fail-soft, hasil basi diabaikan) dan
      // layar inti ditandai loaded begitu data inti selesai.
      const assistantSeq = ++assistantSeqRef.current;
      withTimeout(fetchLeaderAssistant(id), LEADER_ASSISTANT_TIMEOUT_MS)
        .then((asst) => {
          if (assistantSeqRef.current === assistantSeq && asst !== null) {
            setAssistant(asst);
          }
        })
        .catch(() => {
          // Timeout/gagal = section asisten tetap kosong, layar inti
          // tidak ikut gagal (desain fail-soft AI-L).
        });
      // Gagal fetch ditandai null (bukan fallback []/null yang tampil
      // sebagai data kosong): keputusan tampil diatur leaderLoadOutcome.
      const [tripData, pos, alerts, att, mem, cps] = await Promise.all([
        fetchTrip(id),
        fetchPositions(id).catch(() => {
          positionsFailed = true;
          return null;
        }),
        fetchActiveSos(id).catch(() => null),
        fetchAttendanceSummary(id).catch(() => {
          attendanceFailed = true;
          return null;
        }),
        // Fail-soft seperti SOS: gagal muat anggota tidak
        // memicu layar error; tombol tetap tampil (server idempotent).
        fetchTripMembers(id).catch(() => null),
        fetchTripCheckpoints(id).catch(() => [] as TripCheckpoint[]),
      ]);
      const outcome = leaderLoadOutcome({
        everLoaded: everLoadedRef.current,
        positionsFailed,
        attendanceFailed,
      });
      if (outcome === "error") {
        // Muat pertama gagal sebagian: JANGAN set trip/posisi/
        // attendance — fallback []/null akan tampil sebagai header
        // 0/0 + daftar kosong (persis screenshot 16:34). Mesin layar
        // (loaded + error + tanpa trip) menampilkan layar error +
        // tombol muat ulang; polling 15 detik tetap berjalan sehingga
        // layar pulih sendiri begitu sesi pulih (finally di bawah
        // tetap menandai loaded=true).
        setErrorKey("leader.partialError");
        return;
      }
      setTrip(tripData);
      // Polling susulan gagal sebagian: pertahankan data lama, jangan
      // timpa dengan []/null. Berlaku juga untuk SOS (dulu fetch
      // gagal mengosongkan section tersebut); asisten kini diatur
      // jalur independen di atas, bukan dari Promise.all ini.
      if (!positionsFailed && pos !== null) setPositions(pos);
      if (!attendanceFailed) setAttendance(att);
      if (alerts !== null) setSos(alerts);
      if (mem !== null) setMembers(mem);
      setCheckpoints(cps);
      setErrorKey(outcome === "banner" ? "leader.partialError" : null);
      everLoadedRef.current = true;
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Coba lagi dari layar error: kembali ke status loading dulu.
  const retry = () => {
    setLoaded(false);
    setErrorKey(null);
    void load();
  };

  // Check-in titik kumpul untuk leader sendiri — endpoint SAMA seperti
  // detail trip (tanpa endpoint baru); sukses -> muat ulang supaya
  // headcount + status sampai ikut segar. Server idempotent: POST
  // berulang tetap DEPARTED, tanpa error.
  const onCheckIn = async () => {
    if (!id || checkingIn) return;
    setCheckingIn(true);
    setCheckInErrorKey(null);
    try {
      await checkInMeetingPoint(id);
      await load();
    } catch (error) {
      setCheckInErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setCheckingIn(false);
    }
  };

  const sosUserIds = useMemo(
    () => new Set(sos.map((alert) => alert.userId)),
    [sos],
  );
  const stats = teamStats(positions, sos.length);

  // Sesi menyimpan nama; guard leader via nama (dipertegas saat /auth/me
  // dipakai menyeluruh). Server tetap menolak attendance-summary non-leader.
  const myName = getSessionName();
  const isLeader = Boolean(
    myName &&
      positions.some((p) => p.role === "LEADER" && p.user.name === myName),
  );

  // Status sampai leader: dari daftar anggota (bukan dari ada/tidaknya
  // posisi — leader yang check-in tapi HP-nya belum kirim posisi tetap
  // "sudah sampai"). Viewer adalah leader bila namanya cocok di posisi
  // ATAU di daftar anggota (tetap jalan saat belum ada posisi sama
  // sekali); tombol tidak pernah tampil untuk non-leader supaya
  // anggota lain tidak sengaja check-in dirinya sendiri dari layar ini.
  const leaderMember = findLeaderMember(members);
  const checkInState = leaderCheckInState({
    leaderAttendance: leaderMember?.attendance ?? null,
    checkingIn,
  });
  const isLeaderViewer =
    isLeader ||
    Boolean(
      myName && leaderMember && leaderMember.user.name === myName,
    );
  const leaderArrived = leaderMember?.attendance === "DEPARTED";

  const firstLocated = positions.find((p) => p.location !== null);
  const centerLat = trip?.meetingLat ?? firstLocated?.location?.lat ?? null;
  const centerLon = trip?.meetingLon ?? firstLocated?.location?.lon ?? null;

  const departed = attendance?.departed ?? 0;
  const total = attendance?.total ?? positions.length;
  const notDeparted = attendance?.notDeparted ?? 0;

  const sosNames = sos
    .map(
      (alert) =>
        positions.find((p) => p.userId === alert.userId)?.user.name ?? "",
    )
    .filter(Boolean);

  const overdueText = (
    kind: OverdueKind,
    name: string,
    checkpointName?: string,
  ): string => {
    if (kind === "CHECKPOINT") {
      return t("leader.assistantOverdueCheckpoint", {
        name,
        checkpoint: checkpointName ?? "",
      });
    }
    if (kind === "SIGNAL_STALE") {
      return t("leader.assistantOverdueSignal", { name });
    }
    return t("leader.assistantOverdueMeetingPoint", { name });
  };

  // Satu-satunya penentu tampilan (lihat leaderScreenState): loading
  // saat memuat, error saat gagal tanpa trip, data asli saat sukses.
  // Tanpa ini, render pertama selalu menampilkan cangkang kosong
  // (nama kosong, header 0/0, daftar kosong) tanpa keterangan.
  const screenState = leaderScreenState({
    loaded,
    hasTrip: trip !== null,
    hasError: errorKey !== null,
  });

  if (screenState === "loading") {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.centerText}>{t("leader.loading")}</Text>
      </View>
    );
  }

  if (screenState === "error") {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.centerText}>{t(errorKey!)}</Text>
        <Pressable style={styles.retryBtn} onPress={retry}>
          <Text style={styles.retryText}>{t("leader.retry")}</Text>
        </Pressable>
      </View>
    );
  }

  if (trip && positions.length > 0 && !isLeader) {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.centerText}>{t("leader.notLeader")}</Text>
      </View>
    );
  }

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
          accessibilityLabel={t("leader.backLabel")}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t("leader.title")}</Text>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.livePillText}>{t("leader.live")}</Text>
        </View>
      </View>

      {errorKey ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{t(errorKey)}</Text>
        </View>
      ) : null}

      {/* .ld-triphead */}
      <View style={styles.triphead}>
        <Text style={styles.tripName}>{trip?.name ?? ""}</Text>
        <Text style={styles.tripSub}>
          {trip?.date ?? ""} • {t("leader.youLead")}
        </Text>
        {attendance ? (
          <>
            <View style={styles.hcrow}>
              <Text style={styles.hcnum}>
                {departed}/{total}
              </Text>
              <Text style={styles.hcLabel}>{t("leader.departed")}</Text>
              {notDeparted > 0 ? (
                <Text style={styles.hcnote}>
                  {t("leader.notCheckedIn", { count: String(notDeparted) })}
                </Text>
              ) : null}
            </View>
            <View style={styles.bar}>
              <View
                style={[
                  styles.barFill,
                  { width: `${headcountPercent(departed, total)}%` },
                ]}
              />
            </View>
          </>
        ) : null}

        {/* Check-in titik kumpul leader: tombol untuk leader sendiri.
            Anggota melihat hasilnya di detail trip (lencana Berangkat
            pada baris leader) + headcount di atas — tanpa kanal baru. */}
        {trip && trip.status !== "CLOSED" && isLeaderViewer ? (
          checkInState === "arrived" ? (
            <Text style={styles.checkedInNote}>
              {t("leader.checkedInNote")}
            </Text>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.checkInBtn,
                pressed && styles.checkInBtnPressed,
                checkingIn && styles.checkInBtnDisabled,
              ]}
              onPress={onCheckIn}
              disabled={checkingIn}
              {...buttonAccessibility(t("leader.checkIn"), {
                busy: checkingIn,
                disabled: checkingIn,
              })}
            >
              <Text style={styles.checkInBtnText}>
                {checkingIn ? t("leader.checkingIn") : t("leader.checkIn")}
              </Text>
            </Pressable>
          )
        ) : null}
        {checkInErrorKey ? (
          <View style={[styles.errBox, styles.checkInErrBox]}>
            <Text style={styles.errText}>{t(checkInErrorKey)}</Text>
          </View>
        ) : null}
      </View>

      {/* AI-L: asisten leader — narasi AI (bila ada) + pengingat
          check-in tertunggak dari fakta DB; gagal fetch = section
          tidak tampil, layar leader tetap jalan. */}
      {assistant ? (
        <View style={styles.assistantBox}>
          <Text style={styles.secTitle}>{t("leader.assistantTitle")}</Text>
          {assistant.model ? (
            <Text style={styles.assistantAttr}>
              {t("leader.assistantAttribution")}
            </Text>
          ) : null}
          {assistant.summary ? (
            <Text style={styles.assistantText}>{assistant.summary}</Text>
          ) : (
            <Text style={styles.assistantText}>
              {assistant.aiStatus === "AI_NOT_CONFIGURED"
                ? t("leader.assistantNotConfigured")
                : t("leader.assistantUpstreamError")}
            </Text>
          )}
          <Text style={styles.assistantRisk}>
            {assistant.facts.risk.highRisk
              ? `${t("leader.assistantRiskHigh")}: ${assistant.facts.risk.reasons
                  .map((r) => t(RISK_REASON_KEYS[r] ?? "leader.assistantRiskNone"))
                  .join(", ")}`
              : t("leader.assistantRiskNone")}
          </Text>
          <Text style={styles.assistantSub}>
            {t("leader.assistantOverdueTitle")}
          </Text>
          {assistant.facts.overdueCheckins.length > 0 ? (
            assistant.facts.overdueCheckins.map((o, i) => (
              <Text key={`${o.userId}-${o.kind}-${i}`} style={styles.assistantItem}>
                {overdueText(o.kind, o.name, o.checkpointName)}
              </Text>
            ))
          ) : (
            <Text style={styles.assistantItem}>
              {t("leader.assistantOverdueEmpty")}
            </Text>
          )}
        </View>
      ) : null}

      {centerLat !== null && centerLon !== null ? (
        <LiveMap
          positions={positions}
          centerLat={centerLat}
          centerLon={centerLon}
          sosUserIds={sosUserIds}
          accessibilityLabel={t("leader.mapLabel")}
          checkpoints={checkpoints.map((cp) => ({
            name: cp.name,
            lat: cp.lat,
            lon: cp.lon,
            kind: tripCheckpointKindFromName(cp.name),
          }))}
        />
      ) : null}

      {/* .ld-legend */}
      <View style={styles.legend}>
        <Text style={styles.legendTitle}>{t("leader.legendTitle")}</Text>
        <View style={styles.legendList}>
          {LEGEND.map((item) => (
            <View key={item.labelKey} style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: item.color },
                  item.border && styles.legendDotBorder,
                ]}
              />
              <Text style={styles.legendLabel}>{t(item.labelKey)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* .stats */}
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, styles.statSos]}>
            {t("leader.statSos", { count: String(stats.sosCount) })}
          </Text>
          <Text style={styles.statLabel}>{t("leader.statSosLabel")}</Text>
        </View>
        <View style={[styles.stat, styles.statBorder]}>
          <Text style={styles.statValue}>{stats.lowBattery}</Text>
          <Text style={styles.statLabel}>{t("leader.statBattery")}</Text>
        </View>
        <View style={[styles.stat, styles.statBorder]}>
          <Text style={styles.statValue}>{stats.signalLost}</Text>
          <Text style={styles.statLabel}>{t("leader.statSignal")}</Text>
        </View>
      </View>

      {/* NOTIFIKASI TIM */}
      <Text style={styles.secTitle}>{t("leader.notifTitle")}</Text>
      {sosNames.length > 0 ? (
        sosNames.map((name) => (
          <View key={name} style={styles.ntf}>
            <View style={styles.nic}>
              <Text style={styles.nicGlyph}>!</Text>
            </View>
            <Text style={styles.ntfText}>
              {t("leader.notifSos", { name })}
            </Text>
          </View>
        ))
      ) : (
        <View style={styles.ntfEmpty}>
          <Text style={styles.ntfEmptyText}>{t("leader.notifEmpty")}</Text>
        </View>
      )}

      {/* DAFTAR ANGGOTA */}
      <Text style={styles.secTitle}>
        {t("leader.membersTitle", {
          departed: String(departed),
          total: String(total),
        })}
      </Text>
      <View style={styles.teambox}>
        {positions.map((p, index) => (
          <View
            key={p.userId}
            style={[
              styles.member,
              index === positions.length - 1 && styles.memberLast,
            ]}
          >
            <View
              style={[
                styles.mdot,
                {
                  backgroundColor: sosUserIds.has(p.userId)
                    ? "#dc2626"
                    : p.role === "LEADER"
                      ? "#e3a008"
                      : p.role === "SWEEPER"
                        ? "#f97316"
                        : p.role === "MEDIC"
                          ? "#ffffff"
                          : "#22c55e",
                },
                p.role === "MEDIC" && !sosUserIds.has(p.userId)
                  ? styles.mdotMedic
                  : null,
              ]}
            />
            <Text style={styles.memberName}>{p.user.name}</Text>
            {/* Baris leader memakai status sampai dari daftar anggota
                (bukan proksi posisi): leader yang sudah check-in
                tampil Berangkat walau posisinya belum terkirim. Baris
                lain tetap memakai logika lama (berbasis posisi). */}
            <Text style={styles.memberRole}>
              {p.role === "LEADER" && leaderMember
                ? t(
                    leaderArrived
                      ? "leader.statusDeparted"
                      : "leader.statusNotDeparted",
                  )
                : t(
                    p.location
                      ? "leader.statusDeparted"
                      : "leader.statusNotDeparted",
                  )}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 26 },
  centerWrap: {
    flex: 1,
    backgroundColor: c.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  centerText: {
    fontSize: 13,
    color: c.text2,
    fontWeight: "600",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: c.primary,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  retryText: { color: "#fff", fontSize: 13.5, fontWeight: "800" },
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
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.success },
  livePillText: { fontSize: 11, fontWeight: "800", color: c.success },
  errBox: {
    backgroundColor: c.errBg,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  errText: { color: c.stSosDark, fontSize: 13, fontWeight: "700" },
  // .ld-triphead
  triphead: { marginBottom: 12 },
  tripName: { fontSize: 15.5, fontWeight: "800", color: c.text },
  tripSub: {
    fontSize: 12.5,
    color: c.text2,
    fontWeight: "600",
    marginTop: 2,
  },
  hcrow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 7,
    marginTop: 8,
  },
  hcnum: { fontSize: 19, fontWeight: "800", color: c.text },
  hcLabel: { fontSize: 12.5, color: c.text2, fontWeight: "600" },
  hcnote: {
    marginLeft: "auto",
    fontSize: 11.5,
    fontWeight: "800",
    color: c.warning,
  },
  // Check-in titik kumpul leader (gaya tombol check-in detail trip:
  // permukaan + teks primary, bukan tombol aksi primer penuh).
  checkInBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    borderRadius: radii.md,
    paddingVertical: 13,
    paddingHorizontal: 18,
    marginTop: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
  },
  checkInBtnPressed: { opacity: 0.7 },
  checkInBtnDisabled: { opacity: 0.45 },
  checkInBtnText: { color: c.primary, fontWeight: "800", fontSize: 14 },
  checkedInNote: {
    fontSize: 12.5,
    color: c.text2,
    lineHeight: 12.5 * 1.55,
    marginTop: 12,
    textAlign: "center",
  },
  checkInErrBox: { marginTop: 10 },
  // .progress.ld-bar
  bar: {
    height: 6,
    borderRadius: 99,
    backgroundColor: c.surface2,
    overflow: "hidden",
    marginTop: 8,
  },
  barFill: {
    height: "100%",
    backgroundColor: c.primary,
    borderRadius: 99,
  },
  // .ld-legend
  legend: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 12,
    ...shadowCard,
  },
  legendTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: c.text3,
    marginBottom: 8,
  },
  legendList: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 11, height: 11, borderRadius: 6 },
  legendDotBorder: { borderWidth: 1.5, borderColor: "#cbd5cd" },
  legendLabel: { fontSize: 12, fontWeight: "700", color: c.text2 },
  // .stats
  stats: {
    flexDirection: "row",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    marginTop: 12,
    overflow: "hidden",
    ...shadowCard,
  },
  stat: { flex: 1, alignItems: "center", paddingVertical: 13, paddingHorizontal: 6 },
  statBorder: { borderLeftWidth: 1, borderLeftColor: c.line },
  statValue: { fontSize: 16, fontWeight: "800", color: c.text },
  statSos: { color: c.stSosDark },
  statLabel: {
    fontSize: 11,
    color: c.text2,
    fontWeight: "600",
    marginTop: 2,
    textAlign: "center",
  },
  secTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: c.text3,
    marginTop: 18,
    marginBottom: 10,
  },
  // .ntf
  ntf: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.stSos,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 10,
    ...shadowCard,
  },
  nic: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: c.errBg,
    alignItems: "center",
    justifyContent: "center",
  },
  nicGlyph: { color: c.stSosDark, fontSize: 18, fontWeight: "800" },
  ntfText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "700",
    color: c.text,
    lineHeight: 13.5 * 1.5,
  },
  ntfEmpty: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    padding: 14,
    ...shadowCard,
  },
  ntfEmptyText: { fontSize: 12.5, color: c.text3 },
  // AI-L: panel asisten leader (kartu di bawah triphead).
  assistantBox: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    padding: 14,
    marginTop: 14,
    ...shadowCard,
  },
  assistantAttr: {
    fontSize: 11,
    fontWeight: "800",
    color: c.success,
    marginBottom: 8,
  },
  assistantText: {
    fontSize: 13.5,
    fontWeight: "600",
    color: c.text,
    lineHeight: 13.5 * 1.5,
    marginBottom: 8,
  },
  assistantRisk: { fontSize: 12.5, fontWeight: "700", color: c.text2 },
  assistantSub: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: c.text3,
    marginTop: 12,
    marginBottom: 6,
  },
  assistantItem: {
    fontSize: 13,
    color: c.text,
    lineHeight: 13 * 1.5,
    marginBottom: 2,
  },
  teambox: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.lg,
    paddingVertical: 8,
    paddingHorizontal: 16,
    ...shadowCard,
  },
  member: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderBottomColor: c.line,
  },
  memberLast: { borderBottomWidth: 0 },
  mdot: { width: 13, height: 13, borderRadius: 7 },
  mdotMedic: { borderWidth: 1.5, borderColor: "#cbd5cd" },
  memberName: { fontSize: 13.5, fontWeight: "700", color: c.text, flex: 1 },
  memberRole: { fontSize: 11, fontWeight: "800", color: c.text3 },
});
