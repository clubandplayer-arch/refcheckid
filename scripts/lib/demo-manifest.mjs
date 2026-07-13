import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const arch1DemoManifestPath = path.join(
  repositoryRoot,
  'refcheckid-backend',
  'demo',
  'arch1-demo-manifest.json',
);

export async function loadArch1DemoManifest(manifestPath = arch1DemoManifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  return validateArch1DemoManifest(manifest);
}

export function resolveDemoAssetPath(photo, repositoryRootPath = repositoryRoot) {
  if (!photo || typeof photo.assetPath !== 'string' || photo.assetPath.length === 0) {
    throw new Error('Demo photo entry is missing assetPath');
  }

  return path.resolve(repositoryRootPath, photo.assetPath);
}

export function validateArch1DemoManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('ARCH-1 demo manifest must be an object');
  }

  const requiredArrays = [
    'clubs',
    'referees',
    'players',
    'playerRegistrations',
    'staffMembers',
    'staffRegistrations',
    'matches',
    'matchSheets',
    'matchReports',
    'photos',
  ];

  for (const key of requiredArrays) {
    if (!Array.isArray(manifest[key])) {
      throw new Error(`ARCH-1 demo manifest field ${key} must be an array`);
    }
  }

  if (!manifest.federation?.id) {
    throw new Error('ARCH-1 demo manifest is missing federation.id');
  }

  if (!manifest.seasonId) {
    throw new Error('ARCH-1 demo manifest is missing seasonId');
  }

  assertUniqueIds('players', manifest.players);
  assertUniqueIds('playerRegistrations', manifest.playerRegistrations);
  assertUniqueIds('staffMembers', manifest.staffMembers);
  assertUniqueIds('staffRegistrations', manifest.staffRegistrations);
  assertUniqueIds('photos.subjectId', manifest.photos.map((photo) => ({ id: `${photo.subjectKind}:${photo.subjectId}` })));

  const playerIds = new Set(manifest.players.map((player) => player.id));
  const staffIds = new Set(manifest.staffMembers.map((staffMember) => staffMember.id));
  const registrationIds = new Set([
    ...manifest.playerRegistrations.map((registration) => registration.id),
    ...manifest.staffRegistrations.map((registration) => registration.id),
  ]);

  for (const registration of manifest.playerRegistrations) {
    if (!playerIds.has(registration.playerId)) {
      throw new Error(`Player registration ${registration.id} references unknown player ${registration.playerId}`);
    }
  }

  for (const registration of manifest.staffRegistrations) {
    if (!staffIds.has(registration.staffMemberId)) {
      throw new Error(`Staff registration ${registration.id} references unknown staff member ${registration.staffMemberId}`);
    }
  }

  for (const photo of manifest.photos) {
    if (!registrationIds.has(photo.registrationId)) {
      throw new Error(`Photo ${photo.subjectKind}:${photo.subjectId} references unknown registration ${photo.registrationId}`);
    }

    if (photo.subjectKind === 'athlete' && !playerIds.has(photo.subjectId)) {
      throw new Error(`Athlete photo references unknown player ${photo.subjectId}`);
    }

    if (photo.subjectKind === 'staff_member' && !staffIds.has(photo.subjectId)) {
      throw new Error(`Staff photo references unknown staff member ${photo.subjectId}`);
    }
  }

  return manifest;
}

function assertUniqueIds(label, rows) {
  const seen = new Set();

  for (const row of rows) {
    if (!row.id) {
      throw new Error(`ARCH-1 demo manifest ${label} contains an entry without id`);
    }

    if (seen.has(row.id)) {
      throw new Error(`ARCH-1 demo manifest ${label} contains duplicate id ${row.id}`);
    }

    seen.add(row.id);
  }
}
