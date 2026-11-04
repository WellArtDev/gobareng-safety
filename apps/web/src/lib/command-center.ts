// Command-center policy helpers (CC-1..CC-3, keputusan Wella 28 Okt
// 2026) + beacon kerangka types. The full beacon build and the
// LoRa/Meshtastic hardware are ON HOLD — only the data shapes and the
// device-code validation live here, no API calls.
import type { DashboardRole } from './types';

/** CC-3: only dashboard roles (admin, command_center) may open /safety. */
export function canOpenCommandCenter(me: { role: DashboardRole } | null): boolean {
	return me !== null && (me.role === 'admin' || me.role === 'command_center');
}

// ---- Beacon kerangka (struktur data saja; implementasi DITAHAN) ----

/** Device codes follow the safety-design format BCN-XXX-00. */
const BEACON_CODE = /^BCN-[A-Z0-9]{2,4}-\d{2}$/;

export function isBeaconCode(code: string): boolean {
	return BEACON_CODE.test(code);
}

export type BeaconStatus = 'OK' | 'PANIC' | 'OFF';

export interface Beacon {
	code: string;
	tripId: string;
	holderName: string;
	batteryLevel: number;
	status: BeaconStatus;
	lastSeen: string | null;
}

export type BeaconEventKind =
	| 'PANIC'
	| 'CHECKIN'
	| 'LOW_BATTERY'
	| 'REGISTERED'
	| 'SOS_CLOSED'
	| 'SIGNAL_LOST';

export interface BeaconEvent {
	kind: BeaconEventKind;
	code: string;
	tripId: string;
	actorName: string;
	ts: string;
}
