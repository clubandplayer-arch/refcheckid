export type MatchSheetStatus = "draft" | "submitted" | "locked";

export interface ManagerDashboard {
  nextMatch: {
    id: string;
    opponent: string;
    scheduledAt: string;
    venue: string;
  } | null;
  matchSheetStatus: MatchSheetStatus;
  notifications: readonly string[];
}

export interface PlayerListItem {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  warning: boolean;
  suspended: boolean;
  selected: boolean;
  shirtNumber: number | null;
  role: "goalkeeper" | "captain" | "vice_captain" | "reserve" | "player";
}

export interface StaffListItem {
  id: string;
  fullName: string;
  role: string;
  selected: boolean;
}
