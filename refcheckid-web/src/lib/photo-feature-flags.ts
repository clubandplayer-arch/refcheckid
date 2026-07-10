export interface PhotoFeatureFlags {
  readonly officialBackendRead: boolean;
  readonly officialBackendUpload: boolean;
  readonly refereeManifest: boolean;
  readonly frozenMatchSnapshot: boolean;
  readonly legacyLocalFallback: boolean;
  readonly dualWriteLegacy: boolean;
}

function readBooleanFlag(name: string, defaultValue: boolean): boolean {
  const value = process.env[`NEXT_PUBLIC_${name.replaceAll('.', '_').toUpperCase()}`];
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function getPhotoFeatureFlags(): PhotoFeatureFlags {
  return {
    officialBackendRead: readBooleanFlag("photos.officialBackendRead", true),
    officialBackendUpload: readBooleanFlag("photos.officialBackendUpload", true),
    refereeManifest: readBooleanFlag("photos.refereeManifest", true),
    frozenMatchSnapshot: readBooleanFlag("photos.frozenMatchSnapshot", true),
    legacyLocalFallback: readBooleanFlag("photos.legacyLocalFallback", true),
    dualWriteLegacy: readBooleanFlag("photos.dualWriteLegacy", false),
  };
}
