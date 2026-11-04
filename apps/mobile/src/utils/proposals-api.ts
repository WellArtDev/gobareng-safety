// Klien usulan gunung & jalur buatan user (antre persetujuan admin).
// Usulan TIDAK masuk katalog publik sampai admin menyetujui — layar
// wizard tidak pernah membaca usulan sebagai katalog.
import { apiRequest } from "./api-client";

export type ProposalStatus = "PENDING" | "APPROVED" | "REJECTED";

// Status usulan -> kunci i18n (dipakai layar Usulanku).
export function proposalStatusKey(status: ProposalStatus): string {
  if (status === "APPROVED") return "proposal.statusApproved";
  if (status === "REJECTED") return "proposal.statusRejected";
  return "proposal.statusPending";
}

export interface MountainProposal {
  id: string;
  name: string;
  location: string;
  lat: number;
  lon: number;
  elevationM: number | null;
  status: ProposalStatus;
  rejectReason: string | null;
  createdAt: string;
}

export interface RouteProposalCheckpoint {
  id: string;
  order: number;
  name: string;
  lat: number;
  lon: number;
  isGathering: boolean;
}

export interface RouteProposal {
  id: string;
  mountainId: string;
  name: string;
  status: ProposalStatus;
  rejectReason: string | null;
  createdAt: string;
  posts: RouteProposalCheckpoint[];
}

export async function submitMountainProposal(input: {
  name: string;
  location: string;
  lat: number;
  lon: number;
  elevationM: number | null;
}): Promise<MountainProposal> {
  const data = await apiRequest<{ proposal: MountainProposal }>("/mountains/proposals", {
    method: "POST",
    body: input,
  });
  return data.proposal;
}

export async function submitRouteProposal(
  mountainId: string,
  input: {
    name: string;
    checkpoints: { name: string; lat: number; lon: number; isGathering: boolean }[];
  },
): Promise<RouteProposal> {
  const data = await apiRequest<{ proposal: RouteProposal }>(
    `/mountains/${mountainId}/route-proposals`,
    { method: "POST", body: input },
  );
  return data.proposal;
}

export async function fetchMyProposals(): Promise<{
  mountains: MountainProposal[];
  routes: RouteProposal[];
}> {
  return apiRequest<{ mountains: MountainProposal[]; routes: RouteProposal[] }>(
    "/mountains/proposals/mine",
  );
}
