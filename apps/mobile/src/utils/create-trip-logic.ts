// Logika buat trip — validasi form (aturan kuota kontrak §2), fee Pro
// 5% (mockup: "Fee platform 5% dipotong dari harga"), format rupiah.
const MIN_QUOTA = 2;
const PLATFORM_FEE_RATE = 0.05;

export interface CreateTripInput {
  name: string;
  date: string;
  time: string;
  meetingPoint: string;
  quota: number;
  // Touring wajib punya tujuan (dipilih lewat peta + search).
  tripType?: "HIKING" | "TOURING";
  destination?: string;
}

export function validateCreateTrip(input: CreateTripInput): string | null {
  if (!input.name.trim()) return "create.errors.nameRequired";
  if (!input.date || !input.time) return "create.errors.dateRequired";
  if (!input.meetingPoint.trim()) return "create.errors.meetRequired";
  if (input.tripType === "TOURING" && !input.destination?.trim()) {
    return "create.errors.destinationRequired";
  }
  if (!Number.isInteger(input.quota) || input.quota < MIN_QUOTA) {
    return "create.errors.quotaInvalid";
  }
  return null;
}

// Body POST /trip-groups yang disusun layar ringkasan buat trip.
// Aturan kirim (cerminan submit() create-summary.tsx): koordinat hanya
// sepasang angka valid; destinasi hanya touring; tautan rute
// (mountainId/routeId) hanya hiking — touring yang membawa field rute
// ditolak API 400 (akar bug #191, ditegakkan PR #193).
export interface CreateTripBodyInput {
  name: string;
  tripType: "HIKING" | "TOURING";
  date: string;
  time: string;
  meetingPoint: string;
  quota: number;
  meetLat?: string;
  meetLon?: string;
  destination?: string;
  destinationLat?: string;
  destinationLon?: string;
  mountainId?: string;
  routeId?: string;
}

export function buildCreateTripBody(
  input: CreateTripBodyInput,
): Record<string, unknown> {
  const isTouring = input.tripType === "TOURING";
  const coord = (v: string | undefined): number | null => {
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const meetLat = coord(input.meetLat);
  const meetLon = coord(input.meetLon);
  const destLat = coord(input.destinationLat);
  const destLon = coord(input.destinationLon);
  const body: Record<string, unknown> = {
    name: input.name,
    type: isTouring ? "TOURING" : "HIKING",
    date: `${input.date} ${input.time}`,
    meetingPoint: input.meetingPoint,
    quota: input.quota,
    isOpenTrip: false,
  };
  if (meetLat !== null && meetLon !== null) {
    body.meetingLat = meetLat;
    body.meetingLon = meetLon;
  }
  if (isTouring) {
    body.destination = input.destination;
    if (destLat !== null && destLon !== null) {
      body.destinationLat = destLat;
      body.destinationLon = destLon;
    }
  } else {
    if (input.mountainId) body.mountainId = input.mountainId;
    if (input.routeId) body.routeId = input.routeId;
  }
  return body;
}

export interface PaidSplit {
  price: number;
  fee: number;
  net: number;
}

export function calculatePaidSplit(price: number): PaidSplit {
  const fee = Math.round(price * PLATFORM_FEE_RATE);
  return { price, fee, net: price - fee };
}

export function formatRupiah(amount: number): string {
  return `Rp${amount.toLocaleString("de-DE")}`;
}
