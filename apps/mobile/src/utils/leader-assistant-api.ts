// Klien AI-L — GET /trip-groups/:id/leader-assistant (LEADER saja;
// server menolak non-leader). Respons selalu membawa fakta DB;
// narasi AI null bila model belum dikonfigurasi (aiStatus eksplisit).
import { apiRequest } from "./api-client";

// Batas panggilan asisten leader (perbaikan 4 Nov 2026): layar leader
// tidak boleh menggantung pada "Loading leader dashboard…" karena
// panggilan AI menggantung — layar inti dimuat tanpa menunggu
// asisten, dan asisten sendiri dibatasi 20 detik lalu fail-soft.
export const LEADER_ASSISTANT_TIMEOUT_MS = 20_000;

export type OverdueKind = "MEETING_POINT" | "CHECKPOINT" | "SIGNAL_STALE";

export interface LeaderAssistantFacts {
  headcount: {
    total: number;
    departed: number;
    notDeparted: number;
    notDepartedUserIds: string[];
    signalStaleCount: number;
  };
  members: Array<{
    userId: string;
    name: string;
    role: string;
    attendance: string;
    signalStale: boolean;
    batteryLevel?: number;
    activeSos: boolean;
  }>;
  overdueCheckins: Array<{
    userId: string;
    name: string;
    kind: OverdueKind;
    checkpointName?: string;
  }>;
  checkpoints: Array<{
    id: string;
    name: string;
    checkedInCount: number;
    missingUserIds: string[];
  }>;
  activeSos: Array<{
    userId: string;
    name: string;
    reason: string;
    level: string;
    status: string;
  }>;
  risk: { highRisk: boolean; reasons: string[] };
}

export interface LeaderAssistant {
  summary: string | null;
  model: string | null;
  aiStatus: "OK" | "AI_NOT_CONFIGURED" | "AI_UPSTREAM_ERROR";
  facts: LeaderAssistantFacts;
}

export async function fetchLeaderAssistant(
  tripId: string,
): Promise<LeaderAssistant> {
  return apiRequest<LeaderAssistant>(
    `/trip-groups/${tripId}/leader-assistant`,
  );
}
