// Layar SOS Suara (AI-V) — rekam suara -> transkripsi server ->
// review (transkrip + alasan terdeteksi + lokasi, alasan bisa diganti)
// -> konfirmasi ganda -> SOS trip (bila ada trip ACTIVE) atau SOS umum.
// Rekaman: expo-audio (native + web); dibaca base64 lewat
// expo-file-system/legacy untuk dikirim ke POST /voice-sos/transcribe.
// Bila server balas 503 STT_NOT_CONFIGURED, layar menampilkan state
// itu apa adanya — tidak pernah menampilkan transkrip karangan.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
} from "expo-audio";
import { readAsStringAsync } from "expo-file-system/legacy";

import { useTranslation } from "@/i18n";
import { radii, type ThemeColors } from "@/theme/tokens";
import { useThemedStyles } from "@/theme";
import { ApiError } from "@/utils/auth-api";
import { createHoldToConfirm, holdProgress } from "@/utils/hold-to-confirm";
import { getCurrentPosition, type GeoPoint } from "@/utils/geo";
import { acquireSosPosition } from "@/utils/sos-location";
import {
  MAX_AUDIO_BASE64_LEN,
  MAX_RECORD_MS,
  TRANSCRIBE_TIMEOUT_MS,
} from "@/utils/voice-sos-limits";
import { getSessionName } from "@/utils/session-token";
import { fetchMyTrips, type Trip } from "@/utils/trips-api";
import {
  confirmVoiceSos,
  transcribeVoiceSos,
  type VoiceTranscription,
} from "@/utils/voice-sos-api";
import {
  GENERAL_SOS_REASONS,
  generalReasonLabelKey,
  reasonLabelKey,
  reasonsForTripType,
  type GeneralSosReason,
  type SosReason,
} from "@/utils/sos-logic";
import {
  buttonAccessibility,
  decorativeAccessibility,
  headingAccessibility,
} from "@/utils/accessibility";

type Phase = "record" | "transcribing" | "review" | "sending";
type VoiceReason = SosReason | GeneralSosReason;

const MIME_BY_EXT: Record<string, string> = {
  m4a: "audio/m4a",
  mp4: "audio/mp4",
  webm: "audio/webm",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
};

// MIME + batas diimpor dari modul murni (voice-sos-limits) supaya
// layar tetap tipis dan batas bisa di-guard test unit.

function mimeFromUri(uri: string): string {
  const ext = uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "audio/m4a";
}

export function SosVoiceScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [position, setPosition] = useState<GeoPoint | null>(null);
  const [phase, setPhase] = useState<Phase>("record");
  const [recording, setRecording] = useState(false);
  const [transcription, setTranscription] = useState<VoiceTranscription | null>(null);
  const [reason, setReason] = useState<VoiceReason | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [locState, setLocState] = useState<
    "locating" | "ready" | "unavailable"
  >("locating");
  const [sending, setSending] = useState(false);
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const hold = useRef(createHoldToConfirm());
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartedAt = useRef(0);
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Batas rekaman: cegah file raksasa (base64 ~4/3 ukuran biner).
  const recordStartedAt = useRef(0);

  // Lokasi diminta eksplisit saat layar dibuka DAN bisa diminta ulang
  // lewat tombol: pola sama seperti sos-general-confirm.
  const acquireLocation = useCallback(async () => {
    setLocState("locating");
    const out = await acquireSosPosition(getCurrentPosition);
    setPosition(out.position);
    setLocState(out.status);
  }, []);

  const load = useCallback(async () => {
    try {
      const trips = await fetchMyTrips();
      setTrip(trips.find((item) => item.status === "ACTIVE") ?? null);
    } catch {
      // Tanpa trip = jalur SOS umum; bukan error layar.
    }
    void acquireLocation();
  }, [acquireLocation]);

  useEffect(() => {
    load();
    return () => {
      hold.current.release();
      if (progressTimer.current) clearInterval(progressTimer.current);
      if (recordTimer.current) clearTimeout(recordTimer.current);
    };
  }, [load]);

  const startRecording = async () => {
    setErrorKey(null);
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setErrorKey("sos.voice.errors.permissionDenied");
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      recordStartedAt.current = Date.now();
      // Hentikan otomatis di batas durasi supaya file tidak raksasa.
      if (recordTimer.current) clearTimeout(recordTimer.current);
      recordTimer.current = setTimeout(() => {
        void stopAndTranscribe();
      }, MAX_RECORD_MS);
    } catch {
      setErrorKey("sos.voice.errors.recordFailed");
    }
  };

  const stopAndTranscribe = async () => {
    if (!recording && phase !== "record") return;
    if (recordTimer.current) {
      clearTimeout(recordTimer.current);
      recordTimer.current = null;
    }
    setRecording(false);
    setPhase("transcribing");
    setErrorKey(null);
    // Abort transkripsi yang menggantung: jangan kunci layar selamanya.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("no-uri");
      const audioBase64 = await readAsStringAsync(uri, { encoding: "base64" });
      if (!audioBase64) {
        setErrorKey("sos.voice.errors.noAudio");
        setPhase("record");
        return;
      }
      if (audioBase64.length > MAX_AUDIO_BASE64_LEN) {
        setErrorKey("sos.voice.errors.invalidAudio");
        setPhase("record");
        return;
      }
      const out = await transcribeVoiceSos(
        {
          audioBase64,
          mimeType: mimeFromUri(uri),
          kind: trip ? "trip" : "general",
          tripType: trip ? trip.type : undefined,
        },
        controller.signal,
      );
      setTranscription(out);
      setReason(out.detectedReason);
      setPhase("review");
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.i18nKey : "sos.voice.errors.transcribeFailed",
      );
      setPhase("record");
    } finally {
      clearTimeout(timeout);
    }
  };

  const recordAgain = () => {
    hold.current.reset();
    setHolding(false);
    setProgress(0);
    setTranscription(null);
    setReason(null);
    setErrorKey(null);
    setPhase("record");
  };

  const stopProgress = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  };

  // Tekan-tahan 3 detik (pola sos-general-confirm): lepas sebelum
  // 3 detik = batal, tidak terkirim.
  const startHold = () => {
    if (!reason || sending || hold.current.isHolding()) return;
    if (!position) {
      setErrorKey("sos.voice.errors.noLocation");
      return;
    }
    holdStartedAt.current = Date.now();
    setHolding(true);
    setProgress(0);
    hold.current.press(() => {
      stopProgress();
      setHolding(false);
      setProgress(1);
      void sendNow();
    });
    progressTimer.current = setInterval(() => {
      setProgress(holdProgress(Date.now() - holdStartedAt.current));
    }, 50);
  };

  const endHold = () => {
    if (hold.current.hasFired()) return;
    hold.current.release();
    stopProgress();
    setHolding(false);
    setProgress(0);
  };

  const sendNow = async () => {
    if (!reason || sending) return;
    if (!position) {
      setErrorKey("sos.voice.errors.noLocation");
      return;
    }
    setSending(true);
    setPhase("sending");
    try {
      const result = await confirmVoiceSos({
        reason,
        lat: position.lat,
        lon: position.lon,
        tripId: trip ? trip.id : undefined,
      });
      if (result.kind === "trip" && trip) {
        router.replace({
          pathname: "/sos-sent",
          params: { tripId: trip.id, reason: result.sos.reason },
        });
      } else {
        router.replace({
          pathname: "/sos-general-detail",
          params: { id: result.sos.id },
        });
      }
    } catch (error) {
      setErrorKey(error instanceof ApiError ? error.i18nKey : "errors.unavailable");
      setPhase("review");
    } finally {
      setSending(false);
    }
  };

  const reasonOptions: VoiceReason[] = trip
    ? reasonsForTripType(trip.type)
    : [...GENERAL_SOS_REASONS];
  const reasonLabel = (item: VoiceReason): string =>
    trip
      ? t(reasonLabelKey(item as SosReason))
      : t(generalReasonLabelKey(item as GeneralSosReason));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          {...buttonAccessibility(t("sos.general.confirm.backLabel"))}
        >
          <Text style={styles.backGlyph} {...decorativeAccessibility}>‹</Text>
        </Pressable>
        <Text style={styles.headTitle} {...headingAccessibility(t("sos.voice.title"))}>
          {t("sos.voice.title")}
        </Text>
        <Text style={styles.headSub}>{t("sos.voice.subtitle")}</Text>
      </View>

      <View style={styles.body}>
        {errorKey ? (
          <View style={styles.errBox}>
            <Text style={styles.errText}>{t(errorKey)}</Text>
          </View>
        ) : null}

        <View style={styles.note}>
          <Text style={styles.noteText}>
            {trip ? t("sos.voice.tripNote") : t("sos.voice.noTripNote")}
          </Text>
        </View>

        {phase === "record" ? (
          <>
            <Pressable
              style={[styles.recordBtn, recording && styles.recordBtnLive]}
              onPress={recording ? stopAndTranscribe : startRecording}
              {...buttonAccessibility(
                recording ? t("sos.voice.stop") : t("sos.voice.record"),
              )}
            >
              <Text style={styles.recordBtnText}>
                {recording ? t("sos.voice.stop") : t("sos.voice.record")}
              </Text>
            </Pressable>
            {recording ? (
              <Text style={styles.statusText}>{t("sos.voice.recording")}</Text>
            ) : null}
          </>
        ) : null}

        {phase === "transcribing" ? (
          <View style={styles.loading}>
            <ActivityIndicator />
            <Text style={styles.statusText}>{t("sos.voice.transcribing")}</Text>
          </View>
        ) : null}

        {phase === "review" || phase === "sending" ? (
          <>
            <Text style={styles.label}>{t("sos.voice.transcriptLabel")}</Text>
            <Text style={styles.value}>{transcription?.transcript ?? "-"}</Text>
            {transcription?.model ? (
              <Text style={styles.attribution}>{t("sos.voice.attribution")}</Text>
            ) : null}

            <Text style={styles.label}>{t("sos.voice.detectedReasonLabel")}</Text>
            <Text style={styles.value}>
              {reason ? reasonLabel(reason) : "-"}
            </Text>

            <Text style={styles.label}>{t("sos.voice.changeReason")}</Text>
            {reasonOptions.map((item) => {
              const selected = reason === item;
              return (
                <Pressable
                  key={item}
                  style={[styles.reason, selected && styles.reasonSel]}
                  onPress={() => setReason(item)}
                  {...buttonAccessibility(reasonLabel(item))}
                >
                  <Text style={styles.reasonText}>{reasonLabel(item)}</Text>
                </Pressable>
              );
            })}

            <Text style={styles.label}>{t("sos.voice.locationLabel")}</Text>
            <Text style={styles.value}>
              {locState === "locating"
                ? t("sos.general.confirm.locating")
                : position
                  ? `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}`
                  : t("sos.voice.locationUnknown")}
            </Text>
            {locState === "unavailable" ? (
              <Pressable
                style={styles.locRetry}
                onPress={() => void acquireLocation()}
                {...buttonAccessibility(t("sos.general.confirm.requestLocation"))}
              >
                <Text style={styles.locRetryText}>
                  📍 {t("sos.general.confirm.requestLocation")}
                </Text>
              </Pressable>
            ) : null}

            <Text style={styles.label}>{t("sos.general.confirm.sender")}</Text>
            <Text style={styles.value}>{getSessionName() ?? "-"}</Text>

            <Text style={styles.label}>{t("sos.general.confirm.sentTo")}</Text>
            <Text style={styles.value}>
              {trip ? t("sos.voice.sentToTrip") : t("sos.voice.sentToGeneral")}
            </Text>

            <Text style={styles.holdHint}>{t("sos.voice.holdHint")}</Text>

            <Pressable
              style={[
                styles.sendBtn,
                sending && styles.sendBtnDisabled,
                holding && styles.sendBtnHolding,
              ]}
              onPressIn={startHold}
              onPressOut={endHold}
              disabled={sending}
              {...buttonAccessibility(t("sos.voice.confirm"), {
                disabled: sending,
              })}
            >
              <Text style={styles.sendBtnText}>{t("sos.voice.confirm")}</Text>
            </Pressable>
            <View style={styles.progressTrack} {...decorativeAccessibility}>
              <View
                style={[styles.progressFill, { width: `${progress * 100}%` }]}
              />
            </View>
            <Pressable
              style={styles.secondaryBtn}
              onPress={recordAgain}
              {...buttonAccessibility(t("sos.voice.changeAudio"))}
            >
              <Text style={styles.secondaryBtnText}>{t("sos.voice.changeAudio")}</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { paddingBottom: 26 },
    head: {
      backgroundColor: c.stSosDark,
      paddingTop: 16,
      paddingHorizontal: 20,
      paddingBottom: 20,
    },
    back: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: "rgba(255,255,255,.16)",
      alignItems: "center",
      justifyContent: "center",
    },
    backGlyph: { color: "#fff", fontSize: 26, lineHeight: 30 },
    headTitle: { color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 12 },
    headSub: { color: "rgba(255,255,255,.85)", fontSize: 14, marginTop: 6 },
    body: { padding: 20, gap: 12 },
    errBox: {
      backgroundColor: c.errBg,
      borderRadius: radii.md,
      padding: 12,
    },
    errText: { color: c.danger, fontSize: 14 },
    note: {
      backgroundColor: c.surface,
      borderRadius: radii.md,
      padding: 12,
    },
    noteText: { color: c.text, fontSize: 14 },
    recordBtn: {
      backgroundColor: c.stSosDark,
      borderRadius: radii.lg,
      paddingVertical: 18,
      alignItems: "center",
    },
    recordBtnLive: { backgroundColor: "#b42318" },
    recordBtnText: { color: "#fff", fontSize: 17, fontWeight: "800" },
    statusText: { color: c.text2, fontSize: 14, textAlign: "center" },
    loading: { alignItems: "center", gap: 10, paddingVertical: 20 },
    label: { color: c.text2, fontSize: 12, fontWeight: "700", marginTop: 8 },
    value: { color: c.text, fontSize: 16 },
    attribution: { color: c.text2, fontSize: 12, fontStyle: "italic" },
    reason: {
      backgroundColor: c.surface,
      borderRadius: radii.md,
      padding: 14,
      borderWidth: 1,
      borderColor: c.line,
    },
    reasonSel: { borderColor: c.stSosDark, borderWidth: 2 },
    reasonText: { color: c.text, fontSize: 15 },
    sendBtn: {
      backgroundColor: "#b42318",
      borderRadius: radii.lg,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 8,
    },
    sendBtnDisabled: { opacity: 0.5 },
    sendBtnHolding: { backgroundColor: c.stSosDark },
    sendBtnText: { color: "#fff", fontSize: 17, fontWeight: "800" },
    holdHint: {
      color: c.stSosDark,
      fontSize: 13,
      fontWeight: "800",
      marginTop: 16,
      textAlign: "center",
    },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.text3,
      opacity: 0.25,
      marginTop: 12,
      overflow: "hidden",
    },
    progressFill: { height: 6, backgroundColor: c.stSosDark },
    locRetry: { marginTop: 8, alignSelf: "flex-start" },
    locRetryText: { fontSize: 13, fontWeight: "800", color: c.primary },
    secondaryBtn: {
      borderRadius: radii.lg,
      paddingVertical: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.line,
    },
    secondaryBtnText: { color: c.text, fontSize: 15, fontWeight: "700" },
  });
