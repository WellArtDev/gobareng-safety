// Kunci i18n untuk label peran anggota trip di layar detail trip.
// Label peran tinggal di namespace `home` (dipakai Beranda juga),
// BUKAN `tripList` — salah namespace di sini pernah membuat layar
// menampilkan kunci mentah "tripList.roleLeader" (regresi PR #162).
import type { TripRole } from "./trips-api";

export const TRIP_ROLE_LABEL_KEY: Record<TripRole, string> = {
  LEADER: "home.roleLeader",
  SWEEPER: "home.roleSweeper",
  MEDIC: "home.roleMedic",
  MEMBER: "home.roleMember",
};
