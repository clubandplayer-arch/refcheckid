import type { ManagerPhotoState, OfficialPhotoStatus } from "./official-photo-service";

export interface PhotoStateViewModel {
  readonly label: string;
  readonly tone: "neutral" | "warning" | "success" | "danger";
  readonly primaryUrl: string | null;
  readonly secondaryUrl: string | null;
}

export function toPhotoStateViewModel(state: ManagerPhotoState): PhotoStateViewModel {
  const viewModels = {
    missing: { label: "Missing", tone: "neutral", primaryUrl: null, secondaryUrl: null },
    pending: { label: "Pending", tone: "warning", primaryUrl: state.currentPhotoUrl, secondaryUrl: state.proposedPhotoUrl },
    active: { label: "Active", tone: "success", primaryUrl: state.currentPhotoUrl, secondaryUrl: null },
    rejected: { label: "Rejected", tone: "danger", primaryUrl: state.currentPhotoUrl, secondaryUrl: state.proposedPhotoUrl },
    suspended: { label: "Suspended", tone: "danger", primaryUrl: state.currentPhotoUrl, secondaryUrl: null },
  } satisfies Record<OfficialPhotoStatus, PhotoStateViewModel>;
  return viewModels[state.status];
}
