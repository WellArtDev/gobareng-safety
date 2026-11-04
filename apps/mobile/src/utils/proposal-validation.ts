// Validasi sisi klien untuk usulan gunung & jalur buatan user —
// cerminan 400 INVALID_PAYLOAD server (bukan pengganti validasi server).
// Mengembalikan kode error i18n (proposal.err*) atau null bila valid.

export interface MountainProposalInput {
  name: string;
  location: string;
  lat: number | null;
  lon: number | null;
  elevationM: number | null;
}

export interface RouteCheckpointInput {
  name: string;
  lat: number | null;
  lon: number | null;
  isGathering: boolean;
}

export function validateMountainProposal(
  input: MountainProposalInput,
): string | null {
  if (input.name.trim().length < 2) return "proposal.errNameRequired";
  if (input.name.trim().length > 100) return "proposal.errNameTooLong";
  if (input.location.trim().length < 2) return "proposal.errLocationRequired";
  if (input.lat === null || input.lon === null) return "proposal.errCoordRequired";
  if (input.lat < -90 || input.lat > 90 || input.lon < -180 || input.lon > 180) {
    return "proposal.errCoordRange";
  }
  if (
    input.elevationM !== null &&
    (!Number.isInteger(input.elevationM) || input.elevationM <= 0)
  ) {
    return "proposal.errElevation";
  }
  return null;
}

export function validateRouteProposal(
  name: string,
  checkpoints: RouteCheckpointInput[],
): string | null {
  if (name.trim().length < 2) return "proposal.errRouteNameRequired";
  if (name.trim().length > 100) return "proposal.errNameTooLong";
  if (checkpoints.length < 1) return "proposal.errCheckpointMin";
  if (checkpoints.length > 30) return "proposal.errCheckpointMax";
  for (const c of checkpoints) {
    if (c.name.trim().length < 2) return "proposal.errCheckpointNameRequired";
    if (c.lat === null || c.lon === null) return "proposal.errCoordRequired";
    if (c.lat < -90 || c.lat > 90 || c.lon < -180 || c.lon > 180) {
      return "proposal.errCoordRange";
    }
  }
  // Aturan keras: checkpoint PERTAMA harus titik kumpul awal di kaki
  // gunung. Tanpa ini usulan tidak boleh dikirim.
  if (!checkpoints[0].isGathering) return "proposal.errGatheringRequired";
  return null;
}
