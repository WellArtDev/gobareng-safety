// Klien SOS — kontrak §4: trigger {reason, lat, lon} -> auto-level +
// broadcast; maks 1 SOS aktif per user per trip (409 SOS_ALREADY_ACTIVE).
import { apiRequest } from "./api-client";
import { ApiError } from "./auth-api";
import { apiV1 } from "./config";
import { getSessionToken } from "./session-token";
import type { GeneralSosReason, SosLevel, SosReason } from "./sos-logic";
import type { SosStatus } from "./locations-api";

export interface TriggeredSos {
  id: string;
  status: SosStatus;
  userId: string;
  reason: SosReason;
  level: SosLevel;
}

export interface SosPayload {
  reason: SosReason;
  lat: number;
  lon: number;
}

const SOS_ERROR_KEYS: Record<string, string> = {
  SOS_ALREADY_ACTIVE: "sos.errors.alreadyActive",
  INVALID_SOS_REASON: "sos.errors.invalidReason",
  SOS_REASON_INVALID_FOR_TRIP_TYPE: "sos.errors.invalidReason",
};

export async function triggerSos(
  tripId: string,
  payload: SosPayload,
): Promise<TriggeredSos> {
  try {
    const data = await apiRequest<{ sos: TriggeredSos }>(
      `/trip-groups/${tripId}/sos`,
      { method: "POST", body: payload },
    );
    return data.sos;
  } catch (error) {
    if (error instanceof ApiError && error.code && SOS_ERROR_KEYS[error.code]) {
      throw new ApiError(SOS_ERROR_KEYS[error.code], error.code);
    }
    throw error;
  }
}

// ---- SOS Umum (tanpa trip) ----
export interface GeneralSosDetail {
  id: string;
  senderId: string;
  senderName: string | null;
  reason: GeneralSosReason;
  level: SosLevel;
  lat: number;
  lon: number;
  status: SosStatus;
  createdAt: string;
  responderCount: number;
  viewerResponded: boolean;
  viewerIsSender: boolean;
  distanceKm: number | null;
  // AI-P: foto SOS + deskripsi AI (opsional — SOS lama tanpa foto
  // tidak punya field ini).
  photos?: SosPhoto[];
}

// ---- AI-P: Foto SOS (trip maupun umum) ----
// Bentuk foto persis respons API: deskripsi AI null + model null bila
// vision belum tersedia (klien menampilkan "belum tersedia", bukan
// karangan); model terisi = tampilkan atribusi Muse Spark Open.
export interface SosPhoto {
  id: string;
  kind: "TRIP" | "GENERAL";
  sosId: string;
  senderId: string;
  photoUrl: string;
  aiDescription: string | null;
  model: string | null;
  aiStatus: "PENDING" | "AVAILABLE" | "UNAVAILABLE";
  createdAt: string;
}

export type SosPhotoKind = SosPhoto["kind"];

const SOS_PHOTO_ERROR_KEYS: Record<string, string> = {
  SOS_NOT_FOUND: "sos.general.errors.notFound",
  SOS_PHOTO_NOT_ALLOWED: "sos.photo.errors.notAllowed",
  INVALID_IMAGE: "sos.photo.errors.invalidImage",
};

function mapSosPhotoError(error: unknown): unknown {
  if (error instanceof ApiError && error.code && SOS_PHOTO_ERROR_KEYS[error.code]) {
    return new ApiError(SOS_PHOTO_ERROR_KEYS[error.code], error.code);
  }
  return error;
}

// Upload multipart (FormData + token, pola organizer-api — apiRequest
// JSON-only). Satu foto per request; pengirim boleh mengunggah
// beberapa foto lewat beberapa request.
export async function uploadSosPhoto(
  kind: SosPhotoKind,
  sosId: string,
  file: { uri: string; name: string; type: string },
): Promise<SosPhoto> {
  const form = new FormData();
  form.append("kind", kind);
  form.append("sosId", sosId);
  form.append("photo", {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
  const token = getSessionToken();
  let res: Response;
  try {
    res = await fetch(apiV1("/sos-photos"), {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: form,
    });
  } catch {
    throw new ApiError("errors.unavailable");
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    throw new ApiError("errors.unavailable");
  }
  if (!res.ok) {
    const code =
      typeof json === "object" && json !== null
        ? (json as { error?: { code?: unknown } }).error?.code
        : null;
    throw mapSosPhotoError(
      new ApiError(
        "errors.invalidPayload",
        typeof code === "string" ? code : undefined,
      ),
    );
  }
  return (json as { data: { photo: SosPhoto } }).data.photo;
}

export async function fetchSosPhotos(
  kind: SosPhotoKind,
  sosId: string,
): Promise<SosPhoto[]> {
  try {
    const data = await apiRequest<{ photos: SosPhoto[] }>(
      `/sos-photos/${kind}/${sosId}`,
    );
    return data.photos;
  } catch (error) {
    throw mapSosPhotoError(error);
  }
}

export async function analyzeSosPhoto(photoId: string): Promise<SosPhoto> {
  try {
    const data = await apiRequest<{ photo: SosPhoto }>(
      `/sos-photos/${photoId}/analyze`,
      { method: "POST", body: {} },
    );
    return data.photo;
  } catch (error) {
    throw mapSosPhotoError(error);
  }
}

export interface GeneralSosRecipient {
  userId: string;
  distanceKm: number;
}

const GENERAL_SOS_ERROR_KEYS: Record<string, string> = {
  GENERAL_SOS_UNVERIFIED_SENDER: "sos.general.errors.unverified",
  GENERAL_SOS_ALREADY_ACTIVE: "sos.general.errors.alreadyActive",
  GENERAL_SOS_REASON_INVALID: "sos.general.errors.invalidReason",
  INVALID_LOCATION: "sos.general.errors.invalidLocation",
  GENERAL_SOS_NOT_ALLOWED: "sos.general.errors.notAllowed",
  GENERAL_SOS_CLOSED: "sos.general.errors.closed",
  SOS_NOT_FOUND: "sos.general.errors.notFound",
  GENERAL_SOS_DAILY_LIMIT: "sos.general.errors.dailyLimit",
  GENERAL_SOS_COOLDOWN: "sos.general.errors.cooldown",
  GENERAL_SOS_ALREADY_REPORTED: "sos.general.errors.alreadyReported",
  GENERAL_SOS_REPORT_NOT_ALLOWED: "sos.general.errors.reportNotAllowed",
};

function mapGeneralSosError(error: unknown): unknown {
  if (error instanceof ApiError && error.code && GENERAL_SOS_ERROR_KEYS[error.code]) {
    return new ApiError(GENERAL_SOS_ERROR_KEYS[error.code], error.code);
  }
  return error;
}

export async function triggerGeneralSos(payload: {
  reason: GeneralSosReason;
  lat: number;
  lon: number;
}): Promise<{
  sos: GeneralSosDetail;
  recipients: GeneralSosRecipient[];
  waRecipients: string[];
}> {
  try {
    const data = await apiRequest<{
      sos: GeneralSosDetail;
      recipients: GeneralSosRecipient[];
      waRecipients: string[];
    }>("/sos-general", { method: "POST", body: payload });
    return data;
  } catch (error) {
    throw mapGeneralSosError(error);
  }
}

export async function fetchGeneralSos(id: string): Promise<GeneralSosDetail> {
  try {
    const data = await apiRequest<{ sos: GeneralSosDetail }>(`/sos-general/${id}`);
    return data.sos;
  } catch (error) {
    throw mapGeneralSosError(error);
  }
}

export async function respondGeneralSos(
  id: string,
  action: "GOING" | "IGNORE",
): Promise<GeneralSosDetail> {
  try {
    const data = await apiRequest<{ sos: GeneralSosDetail }>(
      `/sos-general/${id}/respond`,
      { method: "PATCH", body: { action } },
    );
    return data.sos;
  } catch (error) {
    throw mapGeneralSosError(error);
  }
}

export async function reportGeneralSos(id: string): Promise<void> {
  try {
    await apiRequest(`/sos-general/${id}/report`, { method: "POST" });
  } catch (error) {
    throw mapGeneralSosError(error);
  }
}

export async function cancelGeneralSos(id: string): Promise<GeneralSosDetail> {
  try {
    const data = await apiRequest<{ sos: GeneralSosDetail }>(
      `/sos-general/${id}/cancel`,
      { method: "PATCH" },
    );
    return data.sos;
  } catch (error) {
    throw mapGeneralSosError(error);
  }
}

export async function resolveGeneralSos(id: string): Promise<GeneralSosDetail> {
  try {
    const data = await apiRequest<{ sos: GeneralSosDetail }>(
      `/sos-general/${id}/resolve`,
      { method: "PATCH" },
    );
    return data.sos;
  } catch (error) {
    throw mapGeneralSosError(error);
  }
}
