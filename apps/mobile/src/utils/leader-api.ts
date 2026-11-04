// Klien dashboard leader — kontrak §2 attendance-summary (LEADER) +
// safety-score.
import { apiRequest } from "./api-client";

export interface AttendanceSummary {
  total: number;
  departed: number;
  notDeparted: number;
}

export interface SafetyScore {
  score: number;
  staleMembers: number;
  activeSos: number;
}

export async function fetchAttendanceSummary(
  tripId: string,
): Promise<AttendanceSummary> {
  return apiRequest<AttendanceSummary>(
    `/trip-groups/${tripId}/attendance-summary`,
  );
}

export async function fetchSafetyScore(tripId: string): Promise<SafetyScore> {
  return apiRequest<SafetyScore>(`/trip-groups/${tripId}/safety-score`);
}
