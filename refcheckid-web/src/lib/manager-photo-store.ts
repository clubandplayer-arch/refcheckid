import type { ManagerTeam } from "./manager-team";

const photoStoreKeyPrefix = "refcheckid.managerPhotos";

export interface PhotoSubject {
  id: string;
  photoUrl: string | null;
}

export function saveManagerSubjectPhoto(
  team: ManagerTeam,
  subjectId: string,
  photoUrl: string,
): void {
  if (typeof window === "undefined") return;
  const photos = readManagerPhotoMap(team);
  photos[subjectId] = photoUrl;
  window.localStorage.setItem(getPhotoStoreKey(team), JSON.stringify(photos));
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
