// Layar Detail Trip — mockup data-screen="trip-detail". Kerangka persis:
// appbar (back bulat + judul + pill status), expired-banner (hanya
// CLOSED), kartu .mtrip, teambox INFO TRIP, tombol Mulai Trip
// (nonaktif saat bukan PLANNED atau trip expired), expired-note.
// Data dari API live.
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";

import { StatusPillView, TripCard } from "@/components/TripCard";
import { useTranslation } from "@/i18n";
import { radii, shadowCard, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import { tripDisplayPill } from "@/utils/home-logic";
import { canStartTrip } from "@/utils/trip-dates";
import { useAccessibilityAnnouncement } from "@/hooks/use-accessibility-announcement";
import {
  alertAccessibility,
  buttonAccessibility,
  decorativeAccessibility,
  headingAccessibility,
} from "@/utils/accessibility";
import {
  addTripCheckpoint,
  checkInMeetingPoint,
  fetchAiSummary,
  fetchTrip,
  fetchTripCheckpoints,
  fetchTripMembers,
  fetchTripReport,
  generateTripReport,
  setMemberRole,
  startTrip,
  type Trip,
  type TripAiSummary,
  type TripCheckpoint,
  type TripMember,
  type TripReport,
  type TripRole,
} from "@/utils/trips-api";
import {
  canGenerateTripReport,
  resolveTripReportAction,
  showCheckpointForm,
  showInviteButton,
  showStartTripBlock,
  showTripQaButton,
} from "@/utils/trip-finished-actions";
import { fetchMe, type MeUser } from "@/utils/profile-api";
import { isQuotaFull } from "@/utils/invite-api";
import { parseCheckpointCoords } from "@/utils/trip-checkpoints";
import {
  checkpointsEmptyKey,
  resolveTripRouteInfo,
} from "@/utils/trip-route-info";
import { TRIP_ROLE_LABEL_KEY } from "@/utils/trip-role-labels";
import { leafletMapHtml } from "@/utils/location-search";
import {
  tripCheckpointKindFromName,
  tripCheckpointMapHtml,
  type TripCheckpointMapPoint,
} from "@/utils/trip-checkpoint-map-html";

// Warna dot peran — sama dengan warna marker peta (kontrak sistem).
const ROLE_DOT: Record<TripRole, string> = {
  LEADER: "#f5c518",
  SWEEPER: "#f78308",
  MEDIC: "#ffffff",
  MEMBER: "#268c4a",
};
const ASSIGNABLE_ROLES: ("SWEEPER" | "MEDIC" | "MEMBER")[] = [
  "SWEEPER",
  "MEDIC",
  "MEMBER",
];

export function TripDetailScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [checkpoints, setCheckpoints] = useState<TripCheckpoint[]>([]);
  const [me, setMe] = useState<MeUser | null>(null);
  // AI-R: laporan tersimpan; null = belum ada (fail-soft, tampil
  // placeholder lama). Generate dari mobile untuk trip selesai
  // (leader/admin) ditambahkan 3 Nov 2026; baca tetap seperti dulu.
  const [report, setReport] = useState<TripReport | null>(null);
  // Ringkasan AI (S4) untuk trip selesai: diambil lewat tombol
  // Ringkasan, bukan otomatis — gagal = kunci error jujur, bukan teks
  // karangan. Laporan: busy + error + catatan leader-only dipisah dari
  // error halaman supaya tidak menimpa pesan lain.
  const [aiSummary, setAiSummary] = useState<TripAiSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryErrorKey, setSummaryErrorKey] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportErrorKey, setReportErrorKey] = useState<string | null>(null);
  const [reportNoticeKey, setReportNoticeKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [roleBusy, setRoleBusy] = useState<string | null>(null);
  // Form checkpoint manual (leader + TOURING saja).
  const [cpName, setCpName] = useState("");
  const [cpLat, setCpLat] = useState("");
  const [cpLon, setCpLon] = useState("");
  const [cpError, setCpError] = useState<string | null>(null);
  const [cpSaving, setCpSaving] = useState(false);
  // Checkpoint terpilih di peta checkpoint (perbaikan 4 Nov 2026):
  // panel nama + koordinat + Direction tampil DI BAWAH peta.
  const [selectedCp, setSelectedCp] = useState<{
    name: string;
    lat: number;
    lon: number;
    isMeeting: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [tripData, memberData, checkpointData, meData] = await Promise.all([
        fetchTrip(id),
        fetchTripMembers(id).catch(() => [] as TripMember[]),
        fetchTripCheckpoints(id).catch(() => [] as TripCheckpoint[]),
        fetchMe().catch(() => null),
      ]);
      setTrip(tripData);
      setMembers(memberData);
      setCheckpoints(checkpointData);
      setMe(meData);
      // Laporan hanya relevan untuk trip selesai; 404 = belum ada.
      if (tripData.status === "CLOSED") {
        setReport(await fetchTripReport(id).catch(() => null));
      } else {
        setReport(null);
      }
      setErrorKey(null);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const onStart = async () => {
    if (!trip || starting || !canStartTrip(trip)) return;
    setStarting(true);
    try {
      await startTrip(trip.id);
      router.push(`/trips/${trip.id}/tracking`);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setStarting(false);
    }
  };

  const onCheckIn = async () => {
    if (!trip || checkingIn) return;
    setCheckingIn(true);
    try {
      await checkInMeetingPoint(trip.id);
      await load();
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setCheckingIn(false);
    }
  };

  const onSetRole = async (
    userId: string,
    role: "SWEEPER" | "MEDIC" | "MEMBER",
  ) => {
    if (!trip || roleBusy) return;
    setRoleBusy(userId);
    try {
      await setMemberRole(trip.id, userId, role);
      await load();
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setRoleBusy(null);
    }
  };

  const onAddCheckpoint = async () => {
    if (!trip || cpSaving) return;
    const parsed = parseCheckpointCoords(cpName, cpLat, cpLon);
    if (!parsed) {
      setCpError(t("tripDetail.checkpointInvalid"));
      return;
    }
    setCpError(null);
    setCpSaving(true);
    try {
      await addTripCheckpoint(trip.id, parsed);
      setCpName("");
      setCpLat("");
      setCpLon("");
      setCheckpoints(await fetchTripCheckpoints(trip.id));
    } catch (error) {
      setCpError(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setCpSaving(false);
    }
  };

  // Tombol Ringkasan (trip selesai saja): fetch GET ai-summary lalu
  // tampilkan teksnya di area ringkasan. Tombol disable saat loading
  // supaya tidak fetch ganda diam-diam.
  const onShowSummary = async () => {
    if (!trip || summaryLoading) return;
    setSummaryLoading(true);
    setSummaryErrorKey(null);
    try {
      setAiSummary(await fetchAiSummary(trip.id));
    } catch (error) {
      setSummaryErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setSummaryLoading(false);
    }
  };

  // Tombol Laporan (trip selesai saja): laporan ada + bisa generate ->
  // regenerate (menimpa baris sama); laporan ada + tidak bisa -> baca
  // ulang; belum ada + bisa -> generate; belum ada + tidak bisa ->
  // catatan jujur saja, tanpa request.
  const onReportAction = async () => {
    if (!trip || reportBusy) return;
    const action = resolveTripReportAction({
      hasReport: report !== null,
      canGenerate,
    });
    if (action === "blocked") {
      setReportNoticeKey("tripSummary.reportLeaderOnly");
      return;
    }
    setReportBusy(true);
    setReportErrorKey(null);
    setReportNoticeKey(null);
    try {
      if (action === "refresh") {
        setReport(await fetchTripReport(trip.id));
      } else {
        setReport(await generateTripReport(trip.id));
      }
    } catch (error) {
      setReportErrorKey(
        error instanceof ApiError ? error.i18nKey : "errors.unavailable",
      );
    } finally {
      setReportBusy(false);
    }
  };

  const onCheckpointMapPick = (event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        lat?: number;
        lon?: number;
      };
      if (msg.type !== "pick" || typeof msg.lat !== "number" || typeof msg.lon !== "number") {
        return;
      }
      setCpLat(String(msg.lat));
      setCpLon(String(msg.lon));
    } catch {
      // Pesan WebView bukan JSON pick — abaikan.
    }
  };

  const expired = trip?.status === "CLOSED";
  // Guard Mulai Trip (QA 2 Nov 2026): trip PLANNED yang tanggalnya
  // sudah lewat tidak bisa dimulai — tombol nonaktif, API pun menolak
  // dengan TRIP_EXPIRED.
  const canStart = trip ? canStartTrip(trip) : false;
  const pill = trip ? tripDisplayPill(trip) : null;
  const leaderName =
    members.find((m) => m.role === "LEADER")?.user.name ?? "—";
  const meId = me?.id ?? null;
  const myMember = meId ? members.find((m) => m.userId === meId) : undefined;
  const isLeader =
    myMember?.role === "LEADER" ||
    (!!trip && !!me && trip.leaderId === me.id);
  // Generate laporan hanya leader trip atau admin (guard yang sama
  // ditegakkan server; klien hanya menyesuaikan tombol).
  const canGenerate = canGenerateTripReport({
    isLeader,
    isAdmin: me?.isAdmin ?? false,
  });
  const myAttendance = myMember?.attendance ?? "NOT_DEPARTED";
  // Direction in-app (3 Nov 2026): ganti tautan Google Maps — baris
  // titik kumpul + checkpoint membuka layar direction; target dihitung
  // layar direction dari status check-in (entryDirectionTarget).
  const hasMeetingCoords =
    trip !== null && trip.meetingLat !== null && trip.meetingLon !== null;
  // Info rute hiking: hanya tampil bila payload trip membawanya.
  // Payload saat ini tidak membawa field rute (lihat trip-route-info),
  // jadi untuk trip yang ada nilainya null dan layar menampilkan
  // keadaan jujur "belum terhubung ke rute".
  const routeInfo =
    trip !== null && trip.type === "HIKING"
      ? resolveTripRouteInfo(trip)
      : null;
  const openDirection = (
    entry: "meeting" | "checkpoint",
    cp?: TripCheckpoint,
  ) => {
    if (!trip) return;
    router.push({
      pathname: `/trips/${trip.id}/direction`,
      params:
        entry === "checkpoint" && cp
          ? {
              entry,
              cpLat: String(cp.lat),
              cpLon: String(cp.lon),
              cpName: cp.name,
            }
          : { entry },
    });
  };
  // Titik peta checkpoint (perbaikan 4 Nov 2026): checkpoint trip
  // (pos jalur yang disalin + manual) plus titik kumpul bila punya
  // koordinat dan belum sama dengan salah satu checkpoint — titik
  // kumpul ditandai oranye sebagai titik kumpul, bukan Pos.
  const mapPoints: TripCheckpointMapPoint[] = (() => {
    const pts: TripCheckpointMapPoint[] = [];
    if (hasMeetingCoords && trip) {
      pts.push({
        name: trip.meetingPoint,
        lat: trip.meetingLat as number,
        lon: trip.meetingLon as number,
        kind: "camp",
      });
    }
    for (const cp of checkpoints) {
      const dup = pts.some(
        (p) => Math.abs(p.lat - cp.lat) < 0.001 && Math.abs(p.lon - cp.lon) < 0.001,
      );
      if (!dup) {
        pts.push({
          name: cp.name,
          lat: cp.lat,
          lon: cp.lon,
          kind: tripCheckpointKindFromName(cp.name),
        });
      }
    }
    return pts;
  })();
  const onCheckpointMapSelect = (event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        index?: number;
      };
      if (msg.type !== "select" || typeof msg.index !== "number") return;
      const point = mapPoints[msg.index];
      if (!point) return;
      setSelectedCp({
        name: point.name,
        lat: point.lat,
        lon: point.lon,
        isMeeting:
          hasMeetingCoords &&
          trip !== null &&
          point.name === trip.meetingPoint &&
          point.lat === trip.meetingLat &&
          point.lon === trip.meetingLon,
      });
    } catch {
      // Pesan WebView bukan JSON select — abaikan.
    }
  };
  // INVITE: hanya leader yang boleh mengundang; Atur Kuota untuk
  // leader/admin (sesuai guard endpoint masing-masing).
  const quotaFull = trip ? isQuotaFull(trip.quota, members.length) : false;
  const errorMessage = errorKey ? t(errorKey) : null;
  useAccessibilityAnnouncement(errorMessage);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* .appbar */}
      <View style={styles.appbar}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          {...buttonAccessibility(t("tripDetail.backLabel"))}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text
          style={styles.appbarTitle}
          {...headingAccessibility(t("tripDetail.title"))}
        >
          {t("tripDetail.title")}
        </Text>
        {pill ? <StatusPillView kind={pill.kind} label={t(pill.labelKey)} /> : null}
      </View>

      {errorKey ? (
        <View style={styles.errBox} {...alertAccessibility(errorMessage!)}>
          <Text style={styles.errText}>{errorMessage}</Text>
        </View>
      ) : null}

      {/* .expired-banner — khusus status EXPIRED (expired-rule §14,
          kartu A-5). CLOSED normal tidak memakai banner ini. */}

      {trip ? (
        <>
          <TripCard
            trip={trip}
            memberCount={members.length > 0 ? members.length : null}
            statusLabelKey="home.tripStatus"
          />

          {/* teambox INFO TRIP */}
          <View style={styles.teambox}>
            <Text style={styles.teamTitle}>{t("tripDetail.infoTitle")}</Text>
            <View style={styles.kv}>
              <Text style={styles.k}>{t("tripDetail.organizer")}</Text>
              <Text style={styles.v}>{leaderName}</Text>
            </View>
            {/* Rute hiking: baris hanya untuk nilai yang ada; bila
                payload tidak membawa data rute sama sekali, tampilkan
                keadaan jujur, bukan tebakan dari nama/katalog. */}
            {trip.type === "HIKING" ? (
              routeInfo === null ? (
                <View style={styles.kv}>
                  <Text style={styles.k}>{t("tripDetail.routeName")}</Text>
                  <Text style={styles.v}>{t("tripDetail.routeNotLinked")}</Text>
                </View>
              ) : (
                <>
                  {routeInfo.mountainName !== null ? (
                    <View style={styles.kv}>
                      <Text style={styles.k}>{t("tripDetail.routeMountain")}</Text>
                      <Text style={styles.v}>{routeInfo.mountainName}</Text>
                    </View>
                  ) : null}
                  {routeInfo.routeName !== null ? (
                    <View style={styles.kv}>
                      <Text style={styles.k}>{t("tripDetail.routeName")}</Text>
                      <Text style={styles.v}>{routeInfo.routeName}</Text>
                    </View>
                  ) : null}
                  {routeInfo.distanceKm !== null ? (
                    <View style={styles.kv}>
                      <Text style={styles.k}>{t("mountains.distance")}</Text>
                      <Text style={styles.v}>{routeInfo.distanceKm} km</Text>
                    </View>
                  ) : null}
                  {routeInfo.gainM !== null ? (
                    <View style={styles.kv}>
                      <Text style={styles.k}>{t("mountains.gain")}</Text>
                      <Text style={styles.v}>+{routeInfo.gainM} m</Text>
                    </View>
                  ) : null}
                  {routeInfo.estHours !== null ? (
                    <View style={styles.kv}>
                      <Text style={styles.k}>{t("mountains.duration")}</Text>
                      <Text style={styles.v}>
                        {routeInfo.estHours} {t("mountains.hours")}
                      </Text>
                    </View>
                  ) : null}
                </>
              )
            ) : null}
            {hasMeetingCoords ? (
              <Pressable
                style={styles.kv}
                onPress={() => openDirection("meeting")}
                {...buttonAccessibility(t("tripDetail.openMap"))}
              >
                <Text style={styles.k}>{t("home.meetingPoint")}</Text>
                <Text style={[styles.v, styles.link]}>
                  {trip.meetingPoint} ›
                </Text>
              </Pressable>
            ) : (
              <View style={styles.kv}>
                <Text style={styles.k}>{t("home.meetingPoint")}</Text>
                <Text style={styles.v}>{trip.meetingPoint}</Text>
              </View>
            )}
            {trip.quota !== null ? (
              <View style={styles.kv}>
                <Text style={styles.k}>{t("tripDetail.quota")}</Text>
                <Text style={styles.v}>
                  {members.length}/{trip.quota}
                </Text>
              </View>
            ) : null}
            <View style={styles.kv}>
              <Text style={styles.k}>{t("tripDetail.openTrip")}</Text>
              <Text style={styles.v}>
                {trip.isOpenTrip ? t("tripDetail.yes") : t("tripDetail.no")}
              </Text>
            </View>
          </View>

          {/* Check-in titik kumpul: sebelum check-in tombol, sesudah
              check-in catatan bahwa direction pindah ke tujuan trip. */}
          {trip.status !== "CLOSED" && me ? (
            myAttendance === "NOT_DEPARTED" ? (
              <Pressable
                style={({ pressed }) => [
                  styles.btnCheckIn,
                  pressed && styles.btnCheckInPressed,
                  checkingIn && styles.btnDepartDisabled,
                ]}
                onPress={onCheckIn}
                disabled={checkingIn}
                {...buttonAccessibility(t("tripDetail.checkIn"), {
                  busy: checkingIn,
                  disabled: checkingIn,
                })}
              >
                <Text style={styles.btnCheckInText}>
                  {checkingIn
                    ? t("tripDetail.checkingIn")
                    : t("tripDetail.checkIn")}
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.checkedInNote}>
                {t("tripDetail.checkedInNote")}
              </Text>
            )
          ) : null}

          {/* ANGGOTA TRIP — daftar + peran; leader bisa menetapkan
              peran anggota lain (sweeper/medic/anggota). */}
          <View style={styles.teambox}>
            <Text style={styles.teamTitle}>{t("tripDetail.membersTitle")}</Text>
            {members.length === 0 ? (
              <Text style={styles.photosEmpty}>—</Text>
            ) : (
              members.map((m) => (
                <View key={m.userId} style={styles.memberRow}>
                  <View style={styles.memberHead}>
                    <View
                      style={[
                        styles.roleDot,
                        { backgroundColor: ROLE_DOT[m.role] },
                      ]}
                    />
                    <Text style={styles.memberName}>{m.user.name}</Text>
                    <Text style={styles.memberRole}>
                      {t(TRIP_ROLE_LABEL_KEY[m.role])}
                    </Text>
                    <Text style={styles.memberAtt}>
                      {m.attendance === "DEPARTED"
                        ? t("tripDetail.departed")
                        : t("tripDetail.notDeparted")}
                    </Text>
                  </View>
                  {isLeader && m.userId !== meId ? (
                    <View style={styles.chipRow}>
                      {ASSIGNABLE_ROLES.map((role) => (
                        <Pressable
                          key={role}
                          style={[
                            styles.chip,
                            m.role === role && styles.chipActive,
                            roleBusy === m.userId && styles.btnDepartDisabled,
                          ]}
                          onPress={() => onSetRole(m.userId, role)}
                          disabled={roleBusy === m.userId}
                          {...buttonAccessibility(t(TRIP_ROLE_LABEL_KEY[role]))}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              m.role === role && styles.chipTextActive,
                            ]}
                          >
                            {t(TRIP_ROLE_LABEL_KEY[role])}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View>

          {/* CHECKPOINT — daftar + form tambah manual (leader +
              TOURING). Checkpoint hiking tetap dari jalur gunung. */}
          <View style={styles.teambox}>
            <Text style={styles.teamTitle}>
              {t("tripDetail.checkpointsTitle")}
            </Text>
            {mapPoints.length === 0 ? (
              <Text style={styles.photosEmpty}>
                {t(checkpointsEmptyKey(trip))}
              </Text>
            ) : (
              <>
                <Text style={styles.photosEmpty}>
                  {t("tripDetail.checkpointMapHint")}
                </Text>
                <WebView
                  style={styles.cpDetailMap}
                  source={{
                    html: tripCheckpointMapHtml({
                      points: mapPoints,
                      labels: {
                        post: t("mountains.routeKindPost"),
                        camp: t("mountains.routeKindCamp"),
                        peak: t("mountains.routeKindPeak"),
                      },
                    }),
                  }}
                  onMessage={onCheckpointMapSelect}
                />
                {/* Panel titik terpilih: tumpukan vertikal tepat di
                    bawah peta (perbaikan jarak peta–tombol, Nov 2026).
                    Sebelumnya panel ini memakai baris kv + tombol
                    width 100% di dalam baris, sehingga nama/koordinat
                    tertekan sampai hilang dan tombol terlepas jauh
                    dari peta. Isi panel tidak berubah: nama,
                    koordinat, dan tombol Direction yang sama. */}
                {selectedCp ? (
                  <View style={styles.cpSelected}>
                    <Text style={styles.k}>{selectedCp.name}</Text>
                    <Text style={styles.cpSelectedCoords}>
                      {selectedCp.lat}, {selectedCp.lon}
                    </Text>
                    <Pressable
                      style={({ pressed }) => [
                        styles.btnCheckIn,
                        styles.cpDirectionBtn,
                        pressed && styles.btnCheckInPressed,
                      ]}
                      onPress={() =>
                        selectedCp.isMeeting
                          ? openDirection("meeting")
                          : openDirection("checkpoint", {
                              id: "",
                              tripId: trip.id,
                              name: selectedCp.name,
                              lat: selectedCp.lat,
                              lon: selectedCp.lon,
                              createdAt: "",
                            })
                      }
                      {...buttonAccessibility(
                        t("tripDetail.checkpointDirection"),
                      )}
                    >
                      <Text style={styles.btnCheckInText}>
                        {t("tripDetail.checkpointDirection")}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            )}
            {showCheckpointForm({
              status: trip.status,
              isLeader,
              type: trip.type,
            }) ? (
              <View style={styles.cpForm}>
                <Text style={styles.cpFormTitle}>
                  {t("tripDetail.checkpointAddTitle")}
                </Text>
                <TextInput
                  style={styles.input}
                  value={cpName}
                  onChangeText={setCpName}
                  placeholder={t("tripDetail.checkpointName")}
                  maxLength={100}
                />
                <View style={styles.coordRow}>
                  <TextInput
                    style={[styles.input, styles.coordInput]}
                    value={cpLat}
                    onChangeText={setCpLat}
                    placeholder={t("tripDetail.checkpointLat")}
                    keyboardType="decimal-pad"
                  />
                  <TextInput
                    style={[styles.input, styles.coordInput]}
                    value={cpLon}
                    onChangeText={setCpLon}
                    placeholder={t("tripDetail.checkpointLon")}
                    keyboardType="decimal-pad"
                  />
                </View>
                <Text style={styles.cpHint}>
                  {t("tripDetail.checkpointPickHint")}
                </Text>
                <WebView
                  style={styles.cpMap}
                  source={{
                    html: leafletMapHtml(
                      trip.meetingLat ?? -6.2,
                      trip.meetingLon ?? 106.8,
                      12,
                    ),
                  }}
                  onMessage={onCheckpointMapPick}
                />
                {cpError ? (
                  <Text style={styles.cpError}>{cpError}</Text>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.btnCheckIn,
                    pressed && styles.btnCheckInPressed,
                    cpSaving && styles.btnDepartDisabled,
                  ]}
                  onPress={onAddCheckpoint}
                  disabled={cpSaving}
                  {...buttonAccessibility(t("tripDetail.checkpointAdd"), {
                    busy: cpSaving,
                    disabled: cpSaving,
                  })}
                >
                  <Text style={styles.btnCheckInText}>
                    {cpSaving
                      ? t("tripDetail.checkpointAdding")
                      : t("tripDetail.checkpointAdd")}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* INVITE (2 Nov 2026): tombol Undang Anggota DISABLED saat
              kuota penuh (lapis UI; server tetap menolak join via
              undangan saat penuh). Editor kuota tinggal di layar
              invite — tombol Atur Kuota terpisah dihapus 3 Nov 2026
              atas perintah Wella karena editornya sudah ada di sana. */}
          {showInviteButton({ status: trip.status, isLeader }) ? (
            <>
              <View style={styles.gap14} />
              <Pressable
                style={({ pressed }) => [
                  styles.btnDepart,
                  pressed && !quotaFull && styles.btnDepartPressed,
                  quotaFull && styles.btnDepartDisabled,
                ]}
                disabled={quotaFull}
                onPress={() =>
                  router.push(`/trips/invite?tripId=${trip.id}`)
                }
                {...buttonAccessibility(t("invite.inviteButton"))}
              >
                <Text style={styles.btnDepartText}>
                  {t("invite.inviteButton")}
                </Text>
              </Pressable>
              {quotaFull ? (
                <Text style={styles.expiredNote}>
                  {t("invite.quotaFullNote")}
                </Text>
              ) : null}
            </>
          ) : null}
          {/* Ringkasan + foto untuk trip selesai (CLOSED) — keputusan
              Wella 28 Okt. Laporan lengkap pasca-trip = kartu AI-R. */}
          {expired ? (
            <View style={styles.teambox}>
              <Text style={styles.teamTitle}>{t("tripSummary.title")}</Text>
              <View style={styles.kv}>
                <Text style={styles.k}>{t("tripSummary.members")}</Text>
                <Text style={styles.v}>{members.length}</Text>
              </View>
              <View style={styles.kv}>
                <Text style={styles.k}>{t("tripSummary.status")}</Text>
                <Text style={styles.v}>{t("tripSummary.statusClosed")}</Text>
              </View>
              {/* Tombol Ringkasan + Laporan (trip selesai saja, perintah
                  Wella 3 Nov 2026): Ringkasan fetch ai-summary, Laporan
                  generate/regenerate/baca-ulang sesuai state — tanpa
                  teks karangan, gagal = pesan error jujur. */}
              <View style={styles.gap14} />
              <Pressable
                style={({ pressed }) => [
                  styles.btnDepart,
                  pressed && styles.btnDepartPressed,
                  summaryLoading && styles.btnDepartDisabled,
                ]}
                onPress={onShowSummary}
                disabled={summaryLoading}
                {...buttonAccessibility(t("tripSummary.summaryButton"), {
                  busy: summaryLoading,
                  disabled: summaryLoading,
                })}
              >
                <Text style={styles.btnDepartText}>
                  {summaryLoading
                    ? t("tripSummary.summaryLoading")
                    : t("tripSummary.summaryButton")}
                </Text>
              </Pressable>
              <View style={styles.gap14} />
              <Pressable
                style={({ pressed }) => [
                  styles.btnDepart,
                  pressed && styles.btnDepartPressed,
                  reportBusy && styles.btnDepartDisabled,
                ]}
                onPress={onReportAction}
                disabled={reportBusy}
                {...buttonAccessibility(t("tripSummary.reportButton"), {
                  busy: reportBusy,
                  disabled: reportBusy,
                })}
              >
                <Text style={styles.btnDepartText}>
                  {reportBusy
                    ? t("tripSummary.reportLoading")
                    : t("tripSummary.reportButton")}
                </Text>
              </Pressable>
              {summaryErrorKey ? (
                <Text style={styles.cpError}>{t(summaryErrorKey)}</Text>
              ) : null}
              {reportErrorKey ? (
                <Text style={styles.cpError}>{t(reportErrorKey)}</Text>
              ) : null}
              {reportNoticeKey ? (
                <Text style={styles.photosEmpty}>{t(reportNoticeKey)}</Text>
              ) : null}
              {aiSummary ? (
                <>
                  <Text style={styles.teamTitle}>
                    {t("tripSummary.summaryTitle")}
                  </Text>
                  <Text style={styles.photosEmpty}>{aiSummary.summary}</Text>
                  {aiSummary.model ? (
                    <Text style={styles.photosEmpty}>
                      {t("tripSummary.reportAttribution")}
                    </Text>
                  ) : null}
                </>
              ) : null}
              <Text style={styles.photosTitle}>{t("tripSummary.photos")}</Text>
              {/* API belum punya foto trip — tempat foto menampilkan
                  catatan kosong dulu (fail-soft, bukan dummy). */}
              <Text style={styles.photosEmpty}>{t("tripSummary.noPhotos")}</Text>
              {report ? (
                <>
                  <Text style={styles.teamTitle}>{t("tripSummary.reportTitle")}</Text>
                  <Text style={styles.photosEmpty}>{report.summary}</Text>
                  <View style={styles.kv}>
                    <Text style={styles.k}>{t("tripSummary.reportAttendance")}</Text>
                    <Text style={styles.v}>
                      {report.facts.departedCount}/{report.facts.memberCount}
                    </Text>
                  </View>
                  <View style={styles.kv}>
                    <Text style={styles.k}>{t("tripSummary.reportSos")}</Text>
                    <Text style={styles.v}>
                      {report.facts.sosTotal === 0
                        ? "0"
                        : report.facts.sosByReason
                            .map((s) => `${s.reason} ×${s.count}`)
                            .join(", ")}
                    </Text>
                  </View>
                  {report.model ? (
                    <Text style={styles.photosEmpty}>
                      {t("tripSummary.reportAttribution")}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.photosEmpty}>
                  {t("tripSummary.reportSoon")}
                </Text>
              )}
            </View>
          ) : null}

          {/* Trip Q&A + Start Trip disembunyikan total untuk trip
              selesai (perintah Wella 3 Nov 2026 18:37) — sebelumnya
              Start Trip tampil redup/disabled untuk CLOSED. */}
          {showTripQaButton(trip.status) ? (
            <>
              <View style={styles.gap14} />
              {/* AI-Q: tanya-jawab member trip (hanya member, server
                  403 untuk non-member). */}
              <Pressable
                style={({ pressed }) => [
                  styles.btnDepart,
                  pressed && styles.btnDepartPressed,
                ]}
                onPress={() => router.push(`/trips/${trip.id}/qa`)}
                {...buttonAccessibility(t("aiQ.openButton"))}
              >
                <Text style={styles.btnDepartText}>{t("aiQ.openButton")}</Text>
              </Pressable>
            </>
          ) : null}
          {showStartTripBlock(trip.status) ? (
            <>
              <View style={styles.gap14} />
              {trip.status === "ACTIVE" ? (
            <Pressable
              style={({ pressed }) => [
                styles.btnDepart,
                pressed && styles.btnDepartPressed,
              ]}
              onPress={() => router.push(`/trips/${trip.id}/tracking`)}
              {...buttonAccessibility(t("tripList.openTracking"))}
            >
              <Image
                source={require("@/assets/icons/nav-trip.svg")}
                style={styles.playIcon}
                tintColor="#fff"
                {...decorativeAccessibility}
              />
              <Text style={styles.btnDepartText}>
                {t("tripList.openTracking")}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.btnDepart,
                pressed && styles.btnDepartPressed,
                !canStart && styles.btnDepartDisabled,
              ]}
              onPress={onStart}
              disabled={!canStart || starting}
              {...buttonAccessibility(t("home.startTrip"), {
                busy: starting,
                disabled: !canStart || starting,
              })}
            >
              <Image
                source={require("@/assets/icons/play.svg")}
                style={styles.playIcon}
                tintColor="#fff"
                {...decorativeAccessibility}
              />
              <Text style={styles.btnDepartText}>{t("home.startTrip")}</Text>
            </Pressable>
              )}
            </>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  // .screen no-nav
  content: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 26 },
  appbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  // .back bulat 38px
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
  // .expired-banner
  expiredBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: c.errBg,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 2,
  },
  expiredBannerText: {
    color: c.stSosDark,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 13 * 1.55,
    flex: 1,
  },
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
  teamTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: c.text3,
    marginBottom: 8,
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
  link: { color: c.primary },
  btnCheckIn: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    borderRadius: radii.md,
    paddingVertical: 13,
    paddingHorizontal: 18,
    marginTop: 14,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.primary,
  },
  btnCheckInPressed: { opacity: 0.7 },
  btnCheckInText: { color: c.primary, fontWeight: "800", fontSize: 14 },
  checkedInNote: {
    fontSize: 12.5,
    color: c.text2,
    lineHeight: 12.5 * 1.55,
    marginTop: 14,
    textAlign: "center",
  },
  memberRow: { paddingVertical: 8, gap: 8 },
  memberHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roleDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.line,
  },
  memberName: { fontWeight: "700", fontSize: 13, color: c.text, flex: 1 },
  memberRole: { fontWeight: "700", fontSize: 12, color: c.text2 },
  memberAtt: { fontSize: 12, color: c.text3 },
  chipRow: { flexDirection: "row", gap: 8, paddingLeft: 20 },
  chip: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.md,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chipActive: { backgroundColor: c.primary, borderColor: c.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: c.text2 },
  chipTextActive: { color: "#fff" },
  cpForm: { marginTop: 14, gap: 10 },
  cpFormTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: c.text3,
  },
  input: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 12,
    fontSize: 14,
    color: c.text,
    backgroundColor: c.bg,
  },
  coordRow: { flexDirection: "row", gap: 10 },
  coordInput: { flex: 1 },
  cpHint: { fontSize: 12, color: c.text3 },
  cpMap: { height: 180, borderRadius: radii.md, overflow: "hidden" },
  cpDetailMap: { height: 280, borderRadius: radii.md, overflow: "hidden" },
  // Panel titik terpilih menempel di bawah peta: nama + koordinat,
  // lalu tombol Direction dengan jarak kecil — tanpa baris kv dan
  // tanpa ruang kosong besar di antara peta dan tombol.
  cpSelected: { marginTop: 10, gap: 4 },
  cpSelectedCoords: { fontWeight: "700", fontSize: 13, color: c.text },
  cpDirectionBtn: { marginTop: 8 },
  cpError: { fontSize: 12.5, fontWeight: "700", color: c.stSosDark },
  gap14: { height: 14 },
  photosTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: c.text3,
    marginTop: 14,
    marginBottom: 6,
  },
  photosEmpty: {
    fontSize: 12.5,
    color: c.text2,
    lineHeight: 12.5 * 1.55,
  },
  btnDepart: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
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
  btnDepartPressed: {
    backgroundColor: c.primaryDark,
    transform: [{ scale: 0.985 }],
  },
  btnDepartDisabled: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
  btnDepartText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  playIcon: { width: 20, height: 20 },
  expiredNote: {
    fontSize: 12,
    color: c.text3,
    lineHeight: 12 * 1.55,
    marginTop: 9,
    textAlign: "center",
  },
});
