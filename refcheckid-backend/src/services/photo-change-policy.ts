import type { PhotoVersion } from '../domain/index.js';
export function requiresAnnualPhotoReason(
  versions: readonly PhotoVersion[],
  now = new Date(),
): boolean {
  const approved = versions
    .filter((v) => typeof v.activatedAt === 'string')
    .sort((a, b) => a.versionNumber - b.versionNumber);
  const yearStart = `${now.getUTCFullYear()}-01-01T00:00:00.000Z`;
  return approved.slice(1).some((v) => v.activatedAt! >= yearStart);
}
