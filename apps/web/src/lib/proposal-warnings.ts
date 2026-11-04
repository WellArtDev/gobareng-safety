// Label peringatan duplikat untuk antre usulan (dashboard admin).
// Server sudah menghitung boolean-nya (nama sama / lokasi ≤2 km dari
// katalog untuk gunung; nama jalur sama di gunung yang sama untuk
// jalur); fungsi ini hanya memetakan ke kunci i18n + menghitung
// jarak haversine untuk tooltip klien bila perlu.
export interface ProposalWarning {
	duplicateName: boolean;
	duplicateNearby: boolean;
}

export function proposalWarningKeys(w: ProposalWarning): string[] {
	const keys: string[] = [];
	if (w.duplicateName) keys.push('dashboard.proposalsWarnName');
	if (w.duplicateNearby) keys.push('dashboard.proposalsWarnNearby');
	return keys;
}

export function haversineKm(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number
): number {
	const R = 6371;
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLon = ((lon2 - lon1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(a));
}

export function normalizeProposalName(name: string): string {
	return name.trim().toLowerCase();
}
