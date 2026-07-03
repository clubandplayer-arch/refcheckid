import { managerTeamConfig, type ManagerTeam } from "./manager-team";
import type { PhotoRequest, PhotoRequestStatus } from "./federation-types";

const photoStoreKeyPrefix = "refcheckid.managerPhotos";
const photoRequestStoreKey = "refcheckid.photoApprovalRequests";

export interface PhotoSubject {
  id: string;
  photoUrl: string | null;
}

export interface ManagerPhotoApprovalRequest extends PhotoRequest {
  subjectId: string;
  team: ManagerTeam;
}

export function saveManagerSubjectPhoto(
  team: ManagerTeam,
  subjectId: string,
  photoUrl: string,
  currentPhotoUrl: string | null = null,
  subjectName = subjectId,
): PhotoRequestStatus {
  if (typeof window === "undefined") return "approved";
  if (currentPhotoUrl) {
    upsertPendingPhotoRequest({
      clubName: managerTeamConfig[team].label,
      currentPhotoUrl,
      id: getPhotoRequestId(team, subjectId),
      playerName: subjectName,
      proposedPhotoUrl: photoUrl,
      requestedAt: new Date().toISOString(),
      status: "pending",
      subjectId,
      team,
    });
    return "pending";
  }
  persistApprovedPhoto(team, subjectId, photoUrl);
  return "approved";
}

export function applyManagerPhotoOverrides<TSubject extends PhotoSubject>(
  team: ManagerTeam,
  subjects: readonly TSubject[],
): readonly TSubject[] {
  const photos = readManagerPhotoMap(team);
  return subjects.map((subject) => ({
    ...subject,
    photoUrl: photos[subject.id] ?? subject.photoUrl,
  }));
}

export function readManagerPhotoApprovalRequests(): readonly ManagerPhotoApprovalRequest[] {
  if (typeof window === "undefined") return [];
  const rawRequests = window.localStorage.getItem(photoRequestStoreKey);
  if (!rawRequests) return [];
  try {
    const parsed = JSON.parse(rawRequests) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isManagerPhotoApprovalRequest);
  } catch {
    return [];
  }
}

export function decideManagerPhotoApprovalRequest(
  requestId: string,
  status: Exclude<PhotoRequestStatus, "pending">,
): void {
  if (typeof window === "undefined") return;
  const requests = readManagerPhotoApprovalRequests();
  const updatedRequests = requests.map((request) => {
    if (request.id !== requestId) return request;
    if (status === "approved" && request.proposedPhotoUrl) {
      persistApprovedPhoto(request.team, request.subjectId, request.proposedPhotoUrl);
    }
    return { ...request, status };
  });
  window.localStorage.setItem(photoRequestStoreKey, JSON.stringify(updatedRequests));
}

function upsertPendingPhotoRequest(request: ManagerPhotoApprovalRequest): void {
  const requests = readManagerPhotoApprovalRequests();
  const nextRequests = [
    request,
    ...requests.filter((current) => current.id !== request.id),
  ];
  window.localStorage.setItem(photoRequestStoreKey, JSON.stringify(nextRequests));
}

function persistApprovedPhoto(team: ManagerTeam, subjectId: string, photoUrl: string): void {
  const photos = readManagerPhotoMap(team);
  photos[subjectId] = photoUrl;
  window.localStorage.setItem(getPhotoStoreKey(team), JSON.stringify(photos));
}

function readManagerPhotoMap(team: ManagerTeam): Record<string, string> {
  if (typeof window === "undefined") return {};
  const rawPhotos = window.localStorage.getItem(getPhotoStoreKey(team));
  if (!rawPhotos) return {};
  try {
    const parsed = JSON.parse(rawPhotos) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
}

function getPhotoStoreKey(team: ManagerTeam): string {
  return `${photoStoreKeyPrefix}.${team}`;
}

function getPhotoRequestId(team: ManagerTeam, subjectId: string): string {
  return `${team}.${subjectId}`;
}

function isManagerPhotoApprovalRequest(value: unknown): value is ManagerPhotoApprovalRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.id === "string" &&
    typeof request.subjectId === "string" &&
    (request.team === "home" || request.team === "away") &&
    typeof request.playerName === "string" &&
    typeof request.clubName === "string" &&
    typeof request.requestedAt === "string" &&
    (request.status === "pending" || request.status === "approved" || request.status === "rejected")
  );
}
