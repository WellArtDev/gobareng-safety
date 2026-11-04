// Pembagian daftar trip untuk menu Trip (keputusan Wella 28 Okt 2026):
// tab Trip = daftar kartu trip diikuti + selesai; tracking dibuka dari
// detail trip, bukan langsung dari nav.
import type { Trip } from "./trips-api";

export interface TripListSplit {
  ongoing: Trip[];
  finished: Trip[];
}

export function splitTripList(trips: Trip[]): TripListSplit {
  const ongoing = [
    ...trips.filter((t) => t.status === "ACTIVE"),
    ...trips.filter((t) => t.status === "PLANNED"),
  ];
  const finished = trips
    .filter((t) => t.status === "CLOSED")
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  return { ongoing, finished };
}
