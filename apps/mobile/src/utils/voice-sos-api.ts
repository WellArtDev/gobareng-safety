// Klien SOS suara (AI-V) — kontrak /voice-sos: transkripsi audio
// base64 -> { transcript, detectedReason, kind, model } lalu konfirmasi
// -> SOS trip (bila tripId dikirim) atau SOS umum (tanpa tripId).
// `model` hanya ada bila AI Meta yang mengklasifikasi — klien
// menampilkan atribusi "Built with Muse Spark Open" hanya dari sini.
import { apiRequest } from "./api-client";
import { ApiError } from "./auth-api";
import type { GeneralSosReason, SosLevel, SosReason } from "./sos-logic";
import type { SosStatus } from "./locations-api";

export type VoiceSosKind = "trip" | "general";

export interface VoiceTranscription {
  transcript: string;
  detectedReason: SosReason | GeneralSosReason;
  kind: VoiceSosKind;
  model: string | null;
  sttModel: string;
}

export interface VoiceSosResult {
  kind: VoiceSosKind;
  sos: {
    id: string;
    status: SosStatus;
    reason: SosReason | GeneralSosReason;
    level: SosLevel;
    tripId: string | null;
  };
  recipients?: { userId: string; distanceKm: number }[];
  waRecipients: string[];
}

const VOICE_ERROR_KEYS: Record<string, string> = {
  STT_NOT_CONFIGURED: "sos.voice.errors.sttNotConfigured",
  STT_UPSTREAM_ERROR: "sos.voice.errors.transcribeFailed",
  STT_AUDIO_INVALID: "sos.voice.errors.invalidAudio",
  STT_AUDIO_TOO_LARGE: "sos.voice.errors.invalidAudio",
  SOS_ALREADY_ACTIVE: "sos.errors.alreadyActive",
  SOS_REASON_INVALID_FOR_TRIP_TYPE: "sos.errors.invalidReason",
  NOT_TRIP_MEMBER: "errors.forbidden",
  TRIP_NOT_FOUND: "errors.notFound",
  GENERAL_SOS_UNVERIFIED_SENDER: "sos.general.errors.unverified",
  GENERAL_SOS_ALREADY_ACTIVE: "sos.general.errors.alreadyActive",
  GENERAL_SOS_REASON_INVALID: "sos.general.errors.invalidReason",
  GENERAL_SOS_DAILY_LIMIT: "sos.general.errors.dailyLimit",
  GENERAL_SOS_COOLDOWN: "sos.general.errors.cooldown",
  INVALID_LOCATION: "sos.general.errors.invalidLocation",
};

function mapVoiceError(error: unknown): unknown {
  if (error instanceof ApiError && error.code && VOICE_ERROR_KEYS[error.code]) {
    return new ApiError(VOICE_ERROR_KEYS[error.code], error.code);
  }
  return error;
}

export async function transcribeVoiceSos(
  payload: {
    audioBase64: string;
    mimeType?: string;
    kind: VoiceSosKind;
    tripType?: "HIKING" | "TOURING";
  },
  signal?: AbortSignal,
): Promise<VoiceTranscription> {
  try {
    const data = await apiRequest<VoiceTranscription>("/voice-sos/transcribe", {
      method: "POST",
      body: payload,
      signal,
    });
    return data;
  } catch (error) {
    throw mapVoiceError(error);
  }
}

export async function confirmVoiceSos(payload: {
  reason: SosReason | GeneralSosReason;
  lat: number;
  lon: number;
  tripId?: string;
}): Promise<VoiceSosResult> {
  try {
    const data = await apiRequest<VoiceSosResult>("/voice-sos/confirm", {
      method: "POST",
      body: payload,
    });
    return data;
  } catch (error) {
    throw mapVoiceError(error);
  }
}
