// Klien pengajuan organizer — kontrak §14 + verifikasi MANUAL.
// GET /auth/me/organizer-application (JSON, lewat apiRequest) dan
// POST multipart yang sama (FormData + token, karena apiRequest
// JSON-only). File KTP tidak pernah jadi URL publik: server hanya
// mengembalikan hasIdentityDocument, admin membukanya lewat endpoint
// dokumen bertoken di dashboard.
import { apiRequest } from "./api-client";
import { ApiError } from "./auth-api";
import { apiV1 } from "./config";
import { getSessionToken } from "./session-token";

export interface OrganizerApplication {
  id: string;
  organizerName: string | null;
  address: string | null;
  organizerType: "HIKING" | "TOURING" | null;
  region: string | null;
  hasIdentityDocument: boolean;
  identityDocumentComplete: boolean;
  profileComplete: boolean;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submittedAt: string;
}

export interface OrganizerApplicationInput {
  organizerName: string;
  address: string;
  organizerType: "HIKING" | "TOURING" | null;
  region: string | null;
}

// Validasi sisi klien (cerminan 400 INVALID_PAYLOAD server): nama +
// alamat wajib diisi, jenis hanya HIKING/TOURING bila dipilih.
export function validateOrganizerApplication(
  input: OrganizerApplicationInput,
): string | null {
  if (input.organizerName.trim().length < 2) return "profile.orgErrors.nameRequired";
  if (input.address.trim().length < 2) return "profile.orgErrors.addressRequired";
  return null;
}

export async function fetchMyOrganizerApplication(): Promise<OrganizerApplication | null> {
  const data = await apiRequest<{ application: OrganizerApplication | null }>(
    "/auth/me/organizer-application",
  );
  return data.application;
}

const ERROR_CODE_TO_I18N: Record<string, string> = {
  UNAUTHORIZED: "errors.unauthorized",
  INVALID_PAYLOAD: "errors.invalidPayload",
  INVALID_IMAGE: "profile.orgErrors.invalidImage",
};

export async function submitOrganizerApplication(
  input: OrganizerApplicationInput,
  ktp: { uri: string; name: string; type: string } | null,
): Promise<OrganizerApplication> {
  const form = new FormData();
  form.append("organizerName", input.organizerName.trim());
  form.append("address", input.address.trim());
  if (input.organizerType) form.append("organizerType", input.organizerType);
  if (input.region?.trim()) form.append("region", input.region.trim());
  if (ktp) {
    form.append("identityDocument", {
      uri: ktp.uri,
      name: ktp.name,
      type: ktp.type,
    } as unknown as Blob);
  }
  const token = getSessionToken();
  let res: Response;
  try {
    res = await fetch(apiV1("/auth/me/organizer-application"), {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
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
    throw new ApiError(
      (typeof code === "string" && ERROR_CODE_TO_I18N[code]) || "errors.invalidPayload",
      typeof code === "string" ? code : undefined,
    );
  }
  return (json as { data: { application: OrganizerApplication } }).data.application;
}
