// Target direction Detail Trip (QA 2 Nov 2026): sebelum check-in di
// titik kumpul, direction mengarah ke titik kumpul; setelah anggota
// check-in (attendance DEPARTED), direction berubah ke tujuan trip
// bila trip punya koordinat tujuan. Trip hiking tanpa tujuan tetap
// mengarah ke titik kumpul.
import type { Attendance, Trip } from "./trips-api";

export interface DirectionTarget {
  lat: number;
  lon: number;
  label: string;
}

export function directionTarget(
  trip: Trip,
  myAttendance: Attendance | null,
): DirectionTarget | null {
  if (
    myAttendance === "DEPARTED" &&
    trip.destinationLat !== null &&
    trip.destinationLat !== undefined &&
    trip.destinationLon !== null &&
    trip.destinationLon !== undefined
  ) {
    return {
      lat: trip.destinationLat,
      lon: trip.destinationLon,
      label: trip.destination ?? "Tujuan trip",
    };
  }
  if (trip.meetingLat === null || trip.meetingLon === null) return null;
  return { lat: trip.meetingLat, lon: trip.meetingLon, label: "Titik kumpul" };
}
