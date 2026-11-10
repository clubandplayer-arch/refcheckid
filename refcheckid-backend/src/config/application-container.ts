import { EventDispatcher } from '../events/index.js';
import {
  AuditRepository,
  ClubRepository,
  FederationRepository,
  FederationImportBatchRepository,
  FederationImportRowRepository,
  MatchReportRepository,
  MatchSheetPlayerRepository,
  MatchRepository,
  MatchSheetRepository,
  MatchSheetStaffRepository,
  GlobalOfficialPhotoRepository,
  MatchSheetPhotoSnapshotRepository,
  PhotoAccessGrantRepository,
  PhotoApprovalRepository,
  PhotoAuditEventRepository,
  PhotoRepository,
  PhotoSubjectRepository,
  PhotoSyncCursorRepository,
  PhotoVersionRepository,
  PlayerRepository,
  SeasonRegistrationPhotoRepository,
  RecognitionRepository,
  RefereeRepository,
  RegistrationRepository,
  ReportDraftRepository,
} from '../repositories/index.js';
import {
  AuditService,
  FederationImportService,
  FederationSyncService,
  MatchReportService,
  MatchService,
  MatchSheetService,
  PhotoService,
  RecognitionService,
  LocalPhotoObjectStore,
} from '../services/index.js';
import { pilotMatches, pilotMatchReports, pilotMatchSheets } from './pilot-data.js';
import { storagePath } from './storage-paths.js';
import { RuntimeStore } from '../repositories/runtime-store.js';
import { resolvePhotoMetadataRoot } from '../repositories/photos-repository.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ApplicationContainer {
  readonly store: RuntimeStore;
  readonly events: EventDispatcher;
  readonly repositories: {
    readonly audit: AuditRepository;
    readonly clubs: ClubRepository;
    readonly federations: FederationRepository;
    readonly federationImportBatches: FederationImportBatchRepository;
    readonly federationImportRows: FederationImportRowRepository;
    readonly matches: MatchRepository;
    readonly matchReports: MatchReportRepository;
    readonly reportDrafts: ReportDraftRepository;
    readonly matchSheets: MatchSheetRepository;
    readonly matchSheetPlayers: MatchSheetPlayerRepository;
    readonly matchSheetStaff: MatchSheetStaffRepository;
    readonly photos: PhotoRepository;
    readonly photoSubjects: PhotoSubjectRepository;
    readonly globalOfficialPhotos: GlobalOfficialPhotoRepository;
    readonly seasonRegistrationPhotos: SeasonRegistrationPhotoRepository;
    readonly photoVersions: PhotoVersionRepository;
    readonly photoApprovals: PhotoApprovalRepository;
    readonly matchSheetPhotoSnapshots: MatchSheetPhotoSnapshotRepository;
    readonly photoAccessGrants: PhotoAccessGrantRepository;
    readonly photoAuditEvents: PhotoAuditEventRepository;
    readonly photoSyncCursors: PhotoSyncCursorRepository;
    readonly players: PlayerRepository;
    readonly recognitions: RecognitionRepository;
    readonly referees: RefereeRepository;
    readonly registrations: RegistrationRepository;
  };
  readonly services: {
    readonly audit: AuditService;
    readonly federationImports: FederationImportService;
    readonly federationSync: FederationSyncService;
    readonly matches: MatchService;
    readonly matchReports: MatchReportService;
    readonly matchSheets: MatchSheetService;
    readonly photos: PhotoService;
    readonly recognitions: RecognitionService;
  };
  readonly objectStores: {
    readonly photos: LocalPhotoObjectStore;
  };
}

export function createApplicationContainer(options: { databasePath?: string; seedDemo?: boolean } = {}): ApplicationContainer {
  const test = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  const store = new RuntimeStore(options.databasePath ?? process.env.REFCHECKID_DATABASE_PATH ??
    (test ? ':memory:' : storagePath('refcheckid.sqlite')));
  const seedDemo = options.seedDemo ?? process.env.NODE_ENV !== 'production';
  const legacy = <T>(table: string, file: string): readonly T[] => {
    const root = resolvePhotoMetadataRoot();
    if (store.initialized(table) || root === null || !existsSync(join(root, file))) return [];
    const parsed: unknown = JSON.parse(readFileSync(join(root, file), 'utf8'));
    if (!Array.isArray(parsed) || parsed.some((row: unknown) => !row || typeof row !== 'object' || !('id' in row) || typeof row.id !== 'string')) throw new Error(`Invalid legacy photo metadata: ${file}`);
    return parsed as readonly T[];
  };
  const events = new EventDispatcher();
  const repositories = {
    audit: new AuditRepository(),
    clubs: new ClubRepository(),
    federations: new FederationRepository(),
    federationImportBatches: new FederationImportBatchRepository(),
    federationImportRows: new FederationImportRowRepository(),
    matches: new MatchRepository(seedDemo ? pilotMatches : []),
    matchReports: new MatchReportRepository(seedDemo ? pilotMatchReports : []),
    reportDrafts: new ReportDraftRepository(),
    matchSheets: new MatchSheetRepository(seedDemo ? pilotMatchSheets : []),
    matchSheetPlayers: new MatchSheetPlayerRepository(),
    matchSheetStaff: new MatchSheetStaffRepository(),
    photos: new PhotoRepository(legacy('photos', 'photos.json'), null),
    photoSubjects: new PhotoSubjectRepository(legacy('photo_subjects', 'photo-subjects.json'), null),
    globalOfficialPhotos: new GlobalOfficialPhotoRepository(legacy('global_official_photos', 'global-official-photos.json'), null),
    seasonRegistrationPhotos: new SeasonRegistrationPhotoRepository(legacy('season_registration_photos', 'season-registration-photos.json'), null),
    photoVersions: new PhotoVersionRepository(legacy('photo_versions', 'photo-versions.json'), null),
    photoApprovals: new PhotoApprovalRepository(legacy('photo_approvals', 'photo-approvals.json'), null),
    matchSheetPhotoSnapshots: new MatchSheetPhotoSnapshotRepository(legacy('match_sheet_photo_snapshots', 'match-sheet-photo-snapshots.json'), null),
    photoAccessGrants: new PhotoAccessGrantRepository(legacy('photo_access_grants', 'photo-access-grants.json'), null),
    photoAuditEvents: new PhotoAuditEventRepository(legacy('photo_audit_events', 'photo-audit-events.json'), null),
    photoSyncCursors: new PhotoSyncCursorRepository(legacy('photo_sync_cursors', 'photo-sync-cursors.json'), null),
    players: new PlayerRepository(),
    recognitions: new RecognitionRepository(),
    referees: new RefereeRepository(),
    registrations: new RegistrationRepository(),
  };

  for (const repository of Object.values(repositories)) repository.bindStore(store);

  const objectStores = { photos: new LocalPhotoObjectStore() };
  const photosService = new PhotoService({
    objectStore: objectStores.photos,
    photoSubjects: repositories.photoSubjects,
    globalOfficialPhotos: repositories.globalOfficialPhotos,
    seasonRegistrationPhotos: repositories.seasonRegistrationPhotos,
    photoVersions: repositories.photoVersions,
    photoApprovals: repositories.photoApprovals,
    matchSheetPhotoSnapshots: repositories.matchSheetPhotoSnapshots,
    photoAccessGrants: repositories.photoAccessGrants,
    photoAuditEvents: repositories.photoAuditEvents,
    registrations: repositories.registrations,
  });
  photosService.bindStore(store);

  const services = {
    audit: new AuditService({ auditRepository: repositories.audit, eventPublisher: events }),
    federationImports: new FederationImportService({
      importBatches: repositories.federationImportBatches,
      importRows: repositories.federationImportRows,
      clubs: repositories.clubs,
      players: repositories.players,
      registrations: repositories.registrations,
    }),
    federationSync: new FederationSyncService({
      matchSheetsRepository: repositories.matchSheets,
      clubsRepository: repositories.clubs,
      eventPublisher: events,
      federationsRepository: repositories.federations,
      matchesRepository: repositories.matches,
      playersRepository: repositories.players,
      refereesRepository: repositories.referees,
      registrationsRepository: repositories.registrations,
    }),
    matches: new MatchService({ matchesRepository: repositories.matches, recognitionsRepository: repositories.recognitions, eventPublisher: events }),
    matchReports: new MatchReportService({
      recognitionsRepository: repositories.recognitions,
      matchesRepository: repositories.matches,
      reportsRepository: repositories.matchReports,
      eventPublisher: events,
    }),
    matchSheets: new MatchSheetService({
      matchSheetsRepository: repositories.matchSheets,
      matchSheetPlayersRepository: repositories.matchSheetPlayers,
      matchSheetStaffRepository: repositories.matchSheetStaff,
      photosService,
      playersRepository: repositories.players,
      registrationsRepository: repositories.registrations,
      matchSheetPhotoSnapshotsRepository: repositories.matchSheetPhotoSnapshots,
      matchesRepository: repositories.matches,
      recognitionsRepository: repositories.recognitions,
      reportsRepository: repositories.matchReports,
      reportDraftsRepository: repositories.reportDrafts,
      eventPublisher: events,
    }),
    photos: photosService,
    recognitions: undefined as never,
  };

  const completedServices = {
    ...services,
    recognitions: new RecognitionService({
      photosService,
      matchesRepository: repositories.matches,
      matchSheetPlayersRepository: repositories.matchSheetPlayers,
      matchSheetsRepository: repositories.matchSheets,
      matchSheetStaffRepository: repositories.matchSheetStaff,
      matchSheetPhotoSnapshotsRepository: repositories.matchSheetPhotoSnapshots,
      recognitionsRepository: repositories.recognitions,
      eventPublisher: events,
    }),
  };

  // Direct service callers and HTTP requests share the same transaction boundary.
  for (const [name, service] of Object.entries(completedServices)) {
    const wrapped = new Proxy(service, {
      get(target, property) {
        const value: unknown = Reflect.get(target, property);
        return typeof value === 'function'
          ? (...args: unknown[]) => store.transaction(() => (value as (...args: unknown[]) => Promise<unknown>).apply(target, args))
          : value;
      },
    });
    Object.assign(completedServices, { [name]: wrapped });
  }
  return { store, events, repositories, services: completedServices, objectStores };
}
