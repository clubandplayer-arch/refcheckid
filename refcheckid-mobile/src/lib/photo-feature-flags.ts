declare const process: { env: Record<string, string | undefined> };
export interface PhotoFeatureFlags {
  readonly officialBackendRead: boolean;
  readonly officialBackendUpload: boolean;
  readonly refereeManifest: boolean;
  readonly frozenMatchSnapshot: boolean;
  readonly legacyLocalFallback: boolean;
  readonly dualWriteLegacy: boolean;
}

export interface MobileFeatureFlagSource {
  readonly get?: (name: string) => string | boolean | undefined;
}

function readBooleanFlag(source: MobileFeatureFlagSource | undefined, name: string, defaultValue: boolean): boolean {
  const raw = source?.get?.(name) ?? process.env[`EXPO_PUBLIC_${name.replaceAll('.', '_').toUpperCase()}`] ?? process.env[`NEXT_PUBLIC_${name.replaceAll('.', '_').toUpperCase()}`];
  if (raw === undefined) return defaultValue;
  if (typeof raw === "boolean") return raw;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function getPhotoFeatureFlags(source?: MobileFeatureFlagSource): PhotoFeatureFlags {
  return {
    officialBackendRead: readBooleanFlag(source, "photos.officialBackendRead", true),
    officialBackendUpload: readBooleanFlag(source, "photos.officialBackendUpload", true),
    refereeManifest: readBooleanFlag(source, "photos.refereeManifest", true),
    frozenMatchSnapshot: readBooleanFlag(source, "photos.frozenMatchSnapshot", true),
    legacyLocalFallback: readBooleanFlag(source, "photos.legacyLocalFallback", true),
    dualWriteLegacy: readBooleanFlag(source, "photos.dualWriteLegacy", false),
  };
}
