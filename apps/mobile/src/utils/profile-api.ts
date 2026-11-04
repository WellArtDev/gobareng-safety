// Klien profil — GET/PATCH /auth/me, POST /auth/me/avatar. Bentuk
// MeUser = publicUser server (User tanpa passwordHash). Ganti kata sandi
// dihapus (OTP passwordless). Upload avatar = multipart field "avatar"
// (pola organizer-application: apiRequest JSON-only, jadi fetch langsung
// + token); server mengembalikan user lengkap termasuk avatarUrl baru.
import { apiRequest } from "./api-client";
import { ApiError } from "./auth-api";
import { apiV1 } from "./config";
import { getSessionToken } from "./session-token";

export interface MeUser {
  id: string;
  email: string;
  name: string;
  slug: string;
  phone: string | null;
  country: string | null;
  address: string | null;
  isAdmin: boolean;
  role: string;
  isVerified: boolean;
  avatarUrl: string | null;
  // Verifikasi akun dua kanal (TERPISAH dari isVerified organizer).
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  accountVerifiedAt: string | null;
}

export async function fetchMe(): Promise<MeUser> {
  const data = await apiRequest<{ user: MeUser }>("/auth/me");
  return data.user;
}

// Rekening organizer (PR rekening-organizer): sengaja BUKAN bagian
// MeUser — server tidak pernah mengirim rekening lewat GET /me
// (publicUser dipakai daftar member trip). Dibaca lewat endpoint
// khusus milik sendiri, dan ditampilkan hanya di paid-join untuk
// member trip berbayar yang sudah gabung.
export interface BankDetails {
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
}

export async function fetchMyBankDetails(): Promise<BankDetails | null> {
  const data = await apiRequest<{ bankDetails: BankDetails | null }>(
    "/auth/me/bank-details",
  );
  return data.bankDetails;
}

export async function updateMe(payload: {
  name?: string;
  phone?: string;
  country?: string | null;
  address?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
}): Promise<MeUser> {
  const data = await apiRequest<{ user: MeUser }>("/auth/me", {
    method: "PATCH",
    body: payload,
  });
  return data.user;
}

// Validasi sisi klien (cerminan server: nama < 2 karakter diam-diam
// diabaikan PATCH /me — lebih baik ditolak di layar daripada simpan
// yang seolah berhasil tapi tidak berubah).
export function validateProfileName(name: string): string | null {
  if (name.trim().length < 2) return "profile.editErrors.nameRequired";
  return null;
}

// Validasi No HP untuk form "Isi Data Profil" — cerminan aturan server
// di PATCH /me: kosong = boleh (tidak diisi), selain itu spasi/dash
// diabaikan lalu harus cocok +?digit 9-15. Berbeda dengan server yang
// diam-diam menyimpan null untuk nomor tak valid, klien MENOLAK dengan
// pesan error supaya pengguna tidak mengira nomornya tersimpan.
export function validateProfilePhone(phone: string): string | null {
  const norm = phone.replace(/[\s-]/g, "");
  if (!norm) return null;
  return /^\+?\d{9,15}$/.test(norm)
    ? null
    : "profile.dataErrors.phoneInvalid";
}

export interface ProfileDataInput {
  name: string;
  address: string;
  phone: string;
  country: string | null;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
}

// Satu pintu validasi form "Isi Data Profil": nama dulu, lalu No HP.
export function validateProfileData(input: ProfileDataInput): string | null {
  return (
    validateProfileName(input.name) ??
    validateProfilePhone(input.phone) ??
    validateBankDetails({
      bankName: input.bankName ?? "",
      bankAccountNumber: input.bankAccountNumber ?? "",
      bankAccountHolder: input.bankAccountHolder ?? "",
    })
  );
}

// Validasi rekening organizer — cerminan aturan server di PATCH /me:
// ketiganya kosong = boleh (tidak mengubah rekening); sebagian saja =
// bankIncomplete; nomor harus 6-20 digit (spasi/dash diabaikan).
export interface BankDetailsInput {
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
}

export function validateBankDetails(input: BankDetailsInput): string | null {
  const name = input.bankName.trim();
  const number = input.bankAccountNumber.replace(/[\s-]/g, "");
  const holder = input.bankAccountHolder.trim();
  if (!name && !number && !holder) return null;
  if (!name || !number || !holder) {
    return "profile.dataErrors.bankIncomplete";
  }
  if (!/^\d{6,20}$/.test(number)) {
    return "profile.dataErrors.bankAccountInvalid";
  }
  return null;
}

// Payload PATCH /me untuk form "Isi Data Profil". String kosong dipakai
// sebagai sinyal hapus karena server hanya memproses string untuk
// telepon/alamat (null diabaikan), sementara negara dihapus via null
// (server memang menangani country === null sebagai hapus).
// Rekening hanya ikut terkirim bila layar berhasil memuatnya (bankLoaded):
// bila pemuatan rekening gagal, kunci rekening dihilangkan dari payload
// supaya PATCH tidak menghapus rekening yang sudah tersimpan — server
// mengartikan "tidak ada kunci rekening" sebagai "rekening tak berubah".
export function profileDataPayload(input: ProfileDataInput): {
  name: string;
  phone: string;
  address: string;
  country: string | null;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
} {
  const base = {
    name: input.name.trim(),
    phone: input.phone.replace(/[\s-]/g, ""),
    address: input.address.trim(),
    country: input.country,
  };
  const bankTouched =
    input.bankName !== undefined ||
    input.bankAccountNumber !== undefined ||
    input.bankAccountHolder !== undefined;
  if (!bankTouched) return base;
  return {
    ...base,
    bankName: (input.bankName ?? "").trim(),
    bankAccountNumber: (input.bankAccountNumber ?? "").replace(/[\s-]/g, ""),
    bankAccountHolder: (input.bankAccountHolder ?? "").trim(),
  };
}

export interface AvatarFile {
  uri: string;
  name: string;
  type: string;
}

const AVATAR_ERROR_CODE_TO_I18N: Record<string, string> = {
  UNAUTHORIZED: "errors.unauthorized",
  INVALID_IMAGE: "profile.avatarErrors.invalidImage",
};

export async function uploadAvatar(file: AvatarFile): Promise<MeUser> {
  const form = new FormData();
  form.append("avatar", {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
  const token = getSessionToken();
  let res: Response;
  try {
    res = await fetch(apiV1("/auth/me/avatar"), {
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
      typeof json === "object" &&
      json !== null &&
      typeof (json as { error?: { code?: unknown } }).error?.code === "string"
        ? (json as { error: { code: string } }).error.code
        : null;
    throw new ApiError(
      (code && AVATAR_ERROR_CODE_TO_I18N[code]) || "errors.invalidPayload",
      code ?? undefined,
    );
  }
  return (json as { data: { user: MeUser } }).data.user;
}
