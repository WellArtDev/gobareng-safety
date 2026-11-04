// Helper halaman publik INVITE + SHARE (2 Nov 2026) — murni, dites
// unit. Tidak ada data privat di sini: resolve undangan hanya membawa
// nomor leader BILA kuota penuh (perintah pengguna), dan halaman
// pantau hanya memakai payload publik yang memang sudah dipangkas API
// (nama anggota saja, tanpa email/HP).
import type { Location, SosAlert, TripPosition, TripStatus, TripType } from './types';

// Kunci sessionStorage untuk undangan yang menunggu login: pengunjung
// yang belum login menekan "Masuk dengan OTP" di /undang, lalu setelah
// OTP sukses di / diarahkan kembali ke /undang/{token}.
export const PENDING_INVITE_KEY = 'gobareng-pending-invite';

export interface InviteResolve {
	invite: { id: string; label: string; token: string };
	trip: {
		id: string;
		name: string;
		type: TripType;
		date: string;
		meetingPoint: string;
		destination: string | null;
		status: TripStatus;
		price: number | null;
	};
	quota: number | null;
	memberCount: number;
	usable: boolean;
	leaderPhone: string | null;
}

export interface SharedTripView {
	trip: { id: string; name: string; type: TripType; status: TripStatus };
	scope: 'ANYONE' | 'EMERGENCY_CONTACT';
	locations: Location[];
	positions: TripPosition[];
	activeSos: SosAlert[];
	status: 'SAFE' | 'SOS_ACTIVE';
}

// Undangan berlaku SAMPAI TRIP DIMULAI: hanya PLANNED yang usable.
// ACTIVE -> TRIP_STARTED, CLOSED -> TRIP_CLOSED (server menolak join).
export function isInviteUsable(status: TripStatus): boolean {
	return status === 'PLANNED';
}

// Halaman /pantau hanya melayani share-link ANYONE. Token
// EMERGENCY_CONTACT tetap app-only: halaman menampilkannya sebagai
// tidak ditemukan (semantik EC tidak dilonggarkan).
export function isPantauScopeAllowed(scope: string): boolean {
	return scope === 'ANYONE';
}

// Pill hero "anggota terpantau": hanya anggota yang benar-benar punya
// posisi terakhir (location !== null). Anggota tanpa posisi tidak
// dihitung — mereka tampil di kartu dengan status belum ada posisi.
export function trackedMemberCount(view: SharedTripView): number {
	return view.positions.filter((p) => p.location !== null).length;
}

// Kuota penuh = anggota sudah join >= kuota. Kuota null = tanpa batas.
export function isQuotaFull(
	quota: number | null | undefined,
	memberCount: number
): boolean {
	if (quota === null || quota === undefined) return false;
	return memberCount >= quota;
}

// Bersihkan nomor HP untuk wa.me: buang spasi/dash/+, sisakan digit.
// Bukan digit (atau kosong) -> null, supaya halaman tidak pernah
// menampilkan link WhatsApp rusak. Tidak ada konversi 0 -> 62: nomor
// yang tersimpan tanpa kode negara memang tidak akan resolve di wa.me,
// dan itu dilaporkan apa adanya di PR.
export function waLeaderUrl(phone: string | null | undefined): string | null {
	if (!phone) return null;
	const cleaned = phone.replace(/[\s\-+]/g, '');
	if (!cleaned || !/^\d+$/.test(cleaned)) return null;
	return `https://wa.me/${cleaned}`;
}
